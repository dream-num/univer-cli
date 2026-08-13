import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The real viewer needs a browser (Path2D, canvas), so — as with the composition-order suite —
// these are source-level guards over how the Univer instance is configured.
const viewerPath = resolve(import.meta.dirname, "../src/core/viewer.ts");
const readViewer = (): Promise<string> => readFile(viewerPath, "utf8");

describe("viewer locale wiring", () => {
  it("loads only the requested language pack when each Univer is created", async () => {
    const source = await readViewer();
    expect([
      ...source.matchAll(/const localePack = await loadViewerLocale\(opts\.locale\);/gu)
    ]).toHaveLength(2);
    expect([...source.matchAll(/locales: \{ \[opts\.locale\]: localePack \}/gu)]).toHaveLength(2);
    expect(source).not.toContain("const LOCALES");
  });

  it("takes the active locale from its options rather than hardcoding one", async () => {
    const source = await readViewer();
    const localeFields = [...source.matchAll(/^ {4}locale: (.+),$/gmu)].map((m) => m[1] as string);
    expect(localeFields.length, "expected the live and preview viewers").toBe(2);
    for (const field of localeFields) {
      expect(field).toBe("opts.locale");
    }
  });

  it("keeps the shell's i18n out of the viewer", async () => {
    // The viewer speaks the SDK's LocaleType only; the language decision belongs to the caller,
    // so the render runtime and other hosts can drive it independently of the shell's state.
    const source = await readViewer();
    expect(source).not.toMatch(/from "\.\.\/i18n/u);
  });

  it("hot-switches live and preview viewers through the public Facade", async () => {
    const source = await readViewer();
    expect([...source.matchAll(/api\.loadLocales\(locale, pack\);/gu)]).toHaveLength(2);
    expect([...source.matchAll(/api\.setLocale\(locale\);/gu)]).toHaveLength(2);
  });

  it("treats load*Async completion as the initial snapshot barrier", async () => {
    const source = await readViewer();
    expect(source).not.toContain("waitSynced");
    expect(source).not.toContain("getCollaborationStatus");
    expect(source).not.toContain("Date.now() + 12000");
    expect(source).not.toContain("collaboration.flush(");
  });

  it("disposes Facade subscriptions before their Univer injectors", async () => {
    const source = await readViewer();
    const disposeBodies = [
      ...source.matchAll(
        /dispose: \(\) => \{(?<beforeFacade>[\s\S]*?)api\.dispose\(\);\s+univer\.dispose\(\);\s+\}/gu
      )
    ];
    expect(disposeBodies).toHaveLength(2);
    for (const match of disposeBodies) {
      expect(match.groups?.beforeFacade).toContain("disposeDebugEndpoint();");
    }
    expect(disposeBodies[0]?.groups?.beforeFacade).toContain(
      "formulaResultAppliedSubscription.unsubscribe();"
    );
    expect(disposeBodies[0]?.groups?.beforeFacade).toContain(
      "sheetResourceRefDataProvider.dispose();"
    );
  });
});
