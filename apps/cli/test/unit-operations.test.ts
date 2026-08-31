import type { ContentInspectionResult } from "@univer-cli/content-inspection";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { createProgram } from "../src/program.js";
import type { LocalUnitContentApplication } from "../src/features/unit-content/service.js";
import { unitKindFromType, unitTypeFromKind } from "../src/features/unit/protocol.js";
import type { LocalUnitApplication } from "../src/features/unit/service.js";
import type { LocalWorktreeApplication } from "../src/features/worktree/service.js";

type LocalUnitOperationsApplications = LocalWorktreeApplication &
  LocalUnitApplication &
  LocalUnitContentApplication;

describe("Local Worktree and Unit operations", () => {
  it("maps every supported Lite Unit kind to the Collaboration wire type", () => {
    expect(
      ["doc", "sheet", "slide", "base", "board"].map((kind) =>
        unitTypeFromKind(kind as "doc" | "sheet" | "slide" | "base" | "board"),
      ),
    ).toEqual([1, 2, 3, 5, 6]);
    expect([1, 2, 3, 5, 6].map(unitKindFromType)).toEqual([
      "doc",
      "sheet",
      "slide",
      "base",
      "board",
    ]);
  });

  it("advertises the confirmed Worktree surface and SDK inspection grammar", () => {
    const application = fakeUnitOperations({});
    const program = createProgram({
      unitApplication: application,
      unitContentApplication: application,
      worktreeApplication: application,
    });
    const worktree = program.commands.find((command) => command.name() === "worktree");
    const inspect = program.commands.find((command) => command.name() === "inspect");
    const execute = program.commands.find((command) => command.name() === "execute");

    expect(worktree?.commands.map((command) => command.name())).toEqual([
      "add",
      "list",
      "ready",
      "reopen",
      "discard",
      "merge",
    ]);
    expect(worktree?.helpInformation()).not.toContain("rollback");
    expect(worktree?.helpInformation()).not.toContain("log");
    expect(inspect?.helpInformation()).toContain("<target> <arguments...>");
    expect(inspect?.helpInformation()).toContain("--trunk");
    expect(inspect?.helpInformation()).toContain("--worktree <id>");
    expect(execute?.helpInformation()).toContain("-e, --code <code>");
  });

  it("exposes Worktree and Unit lifecycle results without a success wrapper", async () => {
    const calls: unknown[] = [];
    const editing = fakeUnitOperations({
      async createWorktree(input) {
        calls.push(input);
        return {
          agentId: "",
          baseline: {},
          createdAt: "2026-08-12T00:00:00.000Z",
          filePath: "/tmp/book.univer",
          name: "agent work",
          status: "draft",
          worktreeId: "wt-1",
        };
      },
      async createUnit(input) {
        calls.push(input);
        return {
          filePath: "/tmp/book.univer",
          headRev: 1,
          kind: "sheet",
          name: "Plan",
          type: 2,
          unitId: "unit-1",
          worktreeId: "wt-1",
        };
      },
    });

    const worktree = await invoke(
      ["worktree", "add", "book.univer", "--name", "agent work", "--json"],
      editing,
    );
    expect(worktree.exitCode).toBe(0);
    expect(JSON.parse(worktree.stdout)).toEqual({
      agentId: "",
      baseline: {},
      createdAt: "2026-08-12T00:00:00.000Z",
      filePath: "/tmp/book.univer",
      name: "agent work",
      status: "draft",
      worktreeId: "wt-1",
    });

    const unit = await invoke(
      [
        "unit",
        "add",
        "book.univer",
        "--worktree",
        "wt-1",
        "--type",
        "sheet",
        "--name",
        "Plan",
        "--json",
      ],
      editing,
    );
    expect(unit.exitCode).toBe(0);
    expect(JSON.parse(unit.stdout)).toMatchObject({ unitId: "unit-1", kind: "sheet" });
    expect(calls).toEqual([
      { name: "agent work", path: "book.univer" },
      { kind: "sheet", name: "Plan", path: "book.univer", worktreeId: "wt-1" },
    ]);
  });

  it("uses the SDK execution preparation input and inspection query grammar", async () => {
    let execution: unknown;
    let inspection: unknown;
    const editing = fakeUnitOperations({
      async execute(input) {
        execution = input;
        return {
          committed: true,
          filePath: "/tmp/book.univer",
          revision: 2,
          unitId: "unit-1",
          value: "written",
          worktreeId: "wt-1",
        };
      },
      async inspect(input) {
        inspection = input;
        if (input.query.kind === "base") return baseInspection();
        if (input.query.kind === "board") return boardInspection();
        return rangeInspection();
      },
    });

    const executed = await invoke(
      [
        "execute",
        "book.univer",
        "--worktree",
        "wt-1",
        "--unit",
        "unit-1",
        "-e",
        "return 'written';",
        "--json",
      ],
      editing,
    );
    expect(executed.exitCode).toBe(0);
    expect(JSON.parse(executed.stdout)).toMatchObject({ committed: true, revision: 2 });
    expect(execution).toEqual({
      code: "return 'written';",
      path: "book.univer",
      unitId: "unit-1",
      worktreeId: "wt-1",
    });

    const inspected = await invoke(
      [
        "inspect",
        "range",
        "A1:B2",
        "book.univer",
        "--worksheet",
        "name:Plan",
        "--unit",
        "unit-1",
        "--worktree",
        "wt-1",
        "--json",
      ],
      editing,
    );
    expect(inspected.exitCode).toBe(0);
    expect(JSON.parse(inspected.stdout)).toEqual(rangeInspection());
    expect(inspection).toEqual({
      path: "book.univer",
      query: {
        kind: "worksheet-range",
        ranges: [{ range: "A1:B2", worksheet: { name: "Plan" } }],
      },
      unitId: "unit-1",
      worktreeId: "wt-1",
    });

    const inspectedBase = await invoke(
      ["inspect", "base", "book.univer", "--unit", "base-1", "--worktree", "wt-1", "--json"],
      editing,
    );
    expect(inspectedBase.exitCode).toBe(0);
    expect(JSON.parse(inspectedBase.stdout)).toEqual(baseInspection());
    expect(inspection).toEqual({
      path: "book.univer",
      query: { kind: "base" },
      unitId: "base-1",
      worktreeId: "wt-1",
    });

    const inspectedBoard = await invoke(
      ["inspect", "board", "book.univer", "--unit", "board-1", "--worktree", "wt-1", "--json"],
      editing,
    );
    expect(inspectedBoard.exitCode).toBe(0);
    expect(JSON.parse(inspectedBoard.stdout)).toEqual(boardInspection());
    expect(inspection).toEqual({
      path: "book.univer",
      query: { kind: "board" },
      unitId: "board-1",
      worktreeId: "wt-1",
    });
  });

  it("returns stable machine failures for missing inspection scope and merge conflicts", async () => {
    const editing = fakeUnitOperations({
      async mergeWorktree() {
        throw Object.assign(new Error("merge conflict on unit-1"), {
          code: "WORKTREE_MERGE_CONFLICT",
          details: { failedUnit: "unit-1", worktreeId: "wt-1" },
        });
      },
    });

    const missingScope = await invoke(
      ["inspect", "workbook", "book.univer", "--unit", "unit-1", "--json"],
      editing,
    );
    expect(missingScope.exitCode).toBe(1);
    expect(JSON.parse(missingScope.stderr)).toEqual({
      error: {
        code: "INSPECTION_SCOPE_REQUIRED",
        message: "Specify --trunk or --worktree <id>",
      },
      ok: false,
    });

    const conflict = await invoke(
      ["worktree", "merge", "book.univer", "--worktree", "wt-1", "--json"],
      editing,
    );
    expect(conflict.exitCode).toBe(1);
    expect(JSON.parse(conflict.stderr)).toEqual({
      error: {
        code: "WORKTREE_MERGE_CONFLICT",
        details: { failedUnit: "unit-1", worktreeId: "wt-1" },
        message: "merge conflict on unit-1",
      },
      ok: false,
    });
  });
});

async function invoke(
  argv: readonly string[],
  application: LocalUnitOperationsApplications,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const exitCode = await runCli(argv, {
    program: {
      unitApplication: application,
      unitContentApplication: application,
      worktreeApplication: application,
    },
    streams: {
      writeErr: (text) => stderr.push(text),
      writeOut: (text) => stdout.push(text),
    },
  });
  return { exitCode, stderr: stderr.join(""), stdout: stdout.join("") };
}

function fakeUnitOperations(
  overrides: Partial<LocalUnitOperationsApplications>,
): LocalUnitOperationsApplications {
  return {
    async createWorktree({ path }) {
      return {
        agentId: "",
        baseline: {},
        createdAt: "2026-08-12T00:00:00.000Z",
        filePath: path,
        name: "",
        status: "draft",
        worktreeId: "wt-1",
      };
    },
    async listWorktrees({ path }) {
      return { filePath: path, worktrees: [] };
    },
    async readyWorktree({ path, worktreeId }) {
      return { filePath: path, status: "ready", worktreeId };
    },
    async reopenWorktree({ path, worktreeId }) {
      return { filePath: path, status: "draft", worktreeId };
    },
    async mergeWorktree({ path, worktreeId }) {
      return { filePath: path, revisions: {}, status: "merged", worktreeId };
    },
    async discardWorktree({ path, worktreeId }) {
      return { filePath: path, status: "discarded", worktreeId };
    },
    async createUnit({ kind, name, path, worktreeId }) {
      return { filePath: path, headRev: 1, kind, name, type: 2, unitId: "unit-1", worktreeId };
    },
    async removeUnit({ path, unitId, worktreeId }) {
      return { filePath: path, removed: true, unitId, worktreeId };
    },
    async listUnits({ path, worktreeId }) {
      return {
        filePath: path,
        scope: worktreeId === undefined ? "trunk" : "worktree",
        units: [],
        ...(worktreeId === undefined ? {} : { worktreeId }),
      };
    },
    async execute({ path, unitId, worktreeId }) {
      return { committed: false, filePath: path, unitId, value: null, worktreeId };
    },
    async inspect() {
      return rangeInspection();
    },
    ...overrides,
  };
}

function rangeInspection(): ContentInspectionResult {
  return {
    kind: "worksheet-range",
    ranges: [
      {
        cellData: [[{ v: "written" }]],
        clipped: false,
        displayValues: [["written"]],
        requestedRange: "A1:B2",
        resolvedRange: "A1:B2",
        worksheet: { id: "sheet-1", index: 0, name: "Plan" },
      },
    ],
    unitId: "unit-1",
  };
}

function baseInspection(): ContentInspectionResult {
  return {
    kind: "base",
    name: "Customer orders",
    tables: [
      {
        fields: [
          {
            config: {},
            id: "customer-name",
            index: 0,
            isReadonly: false,
            name: "Customer name",
            type: "text",
          },
        ],
        formulaName: "Customers",
        id: "customers",
        index: 0,
        name: "Customers",
        primaryFieldId: "customer-name",
        recordCount: 1,
        views: [{ id: "customer-grid", index: 0, name: "All customers", type: "grid" }],
      },
    ],
    unitId: "base-1",
  };
}

function boardInspection(): ContentInspectionResult {
  return {
    elementCounts: { byType: { shape: 1 }, total: 1 },
    elements: [
      {
        bounds: { height: 100, left: 80, top: 80, width: 180 },
        id: "shape-1",
        locked: false,
        orderIndex: 0,
        selectable: true,
        text: "Review",
        transform: { height: 100, left: 80, top: 80, width: 180 },
        type: "shape",
        visible: true,
      },
    ],
    kind: "board",
    name: "Planning Board",
    themeData: {},
    unitId: "board-1",
  };
}
