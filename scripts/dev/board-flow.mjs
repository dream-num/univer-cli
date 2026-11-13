import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Exercise the source CLI against a new file and an isolated daemon home. */
export function verifyBoardFlow({ root, evidence, env, cliArgs }) {
  const file = join(evidence, "board.univer");
  let sequence = 0;
  function run(args, expected = [0], parseJson = true) {
    const result = spawnSync(process.execPath, [...cliArgs, ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
    });
    const name = `${String(++sequence).padStart(2, "0")}-${args[0]}`;
    writeFileSync(join(evidence, `${name}.stdout`), result.stdout ?? "");
    writeFileSync(join(evidence, `${name}.stderr`), result.stderr ?? "");
    writeFileSync(
      join(evidence, `${name}.json`),
      JSON.stringify({ args, exitCode: result.status, error: result.error?.message }, null, 2),
    );
    process.stdout.write(`${name}: ${result.status}\n`);
    assert.ok(expected.includes(result.status), `${name} failed; inspect ${evidence}`);
    if (result.status === 2) {
      assert.equal(result.stdout, "");
      const failure = JSON.parse(result.stderr);
      assert.equal(failure.error.code, "UNIT_LAYOUT_LINT_BOARD_FAILED");
      return failure.error.details.report;
    }
    return result.stdout?.trim()
      ? parseJson
        ? JSON.parse(result.stdout)
        : result.stdout.trim()
      : undefined;
  }

  let failure;
  try {
    run(["new", file, "--json"]);
    const { worktreeId } = run([
      "worktree",
      "add",
      file,
      "--name",
      "Board local dev verification",
      "--json",
    ]);
    const { unitId } = run([
      "unit",
      "add",
      file,
      "--worktree",
      worktreeId,
      "--type",
      "board",
      "--json",
    ]);
    const execute = (script, name) => {
      const path = join(evidence, `${name}.js`);
      writeFileSync(path, script);
      return run([
        "execute",
        file,
        "--worktree",
        worktreeId,
        "--unit",
        unitId,
        "--script",
        path,
        "--json",
      ]);
    };
    const layoutReference = run(["api", "show", "FBoard.planLayout"], [0], false);
    assert.ok(layoutReference.includes("planLayout"));
    const authored = execute(
      `
const names = ["Client", "API", "Database"];
const nodes = board.insertShapes(names.map((name, index) => ({
  shapeType: api.Enum.ShapeTypeEnum.Rect,
  transform: { left: index * 20, top: index * 20, width: 180, height: 80 }
})));
if (!nodes) throw new Error("Cannot create nodes");
nodes.forEach((node, index) => node.getText().setText(names[index]));
const edges = board.insertConnectors([
  { fromElementId: nodes[0].getId(), toElementId: nodes[1].getId() },
  { fromElementId: nodes[1].getId(), toElementId: nodes[2].getId() }
]);
if (!edges) throw new Error("Cannot create relations");
if (!board.setConnectorLabels(edges[0].id, [
  { id: "request", content: "request", placement: { mode: "fixed", anchor: "path", pathRatio: 0.5 } },
  { id: "response", content: "response", placement: { mode: "fixed", anchor: "path", pathRatio: 0.5 } }
])) throw new Error("Cannot create independent labels");
return { connectorId: edges[0].id };`,
      "author",
    );
    const { connectorId } = authored.value;
    assert.equal(typeof connectorId, "string");
    assert.ok(connectorId.length);
    const graphPlan = () => {
      const report = run(
        [
          "lint",
          "--file",
          file,
          "--worktree",
          worktreeId,
          "--unit",
          unitId,
          "--mode",
          "rendered",
          "--plan",
          "graph",
          "--plan-options",
          JSON.stringify({ layerGap: 200 }),
          "--json",
        ],
        [0, 2],
      );
      assert.equal(report.analyses.length, 1);
      const plan = report.analyses[0].plan;
      assert.equal(plan?.status, "ready", JSON.stringify(plan?.diagnostics));
      assert.ok(plan.patches.length, "Graph plan must move or route the authored diagram");
      return plan;
    };
    const stale = graphPlan();
    const staleAttempt = execute(
      `
const note = board.insertShape({
  shapeType: api.Enum.ShapeTypeEnum.Rect,
  transform: { left: 1000, top: 1000, width: 120, height: 60 }
});
if (!note) throw new Error("Cannot create intervening edit");
note.getText().setText("Audit");
return board.applyLayoutPlan(${JSON.stringify(stale)});`,
      "reject-stale-graph-plan",
    );
    assert.equal(staleAttempt.value, false);
    const current = graphPlan();
    const applied = execute(
      `return board.applyLayoutPlan(${JSON.stringify(current)});`,
      "apply-graph-plan",
    );
    assert.equal(applied.value, true);
    const lint = () =>
      run(
        [
          "lint",
          "--file",
          file,
          "--worktree",
          worktreeId,
          "--unit",
          unitId,
          "--mode",
          "both",
          "--plan-labels",
          "--plan-ports",
          "--json",
        ],
        [0, 2],
      );
    const before = lint();
    assert.equal(before.coverage.complete, true);
    assert.equal(before.status, "findings");
    assert.ok(before.findings.some((finding) => finding.rule === "connector-label-collision"));
    const portPlans = before.analyses.map((page) => page.portPlan);
    assert.ok(portPlans.every((plan) => plan?.status === "ready"));
    assert.ok(portPlans.every((plan) => plan.patches.length === 0));
    const pinnedPlans = before.analyses.map((page) => page.labelPlan);
    assert.ok(pinnedPlans.every((plan) => plan?.status === "incomplete"));
    assert.ok(pinnedPlans.every((plan) => plan.patches.every((patch) => !patch.labels?.length)));
    assert.deepEqual(
      pinnedPlans
        .flatMap((plan) =>
          plan.diagnostics.flatMap((diagnostic) => {
            assert.equal(diagnostic.code, "label-layout/pinned");
            return diagnostic.labelIds;
          }),
        )
        .sort(),
      ["request", "response"],
    );
    const rejectedPins = execute(
      `return ${JSON.stringify(pinnedPlans)}.map(plan => board.applyLayoutPlan(plan));`,
      "reject-pinned-plan",
    );
    assert.ok(rejectedPins.value.every((accepted) => accepted === false));
    const automatic = execute(
      `
const id = ${JSON.stringify(connectorId)};
const before = board.getConnectorLabels(id);
if (!board.setConnectorLabels(id, before.map(label => ({ ...label, placement: { mode: "auto" } }))))
  throw new Error("Cannot enable automatic labels");
const automatic = board.getConnectorLabels(id);
if (!await board.undo()) throw new Error("Cannot undo automatic label edit");
const undone = board.getConnectorLabels(id);
if (!await board.redo()) throw new Error("Cannot redo automatic label edit");
return { before, automatic, undone, redone: board.getConnectorLabels(id) };`,
      "automatic-labels",
    );
    assert.ok(automatic.value.before.every((label) => label.placement?.mode === "fixed"));
    assert.ok(automatic.value.automatic.every((label) => label.placement?.mode === "auto"));
    assert.deepEqual(automatic.value.undone, automatic.value.before);
    assert.deepEqual(automatic.value.redone, automatic.value.automatic);
    const unlocked = lint();
    const plans = unlocked.analyses.map((page) => page.labelPlan);
    assert.ok(plans.every((plan) => plan?.status === "ready"));
    const repair = execute(
      `return ${JSON.stringify(plans)}.map(plan => board.applyLayoutPlan(plan));`,
      "repair",
    );
    assert.ok(repair.value.every(Boolean));
    const after = lint();
    assert.equal(after.coverage.complete, true);
    assert.equal(after.status, "clean");
    run(["worktree", "ready", file, "--worktree", worktreeId, "--json"]);
    run(["worktree", "merge", file, "--worktree", worktreeId, "--json"]);
    const trunk = run(["inspect", "board", file, "--unit", unitId, "--trunk", "--json"]);
    assert.deepEqual(trunk.elementCounts, { total: 6, byType: { shape: 4, connector: 2 } });
    const texts = new Map(trunk.elements.map((element) => [element.id, element.text]));
    assert.deepEqual(
      trunk.elements
        .filter((element) => element.type === "shape")
        .map((element) => element.text)
        .sort(),
      ["API", "Audit", "Client", "Database"],
    );
    assert.deepEqual(
      trunk.elements
        .filter((element) => element.type === "connector")
        .map((element) => [texts.get(element.startElementId), texts.get(element.endElementId)])
        .sort(),
      [
        ["API", "Database"],
        ["Client", "API"],
      ],
    );
    const labelled = trunk.elements.find((element) => element.connectorLabels?.length);
    assert.deepEqual(
      labelled.connectorLabels.map(({ id, text }) => ({ id, text })),
      [
        { id: "request", text: "request" },
        { id: "response", text: "response" },
      ],
    );
    const incomplete = run(
      ["lint", "--file", file, "--unit", unitId, "--mode", "model", "--json"],
      [2],
    );
    assert.equal(incomplete.status, "incomplete");
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify(
        {
          file,
          worktreeId,
          unitId,
          authored,
          before,
          automatic,
          unlocked,
          after,
          trunk,
          incomplete,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    failure = error;
  }
  try {
    run(["daemon", "stop", "--json"]);
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], "Board flow and own daemon shutdown failed")
      : error;
  }
  if (failure) throw failure;
}
