import { describe, expect, it } from "vitest";
import {
  EXTERNAL_DEPENDENCY_WHITELIST,
  externalDependencyAudit,
} from "../apps/cli/scripts/release-dependencies.mjs";

function metafileWith(...imports) {
  return {
    outputs: {
      "out.js": {
        imports: imports.map(([path, kind = "import-statement"]) => ({
          external: true,
          kind,
          path,
        })),
      },
    },
  };
}

describe("external dependency whitelist", () => {
  it("reports the whitelist as required and dynamic imports as conditional", () => {
    const audit = externalDependencyAudit([
      metafileWith(["libsql"], ["@univerjs-pro/cli-assets"], ["node:fs"]),
      metafileWith(["ws", "dynamic-import"], ["typescript", "dynamic-import"]),
    ]);
    expect(audit.required).toEqual([...EXTERNAL_DEPENDENCY_WHITELIST].sort());
    expect(audit.conditional).toEqual(["typescript", "ws"]);
  });

  it("fails the build when an unlisted package stays external", () => {
    expect(() => externalDependencyAudit([metafileWith(["@univer-cli/headless-univer"])])).toThrow(
      /not on the release whitelist/u,
    );
  });
});
