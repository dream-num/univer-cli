import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sheetsUIZhCN from "@univerjs/sheets-ui/locale/zh-CN";
import shapeEditorUIZhCN from "@univerjs-pro/shape-editor-ui/locale/zh-CN";
import { describe, expect, it } from "vitest";

const localePath = (locale: string): string =>
  resolve(import.meta.dirname, `../../render-preset/src/locales/generated/${locale}.ts`);

function importedPackages(source: string, locale: string): string[] {
  return [...source.matchAll(new RegExp(`from "([^"]+)/locale/${locale}"`, "gu"))].map(
    (match) => match[1] as string
  );
}

describe("render-preset content locales", () => {
  it("merges every locale from the same packages, in the same order", async () => {
    const en = importedPackages(await readFile(localePath("en-US"), "utf8"), "en-US");
    const zh = importedPackages(await readFile(localePath("zh-CN"), "utf8"), "zh-CN");

    expect(en.length).toBeGreaterThan(50);
    expect(zh).toEqual(en);
    expect(new Set(en).size, "duplicate packages in generated locale").toBe(en.length);
  });

  it("keeps Machine View's static English authority while other locales stay dynamic", async () => {
    const en = await readFile(localePath("en-US"), "utf8");
    const machineLocale = await readFile(
      resolve(import.meta.dirname, "../../render-preset/src/machine-locale.ts"),
      "utf8"
    );
    const loader = await readFile(
      resolve(import.meta.dirname, "../../render-preset/src/locales/generated/load.ts"),
      "utf8"
    );

    expect(en).toContain("export const CONTENT_EN_US = locale");
    expect(machineLocale).toContain('export { CONTENT_EN_US } from "./locales/generated/en-US.js"');
    expect([...loader.matchAll(/import\("\.\/[^"]+\.js"\)/gu)]).toHaveLength(17);
  });

  it("pulls real Chinese copy from the SDK's zh-CN entrypoints", () => {
    expect(shapeEditorUIZhCN["shape-editor-ui"].textEditor.placeholder).toMatch(/[一-鿿]/u);
    expect(JSON.stringify(sheetsUIZhCN)).toMatch(/[一-鿿]/u);
  });
});
