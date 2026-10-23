import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Exercise the source CLI against a new file and an isolated daemon home. */
export function verifyBoardFlow({ root, evidence, env, cliArgs }) {
  const file = join(evidence, "board.univer");
  let sequence = 0;
  function run(args, expected = [0]) {
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
    return result.stdout?.trim() ? JSON.parse(result.stdout) : undefined;
  }

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
  { id: "request", content: "request" },
  { id: "response", content: "response" }
])) throw new Error("Cannot create independent labels");
const stale = board.planGraphLayout({ layerGap: 200 });
const note = board.insertShape({
  shapeType: api.Enum.ShapeTypeEnum.Rect,
  transform: { left: 1000, top: 1000, width: 120, height: 60 }
});
if (!note) throw new Error("Cannot create intervening edit");
note.getText().setText("Audit");
const rejected = board.applyLayoutPlan(stale) === false;
const plan = board.planGraphLayout({ layerGap: 200 });
return { rejected, applied: board.applyLayoutPlan(plan), status: plan.status };`,
      "author",
    );
    assert.deepEqual(authored.value, { rejected: true, applied: true, status: "ready" });
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
          "--json",
        ],
        [0, 2],
      );
    const before = lint();
    const plans = before.analyses.map((page) => page.labelPlan);
    assert.ok(plans.every((plan) => plan?.status === "ready"));
    assert.ok(plans.some((plan) => plan.patches.some((patch) => patch.labels?.length)));
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
          after,
          trunk,
          incomplete,
        },
        null,
        2,
      ),
    );
  } finally {
    run(["daemon", "stop", "--json"]);
  }
}
