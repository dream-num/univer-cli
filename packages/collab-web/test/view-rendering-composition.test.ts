import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");

async function read(relativePath: string): Promise<string> {
  return readFile(resolve(packageRoot, relativePath), "utf8");
}

function occurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

function expectInOrder(source: string, entries: readonly string[]): void {
  let cursor = -1;
  for (const entry of entries) {
    const next = source.indexOf(entry, cursor + 1);
    expect(next, `missing or out-of-order entry: ${entry}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

describe("authoritative Browser View rendering composition", () => {
  it("owns the complete content plugin order and the collaboration extension seam", async () => {
    const preset = await read("render-preset/src/index.ts");

    expectInOrder(preset, [
      "registerBasePlugins(",
      "registerDocPlugins(univer);",
      "registerSheetPlugins(univer);",
      "registerSlidePlugins(univer);",
      "registerBaseUnitPlugins(univer, collaborationOwnsAssetIo);",
      "registerBoardPlugins(univer);",
      "options.registerBeforeEmbedCore?.();",
      "registerOutputPlugins(univer, options.unitType, options.exchangeClientConfig);",
      "registerEmbedCorePlugin(univer, options.resourceRefDataProviderRegistrations ?? []);",
      "options.registerAfterEmbedCore?.();",
      "registerEmbedUIPlugin(univer);"
    ]);
    expect(preset).toContain("...resourceRefDataProviderRegistrations");
    expect(preset).toContain("export function registerViewRendering(");
    expect(preset).not.toMatch(
      /export function register(?:Base|Doc|Sheet|Slide|BaseUnit|Board|Embed)/u
    );
  });

  it("routes both Human viewer modes through the shared rendering entry", async () => {
    const human = await read("collab-web/src/core/viewer.ts");

    expect(occurrences(human, "registerViewRendering(univer, {")).toBe(2);
    expect(human).not.toMatch(
      /register(?:BasePlugins|DocPlugins|SheetPlugins|SlidePlugins|BaseUnitPlugins|BoardPlugins|EmbedPlugins)\(/u
    );
    expectInOrder(human, [
      "registerViewRendering(univer, {",
      "registerBeforeEmbedCore: () => {",
      "univer.registerPlugin(UniverCollaborationPlugin)",
      "univer.registerPlugin(UniverCollaborationClientPlugin",
      "univer.registerPlugin(UniverCollaborationClientUIPlugin,",
      "registerAfterEmbedCore: () => {",
      "univer.registerPlugin(UniverCollaborationEmbedPlugin)"
    ]);
    expect(occurrences(human, "assetIoOwner: ViewAssetIoOwner.CollaborationClient")).toBe(1);
    expect(occurrences(human, "assetIoOwner: ViewAssetIoOwner.Local")).toBe(1);
    expect(occurrences(human, "enableAuthServer: true")).toBe(1);
    expect(occurrences(human, 'loginUrlKey: "/login"')).toBe(1);
    expect(occurrences(human, 'ribbonType: "grid"')).toBe(2);
    expect(occurrences(human, "unitType: toUniverInstanceType(opts.unitType)")).toBe(2);
    expect(occurrences(human, "darkMode: opts.darkMode")).toBe(2);
    expect(occurrences(human, "api.toggleDarkMode(isDarkMode)")).toBe(2);
  });

  it("owns the shared Browser View facade surface", async () => {
    const facades = await read("render-preset/src/facades.ts");
    const human = await read("collab-web/src/core/viewer.ts");

    expect(occurrences(human, 'import "@univer/render-preset/facades";')).toBe(1);
    for (const requiredFacade of [
      "@univerjs/docs/facade",
      "@univerjs-pro/bases/facade",
      "@univerjs-pro/boards/facade",
      "@univerjs-pro/shape-editor/facade",
      "@univerjs-pro/slides/facade"
    ]) {
      expect(facades).toContain(requiredFacade);
      expect(human).not.toContain(`import "${requiredFacade}";`);
    }
    expect(human).toContain('import "@univerjs-pro/collaboration-client/facade";');
  });

  it("requires each composition root to supply its license", async () => {
    const preset = await read("render-preset/src/index.ts");
    const human = await read("collab-web/src/core/viewer.ts");

    expect(preset).toContain("license: string;");
    expect(preset).toContain("univer.registerPlugin(UniverLicensePlugin, { license });");
    expect(preset).not.toContain(
      "univer.registerPlugin(UniverLicensePlugin, { license: TEST_LICENSE });"
    );
    expect(occurrences(human, "license: TEST_LICENSE,")).toBe(2);
  });

  it("gives the Browser viewer one shared Univer UI stylesheet owner", async () => {
    const styles = await read("render-preset/src/styles.css");
    const human = await read("collab-web/src/main.tsx");

    expect(occurrences(human, 'import "@univer/render-preset/styles";')).toBe(1);
    expect(human).toContain("@univerjs-pro/collaboration-client-ui/lib/index.css");
    for (const requiredStyle of [
      "@univerjs-pro/docs-chart-ui/lib/index.css",
      "@univerjs-pro/bases-ui/lib/index.css",
      "@univerjs-pro/boards-ui/lib/index.css",
      "@univerjs-pro/boards-chart-ui/lib/index.css",
      "@univerjs-pro/boards-mind-ui/lib/index.css",
      "@univerjs-pro/boards-table-ui/lib/index.css"
    ]) {
      expect(styles).toContain(requiredStyle);
    }
  });

  it("aligns trunk exchange and all-scope print output plugins with Workspace", async () => {
    const preset = await read("render-preset/src/index.ts");
    const human = await read("collab-web/src/core/viewer.ts");
    const styles = await read("render-preset/src/styles.css");
    const facades = await read("render-preset/src/facades.ts");
    const locale = await read("render-preset/src/locales/generated/en-US.ts");

    expectInOrder(preset, [
      "case UniverInstanceType.UNIVER_SHEET:",
      "univer.registerPlugin(UniverSheetsPrintPlugin)",
      "registerExchange();",
      "univer.registerPlugin(UniverSheetsExchangeClientPlugin)",
      "case UniverInstanceType.UNIVER_DOC:",
      "univer.registerPlugin(UniverDocsExchangeClientPlugin)",
      "univer.registerPlugin(UniverDocsPrintPlugin)",
      "case UniverInstanceType.UNIVER_SLIDE:",
      "univer.registerPlugin(UniverSlidesExchangeClientPlugin)",
      "univer.registerPlugin(UniverSlidesPrintPlugin)",
      "case UniverInstanceType.UNIVER_BASE:",
      "univer.registerPlugin(UniverBasesExchangeClientPlugin)",
      "case UniverInstanceType.UNIVER_BOARD:",
      "univer.registerPlugin(UniverBoardsPrintPlugin)"
    ]);
    expect(human).toContain(
      "opts.worktreeId === undefined && opts.unitType !== UNIT_TYPE_BOARD"
    );
    expect(human).toContain("getTaskServerUrl: urls.getTaskServerUrl");
    expect(human).toContain("importServerUrl: urls.importServerUrl");
    expect(human).toContain("exportServerUrl: urls.exportServerUrl");
    for (const packageName of [
      "bases-exchange-client",
      "boards-print",
      "docs-exchange-client",
      "docs-print",
      "sheets-exchange-client",
      "sheets-print",
      "slides-exchange-client",
      "slides-print"
    ]) {
      expect(`${styles}\n${facades}\n${locale}`).toContain(`@univerjs-pro/${packageName}`);
    }
    expectInOrder(styles, [
      "@univerjs-pro/chart-ui/lib/index.css",
      "@univerjs-pro/docs-callout-ui/lib/index.css",
      "@univerjs-pro/docs-chart-ui/lib/index.css",
      "@univerjs-pro/docs-code-ui/lib/index.css",
      "@univerjs-pro/docs-latex-ui/lib/index.css",
      "@univerjs-pro/docs-print/lib/index.css",
      "@univerjs-pro/docs-list-ui/lib/index.css",
      "@univerjs-pro/docs-quote-ui/lib/index.css",
      "@univerjs-pro/docs-shape-ui/lib/index.css",
      "@univerjs-pro/docs-table-ui/lib/index.css"
    ]);
    expect(styles).toContain("@univerjs-pro/shape-editor-ui/lib/index.css");
    expectInOrder(styles, [
      "@univerjs-pro/slides-ui/lib/index.css",
      "@univerjs-pro/slides-chart-ui/lib/index.css",
      "@univerjs-pro/slides-print/lib/index.css",
      "@univerjs-pro/slides-table-ui/lib/index.css"
    ]);
    expectInOrder(styles, [
      "@univerjs-pro/bases-ui/lib/index.css",
      "@univerjs-pro/bases-exchange-client/lib/index.css"
    ]);
  });

  it("registers the standard SDK history UI for every trunk Unit type", async () => {
    const human = await read("collab-web/src/core/viewer.ts");
    const styles = await read("collab-web/src/styles.css");
    const locale = await read("collab-web/src/core/locales/generated/en-US.ts");
    const manifest = await read("collab-web/package.json");

    expect(occurrences(human, "if (opts.worktreeId === undefined) {")).toBe(1);
    expectInOrder(human, [
      "if (opts.worktreeId === undefined) {",
      "univer.registerPlugin(UniverDocsHistoryUIPlugin, historyConfig)",
      "univer.registerPlugin(UniverSlidesHistoryUIPlugin, historyConfig)",
      "univer.registerPlugin(UniverBasesHistoryUIPlugin, historyConfig)",
      "univer.registerPlugin(UniverBoardsHistoryUIPlugin, historyConfig)",
      "univer.registerPlugin(UniverSheetsHistoryUIPlugin, {"
    ]);
    expect(human).toContain("historyServerUrl: urls.historyListServerUrl");
    expect(human).toContain("historyListServerUrl: urls.historyListServerUrl");

    for (const packageName of [
      "bases-history-ui",
      "boards-history-ui",
      "docs-history-ui",
      "edit-history-ui",
      "sheets-history-ui",
      "slides-history-ui"
    ]) {
      expect(`${manifest}\n${locale}`).toContain(`@univerjs-pro/${packageName}`);
    }
    for (const packageName of ["bases-history-ui", "boards-history-ui", "edit-history-ui", "sheets-history-ui"]) {
      expect(styles).toContain(`@univerjs-pro/${packageName}/lib/index.css`);
    }
  });

  it("locks document scrolling around the Human viewer shell", async () => {
    const styles = await read("collab-web/src/styles.css");

    expect(styles).toMatch(/html,\s*body,\s*#app\s*\{/u);
    expect(styles).toContain("overflow: hidden;");
    expect(styles).toContain("overscroll-behavior: none;");
    expect(styles).toContain("html.gateway-dark {");
    expect(styles).toContain("--color-background: #0a0a0a;");
  });
});
