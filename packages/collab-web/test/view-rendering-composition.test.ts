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
      "registerAfterEmbedCore: () => {",
      "univer.registerPlugin(UniverCollaborationEmbedPlugin)"
    ]);
    expect(occurrences(human, "assetIoOwner: ViewAssetIoOwner.CollaborationClient")).toBe(1);
    expect(occurrences(human, "assetIoOwner: ViewAssetIoOwner.Local")).toBe(1);
    expect(occurrences(human, "enableAuthServer: true")).toBe(1);
    expect(occurrences(human, 'loginUrlKey: "/login"')).toBe(1);
    expect(occurrences(human, 'ribbonType: "grid"')).toBe(2);
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

  it("locks document scrolling around the Human viewer shell", async () => {
    const styles = await read("collab-web/src/styles.css");

    expect(styles).toMatch(/html,\s*body,\s*#app\s*\{/u);
    expect(styles).toContain("overflow: hidden;");
    expect(styles).toContain("overscroll-behavior: none;");
    expect(styles).toContain("html.gateway-dark {");
    expect(styles).toContain("--color-background: #0a0a0a;");
  });
});
