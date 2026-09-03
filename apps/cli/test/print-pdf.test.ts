import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import type { LocalRenderApplication } from "../src/features/render/service.js";

describe("Local print-pdf command", () => {
  it("maps Local Univerfile addressing to Unit PDF output", async () => {
    const calls: unknown[] = [];
    const result = await invoke(
      [
        "print-pdf",
        "book.univer",
        "reports/book.pdf",
        "--worktree",
        "review",
        "--unit",
        "sheet-1",
        "--json",
      ],
      fakeRender({
        async printPdf(input) {
          calls.push(input);
          return {
            location: "/workspace/reports/book.pdf",
            ok: true,
            pageCount: 4,
            unitId: "sheet-1",
            unitKind: "sheet",
          };
        },
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([
      {
        destination: "reports/book.pdf",
        path: "book.univer",
        unitId: "sheet-1",
        worktreeId: "review",
      },
    ]);
    expect(JSON.parse(result.stdout)).toEqual({
      location: "/workspace/reports/book.pdf",
      ok: true,
      pageCount: 4,
      unitId: "sheet-1",
      unitKind: "sheet",
    });
  });

  it("prints the output path in human-readable mode", async () => {
    const result = await invoke(
      ["print-pdf", "book.univer", "book.pdf"],
      fakeRender({
        async printPdf() {
          return {
            location: "/workspace/book.pdf",
            ok: true,
            pageCount: 1,
            unitId: "doc-1",
            unitKind: "doc",
          };
        },
      }),
    );

    expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "/workspace/book.pdf\n" });
  });
});

async function invoke(
  argv: readonly string[],
  renderApplication: LocalRenderApplication,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const exitCode = await runCli(argv, {
    program: { renderApplication },
    streams: {
      writeErr: (text) => stderr.push(text),
      writeOut: (text) => stdout.push(text),
    },
  });
  return { exitCode, stderr: stderr.join(""), stdout: stdout.join("") };
}

function fakeRender(overrides: Partial<LocalRenderApplication> = {}): LocalRenderApplication {
  return {
    browserSetup: {
      async install() {
        return {
          alreadyInstalled: false,
          buildId: "test",
          cacheDir: "/cache",
          executablePath: "/chrome",
        };
      },
      async probe() {},
      async resolve() {
        return { status: "found", source: "system", executablePath: "/chrome" };
      },
    },
    async capture(input) {
      return { ok: true, outputs: [], unitId: input.unitId ?? "unit-1", unitKind: "sheet" };
    },
    createTextMeasurer() {
      return {
        source: "fake",
        async close() {},
        async measureLine() {
          return { ascent: 1, descent: 0, width: 1 };
        },
      };
    },
    layoutLint: {
      async lint(input) {
        return {
          coverage: { pages: [], rules: [] },
          findings: [],
          kind: "unit-layout-lint",
          unitId: input.unitData.id,
          unitType: "slide",
        };
      },
    },
    async loadLayoutLintSource() {
      return {
        unitData: { id: "slide-1", name: "Deck", slideOrder: [], slides: {} },
        unitType: "slide",
      } as never;
    },
    async printPdf(input) {
      return {
        location: input.destination,
        ok: true,
        pageCount: 1,
        unitId: input.unitId ?? "unit-1",
        unitKind: "sheet",
      };
    },
    ...overrides,
  };
}
