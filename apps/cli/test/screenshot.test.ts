import type {
  UniverPrintPdfRuntime,
  UniverRenderRuntime,
  UniverSlideLayoutRuntime,
  UniverRenderUnit,
  UniverTextMeasureRuntime,
} from "@univer-cli/univer-render-runtime";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApplicationConfig } from "../src/environment/config.js";
import {
  createLocalRenderApplication,
  type LocalRenderApplication,
  type LocalRenderSource,
} from "../src/features/render/service.js";
import { runCli } from "../src/cli.js";

describe("Local screenshot command", () => {
  it("maps the SDK Sheet, Slide, and Board selector grammar onto a Local target", async () => {
    const captures: unknown[] = [];
    const application = fakeRender({
      async capture(input) {
        captures.push(input);
        return {
          ok: true,
          unitId: input.unitId ?? "unit-1",
          unitKind: "sheet",
          outputs: [
            {
              height: 20,
              location: "/tmp/view.png",
              mediaType: "image/png",
              name: "view.png",
              width: 30,
            },
          ],
        };
      },
    });

    const sheet = await invoke(
      [
        "screenshot",
        "book.univer",
        "--worktree",
        "w1",
        "--unit",
        "sheet-1",
        "--sheet",
        "Data",
        "--range",
        "B2:C4",
        "--out",
        "shots",
        "--json",
      ],
      application,
    );
    expect(sheet.exitCode).toBe(0);
    expect(JSON.parse(sheet.stdout)).toMatchObject({ ok: true, unitId: "sheet-1" });
    expect(captures[0]).toEqual({
      destination: "shots",
      path: "book.univer",
      target: { kind: "sheet-range", range: "B2:C4", sheetName: "Data" },
      unitId: "sheet-1",
      worktreeId: "w1",
    });

    expect(
      (
        await invoke(
          [
            "screenshot",
            "book.univer",
            "--unit",
            "slide-1",
            "--pages",
            "1,3-4,cover",
            "--contact-slide",
            "--tile",
            "2x2",
          ],
          application,
        )
      ).exitCode,
    ).toBe(0);
    expect(captures[1]).toMatchObject({
      target: {
        kind: "slide-pages",
        pages: [1, 3, 4, "cover"],
        contactSheet: { tile: { columns: 2, rows: 2 } },
      },
    });

    expect(
      (
        await invoke(
          [
            "screenshot",
            "book.univer",
            "--unit",
            "board-1",
            "--elements",
            "node-a,node-b",
            "--padding",
            "24",
            "--scale",
            "2",
          ],
          application,
        )
      ).exitCode,
    ).toBe(0);
    expect(captures[2]).toMatchObject({
      target: {
        kind: "board-content",
        elementIds: ["node-a", "node-b"],
        padding: 24,
        scale: 2,
      },
    });
  });

  it("uses the SDK browser setup command and cache-neutral setup result", async () => {
    const probes: string[] = [];
    const application = fakeRender({
      browserSetup: {
        async install() {
          throw new Error("install should not run");
        },
        async probe({ executablePath }) {
          probes.push(executablePath);
        },
        async resolve() {
          return { status: "found", source: "system", executablePath: "/chrome" };
        },
      },
    });
    const result = await invoke(["screenshot", "setup", "--json"], application);

    expect(result.exitCode).toBe(0);
    expect(probes).toEqual(["/chrome"]);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      status: "resolved",
      source: "system",
      executablePath: "/chrome",
    });
  });

  it("rejects selector families before opening the render runtime", async () => {
    const result = await invoke(
      ["screenshot", "book.univer", "--range", "A1", "--pages", "1", "--json"],
      fakeRender(),
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: "SCREENSHOT_INPUT_INVALID",
        message: "Sheet, Slide, and Board selector options cannot be combined",
      },
    });
  });
});

describe("Local render application", () => {
  it("loads a daemon render source, uses the SDK screenshot capability, and writes PNG outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-render-app-"));
    const renderCalls: unknown[] = [];
    let closeCount = 0;
    const runtime: UniverPrintPdfRuntime &
      UniverRenderRuntime &
      UniverSlideLayoutRuntime &
      UniverTextMeasureRuntime = {
      async captureSlideLayout(input) {
        const pages = input.pages ?? [1];
        return {
          pages: pages.map((page) => ({
            elements: [],
            page,
            pageHeight: 540,
            pageId: "slide-page-1",
            pageWidth: 960,
          })),
        };
      },
      async close() {
        closeCount += 1;
      },
      async composeContactSheet() {
        return { bytes: Uint8Array.from([3]), height: 1, width: 1 };
      },
      async getDocumentPageCount() {
        return 1;
      },
      async measureText() {
        return {
          actualHeight: 12,
          actualWidth: 42,
          firstLineAscent: 9,
          firstLineDescent: 3,
          lineCount: 1,
        };
      },
      async printPdf() {
        return { bytes: new TextEncoder().encode("%PDF-1.7\ntest"), pageCount: 2 };
      },
      async render(input) {
        renderCalls.push(input);
        return { bytes: Uint8Array.from([1, 2, 3]), height: 20, width: 30 };
      },
    };
    const source: LocalRenderSource = {
      async load(input) {
        if (input.unitId === "slide-1") return slideSource();
        if (input.unitId === "base-1") return baseSource();
        return sheetSource();
      },
    };
    const paths = {
      configPath: join(root, "config.json"),
      daemonDir: join(root, "daemon"),
      homeDir: root,
      socketPath: join(root, "daemon", "daemon.sock"),
    };
    const application = createLocalRenderApplication({
      browserCacheRoot: join(root, "browsers"),
      browserRuntimeRoot: join(root, "runtime"),
      config: createApplicationConfig(paths),
      env: { UNIVER_LICENSE: "test-license" },
      source,
      async runtimeFactory() {
        return runtime;
      },
    });

    try {
      const result = await application.capture({
        cwd: root,
        destination: "shots",
        path: "book.univer",
        target: { kind: "sheet-range", range: "A1:B2", sheetName: "Sheet1" },
      });
      expect(result).toMatchObject({ ok: true, unitId: "sheet-1", unitKind: "sheet" });
      expect(result.outputs[0]).toMatchObject({
        height: 20,
        name: "Sheet1-A1-B2.png",
        width: 30,
      });
      expect(await readFile(result.outputs[0]!.location)).toEqual(Buffer.from([1, 2, 3]));
      expect(renderCalls).toHaveLength(1);

      const printed = await application.printPdf({
        cwd: root,
        destination: "reports/book.pdf",
        path: "book.univer",
      });
      expect(printed).toMatchObject({
        location: join(root, "reports/book.pdf"),
        pageCount: 2,
        unitId: "sheet-1",
        unitKind: "sheet",
      });
      expect(await readFile(printed.location, "utf8")).toBe("%PDF-1.7\ntest");
      await expect(
        application.printPdf({ cwd: root, destination: "book.txt", path: "book.univer" }),
      ).rejects.toMatchObject({ code: "UNIT_PRINT_PDF_OUTPUT_INVALID" });
      await expect(
        application.printPdf({
          cwd: root,
          destination: "base.pdf",
          path: "book.univer",
          unitId: "base-1",
        }),
      ).rejects.toMatchObject({ code: "UNIT_PRINT_PDF_TYPE_UNSUPPORTED" });
      expect(closeCount).toBe(2);

      const measurer = application.createTextMeasurer();
      expect(
        await measurer.measureLine({
          runs: [
            { text: "Hello", fontSizePx: 16, bold: false, italic: false, fontFamily: "Arial" },
          ],
        }),
      ).toEqual({ width: 42, ascent: 9, descent: 3 });
      await measurer.close();
      expect(closeCount).toBe(3);

      const lintSource = await application.loadLayoutLintSource({
        cwd: root,
        path: "book.univer",
        unitId: "slide-1",
        worktreeId: "review",
      });
      const lint = await application.layoutLint.lint({ ...lintSource, pages: [1] });
      expect(lint).toMatchObject({
        kind: "unit-layout-lint",
        unitId: "slide-1",
        coverage: { pages: [{ page: 1, pageId: "slide-page-1" }] },
        findings: [],
      });
      expect(closeCount).toBe(4);
      await expect(
        application.loadLayoutLintSource({
          cwd: root,
          path: "book.univer",
          unitId: "sheet-1",
        }),
      ).rejects.toMatchObject({ code: "UNIT_LAYOUT_LINT_TYPE_UNSUPPORTED" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
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
    async loadLayoutLintSource() {
      return {
        unitType: "slide",
        unitData: { id: "slide-1", name: "Deck", slideOrder: [], slides: {} },
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

function sheetSource(): UniverRenderUnit {
  return {
    unitType: "sheet",
    unitData: {
      id: "sheet-1",
      appVersion: "1.0.0",
      locale: 0,
      name: "Sheet",
      sheetOrder: ["sheet-page-1"],
      sheets: {
        "sheet-page-1": {
          id: "sheet-page-1",
          name: "Sheet1",
          rowCount: 10,
          columnCount: 10,
          cellData: {},
        },
      },
      styles: {},
    },
  } as unknown as UniverRenderUnit;
}

function slideSource(): UniverRenderUnit {
  return {
    unitType: "slide",
    unitData: {
      id: "slide-1",
      name: "Deck",
      slideOrder: ["slide-page-1"],
      slides: {
        "slide-page-1": { id: "slide-page-1", elements: [], pageElements: {} },
      },
    },
  } as unknown as UniverRenderUnit;
}

function baseSource(): UniverRenderUnit {
  return {
    unitData: { id: "base-1", name: "Base" },
    unitType: "base",
  } as unknown as UniverRenderUnit;
}
