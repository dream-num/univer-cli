import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import type { LocalExchangeApplication } from "../src/features/exchange/service.js";

describe("Local data exchange commands", () => {
  it("infers import type, preserves direct result JSON, and targets trunk by default", async () => {
    let input: unknown;
    const result = await invoke(
      [
        "import",
        "book.univer",
        "--file",
        "inventory.csv",
        "--formula-calculation",
        "when_empty",
        "--json",
      ],
      fakeExchange({
        async importFile(value) {
          input = value;
          return {
            filePath: "/tmp/book.univer",
            kind: "sheet",
            name: "inventory",
            scope: "trunk",
            sourcePath: "/tmp/inventory.csv",
            type: 2,
            unitId: "unit-1",
          };
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: "sheet",
      scope: "trunk",
      unitId: "unit-1",
    });
    expect(input).toEqual({
      formulaCalculationMode: "when_empty",
      kind: "sheet",
      name: "inventory",
      path: "book.univer",
      sourcePath: "inventory.csv",
    });
  });

  it("imports into an explicit draft Worktree and allows Base type override", async () => {
    let input: unknown;
    const result = await invoke(
      [
        "import",
        "book.univer",
        "--file",
        "records.xlsx",
        "--type",
        "base",
        "--name",
        "Records",
        "--worktree",
        "wt-1",
        "--json",
      ],
      fakeExchange({
        async importFile(value) {
          input = value;
          return {
            filePath: "/tmp/book.univer",
            kind: "base",
            name: "Records",
            scope: "worktree",
            sourcePath: "/tmp/records.xlsx",
            type: 5,
            unitId: "base-1",
            worktreeId: "wt-1",
          };
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(input).toEqual({
      kind: "base",
      name: "Records",
      path: "book.univer",
      sourcePath: "records.xlsx",
      worktreeId: "wt-1",
    });
  });

  it("infers a remote source from its URL pathname and preserves its useful name", async () => {
    let input: unknown;
    const source = "https://files.example.test/reports/Quarter%20Plan.docx?signature=secret";
    const result = await invoke(
      ["import", "book.univer", "--file", source, "--json"],
      fakeExchange({
        async importFile(value) {
          input = value;
          return {
            filePath: "/tmp/book.univer",
            kind: value.kind,
            name: value.name,
            scope: "trunk",
            sourcePath: value.sourcePath,
            type: 1,
            unitId: "doc-1",
          };
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(input).toEqual({
      kind: "doc",
      name: "Quarter Plan",
      path: "book.univer",
      sourcePath: source,
    });
  });

  it("rejects local and remote .univer containers as exchange sources", async () => {
    const application = fakeExchange({
      async importFile() {
        throw new Error("application must not be called");
      },
    });
    for (const source of ["source.univer", "https://files.example.test/source.univer?token=1"]) {
      const result = await invoke(
        ["import", "book.univer", "--file", source, "--type", "sheet", "--json"],
        application,
      );
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stderr)).toMatchObject({
        ok: false,
        error: { code: "IMPORT_SOURCE_UNIVERFILE_REJECTED" },
      });
    }
  });

  it("exports a selected Unit with delimited options and rejects unsupported suffixes", async () => {
    let input: unknown;
    const application = fakeExchange({
      async exportFile(value) {
        input = value;
        return {
          filePath: "/tmp/book.univer",
          kind: "doc",
          outputPath: "/tmp/result.docx",
          scope: "worktree",
          type: 1,
          unitId: "doc-1",
          worktreeId: "wt-1",
        };
      },
    });
    const exported = await invoke(
      ["export", "book.univer", "result.docx", "--worktree", "wt-1", "--unit", "doc-1", "--json"],
      application,
    );
    expect(exported.exitCode).toBe(0);
    expect(input).toEqual({
      outputPath: "result.docx",
      path: "book.univer",
      unitId: "doc-1",
      worktreeId: "wt-1",
    });

    const delimited = await invoke(
      [
        "export",
        "book.univer",
        "result.csv",
        "--unit",
        "sheet-1",
        "--sheet",
        "Inventory",
        "--formula-calculation",
        "forced",
        "--json",
      ],
      application,
    );
    expect(delimited.exitCode).toBe(0);
    expect(input).toEqual({
      formulaCalculationMode: "forced",
      outputPath: "result.csv",
      path: "book.univer",
      sheetName: "Inventory",
      unitId: "sheet-1",
    });

    input = undefined;
    const unsupported = await invoke(
      ["export", "book.univer", "result.pdf", "--json"],
      application,
    );
    expect(unsupported.exitCode).toBe(1);
    expect(JSON.parse(unsupported.stderr)).toMatchObject({
      error: { code: "EXPORT_FORMAT_UNSUPPORTED" },
      ok: false,
    });
    expect(input).toBeUndefined();
  });

  it("uses Commander validation for formula modes and mutually exclusive selectors", async () => {
    const application = fakeExchange({});
    const invalidMode = await invoke(
      ["import", "book.univer", "--file", "book.xlsx", "--formula-calculation", "sometimes"],
      application,
    );
    expect(invalidMode.exitCode).toBe(1);
    expect(invalidMode.stderr).toContain("Allowed choices are forced, when_empty, no");

    const conflictingSelectors = await invoke(
      ["export", "book.univer", "result.tsv", "--sheet", "Sheet1", "--table", "Tasks"],
      application,
    );
    expect(conflictingSelectors.exitCode).toBe(1);
    expect(conflictingSelectors.stderr).toContain("cannot be used with option '--table <name>'");
  });
});

async function invoke(
  argv: readonly string[],
  application: LocalExchangeApplication,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const exitCode = await runCli(argv, {
    program: { exchangeApplication: application },
    streams: {
      writeErr: (text) => stderr.push(text),
      writeOut: (text) => stdout.push(text),
    },
  });
  return { exitCode, stderr: stderr.join(""), stdout: stdout.join("") };
}

function fakeExchange(overrides: Partial<LocalExchangeApplication>): LocalExchangeApplication {
  return {
    async importFile(input) {
      return {
        filePath: input.path,
        kind: input.kind,
        name: input.name,
        scope: input.worktreeId === undefined ? "trunk" : "worktree",
        sourcePath: input.sourcePath,
        type: 2,
        unitId: "unit-1",
        ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
      };
    },
    async exportFile(input) {
      return {
        filePath: input.path,
        kind: "sheet",
        outputPath: input.outputPath,
        scope: input.worktreeId === undefined ? "trunk" : "worktree",
        type: 2,
        unitId: input.unitId ?? "unit-1",
        ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
      };
    },
    ...overrides,
  };
}
