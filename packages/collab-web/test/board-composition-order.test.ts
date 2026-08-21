import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import shapeEditorUIEnUS from "@univerjs-pro/shape-editor-ui/locale/en-US";
import { describe, expect, it } from "vitest";

function expectInOrder(source: string, entries: readonly string[]): void {
  let cursor = -1;
  for (const entry of entries) {
    const next = source.indexOf(entry, cursor + 1);
    expect(next, `missing or out-of-order entry: ${entry}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe("version-matched Board composition", () => {
  it("keeps the browser Facades and stable plugins in univer-pro reference order", async () => {
    const viewer = await readFile(resolve(import.meta.dirname, "../src/core/viewer.ts"), "utf8");
    const facades = await readFile(
      resolve(import.meta.dirname, "../../render-preset/src/facades.ts"),
      "utf8"
    );
    const preset = await readFile(
      resolve(import.meta.dirname, "../../render-preset/src/index.ts"),
      "utf8"
    );
    const enLocale = await readFile(
      resolve(import.meta.dirname, "../../render-preset/src/locales/generated/en-US.ts"),
      "utf8"
    );

    expectInOrder(facades, [
      'import "@univerjs-pro/boards/facade"',
      'import "@univerjs-pro/boards-chart/facade"',
      'import "@univerjs-pro/boards-mind/facade"',
      'import "@univerjs-pro/boards-table/facade"',
      'import "@univerjs-pro/ink/facade"',
      'import "@univerjs-pro/exchange-client/facade"',
      'import "@univerjs-pro/docs-latex/facade"'
    ]);
    expect(viewer).toContain('import "@univer/render-preset/facades";');
    expect(viewer).toContain('import "@univerjs-pro/collaboration-client/facade";');
    expectInOrder(preset, [
      "univer.registerPlugin(UniverBoardsPlugin)",
      "univer.registerPlugin(UniverInkPlugin)",
      "univer.registerPlugin(UniverInkUIPlugin)",
      "univer.registerPlugin(UniverBoardsUIPlugin",
      "univer.registerPlugin(UniverBoardsChartPlugin)",
      "univer.registerPlugin(UniverBoardsChartUIPlugin)",
      "univer.registerPlugin(UniverBoardsMindPlugin)",
      "univer.registerPlugin(UniverBoardsMindUIPlugin)",
      "univer.registerPlugin(UniverBoardsTablePlugin)",
      "univer.registerPlugin(UniverBoardsTableUIPlugin)"
    ]);
    expectInOrder(enLocale, [
      "@univerjs-pro/shape-editor-ui/locale/en-US",
      "@univerjs-pro/ink-ui/locale/en-US",
      "@univerjs-pro/boards-ui/locale/en-US",
      "@univerjs-pro/boards-chart-ui/locale/en-US",
      "@univerjs-pro/boards-mind-ui/locale/en-US",
      "@univerjs-pro/boards-table-ui/locale/en-US"
    ]);
    expect(shapeEditorUIEnUS["shape-editor-ui"].textEditor.placeholder).toBe("Enter text");
    expect(`${viewer}\n${preset}`).not.toMatch(/packages-experimental|UniverDebuggerPlugin/u);
    expect(viewer).not.toContain("univer.registerPlugin(UniverNetworkPlugin");
    expect(viewer).not.toContain("ISocketService");
    expect(viewer).not.toContain("WebSocketService");
    expect(viewer).not.toContain("univer.__getInjector().add(");
    expect(viewer).toContain("univer.registerPlugin(UniverCollaborationClientUIPlugin, {");
    expect(viewer).not.toMatch(
      /if \(opts\.unitType === UNIT_TYPE_BOARD\) \{\s+univer\.registerPlugin\(UniverCollaborationClientUIPlugin\);/u
    );
    expect(viewer).toContain("assetIoOwner: ViewAssetIoOwner.CollaborationClient");
    expect(viewer).toContain("assetIoOwner: ViewAssetIoOwner.Local");
    expect(viewer).toContain(
      'workbenchChrome: opts.unitType === UNIT_TYPE_BOARD ? "hidden" : "visible"'
    );
    expect(preset).toContain("{ header: false, toolbar: false, headerMenu: false, footer: false }");
  });

  it("loads Board UI styles and complete viewer locales", async () => {
    const styles = await readFile(
      resolve(import.meta.dirname, "../../render-preset/src/styles.css"),
      "utf8"
    );
    for (const requiredStyle of [
      "@univerjs-pro/chart-ui/lib/index.css",
      "@univerjs-pro/shape-editor-ui/lib/index.css",
      "@univerjs-pro/ink-ui/lib/index.css",
      "@univerjs-pro/docs-latex-ui/lib/index.css"
    ]) {
      expect(styles).toContain(requiredStyle);
    }
    expectInOrder(styles, [
      "@univerjs-pro/boards-chart-ui/lib/index.css",
      "@univerjs-pro/boards-mind-ui/lib/index.css",
      "@univerjs-pro/boards-print/lib/index.css",
      "@univerjs-pro/boards-table-ui/lib/index.css",
      "@univerjs-pro/boards-ui/lib/index.css"
    ]);
    const main = await readFile(resolve(import.meta.dirname, "../src/main.tsx"), "utf8");
    const viewerLocale = await readFile(
      resolve(import.meta.dirname, "../src/core/locales/generated/en-US.ts"),
      "utf8"
    );
    expect(main).toContain("@univerjs-pro/collaboration-client-ui/lib/index.css");
    expect(viewerLocale).toContain("@univerjs-pro/collaboration-client-ui/locale/en-US");
    expect(viewerLocale).toContain("@univerjs-pro/exchange-client/locale/en-US");
  });
});
