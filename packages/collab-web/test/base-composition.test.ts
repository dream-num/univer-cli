import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("version-matched Base composition", () => {
  it("keeps the Base facade, plugins, locale, and stylesheet assembled", async () => {
    const styles = await readFile(
      resolve(import.meta.dirname, "../../render-preset/src/styles.css"),
      "utf8"
    );
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

    expect(facades).toContain("@univerjs-pro/bases/facade");
    expect(preset).toContain("univer.registerPlugin(UniverBasesPlugin)");
    expect(preset).toContain("univer.registerPlugin(\n    UniverBasesUIPlugin,");
    expect(preset).toContain(
      "collaborationOwnsAssetIo ? { override: [[IAttachmentIoService, null]] } : undefined"
    );
    expect(enLocale).toContain("@univerjs-pro/bases-ui/locale/en-US");
    expect(styles).toContain("@univerjs-pro/bases-ui/lib/index.css");
  });
});
