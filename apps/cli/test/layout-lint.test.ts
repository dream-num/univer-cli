import type { LocalRenderApplication } from "../src/features/render/service.js";
import { runCli } from "../src/cli.js";
import { describe, expect, it } from "vitest";

describe("Local layout lint command", () => {
  it("adds Local file and Worktree targeting to the SDK lint grammar", async () => {
    const loaded: unknown[] = [];
    const linted: unknown[] = [];
    const application = fakeRender({
      layoutLint: {
        async lint(input) {
          linted.push(input);
          return {
            kind: "unit-layout-lint",
            unitId: input.unitData.id,
            unitType: "slide",
            coverage: {
              pages: [
                { page: 1, pageId: "cover" },
                { page: 3, pageId: "page-3" },
                { page: 4, pageId: "page-4" },
              ],
              rules: ["text-off-page", "text-escapes-container", "text-overlaps-text"],
            },
            findings: [],
          };
        },
      },
      async loadLayoutLintSource(input) {
        loaded.push(input);
        return {
          unitType: "slide",
          unitData: {
            id: input.unitId,
            name: "Deck",
            slideOrder: ["cover", "page-2", "page-3", "page-4"],
            slides: {},
          },
        } as never;
      },
    });

    const result = await invoke(
      [
        "lint",
        "--file",
        "deck.univer",
        "--worktree",
        "review",
        "--unit",
        "slide-1",
        "--pages",
        "1,3-4",
        "--json",
      ],
      application,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(loaded).toEqual([{ path: "deck.univer", unitId: "slide-1", worktreeId: "review" }]);
    expect(linted[0]).toMatchObject({ pages: [1, 3, 4], unitType: "slide" });
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: "unit-layout-lint",
      unitId: "slide-1",
      findings: [],
    });
  });

  it("defaults to trunk and preserves SDK page validation", async () => {
    const loaded: unknown[] = [];
    const application = fakeRender({
      async loadLayoutLintSource(input) {
        loaded.push(input);
        return {
          unitType: "slide",
          unitData: { id: input.unitId, name: "Deck", slideOrder: [], slides: {} },
        } as never;
      },
    });

    const invalid = await invoke(
      ["lint", "--file", "deck.univer", "--unit", "slide-1", "--pages", "2-1", "--json"],
      application,
    );
    expect(invalid.exitCode).toBe(1);
    expect(JSON.parse(invalid.stderr)).toMatchObject({
      ok: false,
      error: { code: "unit-layout-lint.failed" },
    });
    expect(loaded).toEqual([]);

    const valid = await invoke(
      ["lint", "--file", "deck.univer", "--unit", "slide-1", "--json"],
      application,
    );
    expect(valid.exitCode).toBe(0);
    expect(loaded).toEqual([{ path: "deck.univer", unitId: "slide-1" }]);
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
      return { ok: true, outputs: [], unitId: input.unitId ?? "unit-1", unitKind: "slide" };
    },
    layoutLint: {
      async lint(input) {
        return {
          kind: "unit-layout-lint",
          unitId: input.unitData.id,
          unitType: "slide",
          coverage: { pages: [], rules: [] },
          findings: [],
        };
      },
    },
    createTextMeasurer() {
      return {
        source: "fake",
        async measureLine() {
          return { width: 1, ascent: 1, descent: 0 };
        },
        async close() {},
      };
    },
    async loadLayoutLintSource(input) {
      return {
        unitType: "slide",
        unitData: { id: input.unitId, name: "Deck", slideOrder: [], slides: {} },
      } as never;
    },
    ...overrides,
  };
}
