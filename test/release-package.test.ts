import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReleaseManifest } from "../scripts/release/release-package.mjs";
import { RELEASE_REGISTRY } from "../scripts/release/policy.mjs";

describe("release package", () => {
  it("publishes only audited runtime dependencies without workspace protocols", () => {
    const manifest = createReleaseManifest(
      {
        name: "univer-cli",
        version: "0.0.0",
        private: true,
        description: "CLI",
        keywords: ["univer"],
        bin: { univer: "./dist/bin.js" },
        engines: { node: ">=22.12.0" },
        dependencies: {
          bundled: "workspace:*",
          external: "1.2.3",
        },
      },
      "0.5.0-insider.20260817-374ec99",
      ["external"],
      { registry: RELEASE_REGISTRY, tag: "insiders" },
    );

    expect(manifest).toMatchObject({
      bin: { univer: "dist/bin.js" },
      name: "univer-cli",
      private: false,
      dependencies: { external: "1.2.3" },
      publishConfig: { registry: RELEASE_REGISTRY, tag: "insiders" },
      version: "0.5.0-insider.20260817-374ec99",
    });
    expect(JSON.stringify(manifest)).not.toContain("workspace:");
  });

  it("matches the external dependency audit emitted by the real build", async () => {
    const root = process.cwd();
    const source = JSON.parse(await readFile(join(root, "apps", "cli", "package.json"), "utf8"));
    const audit = JSON.parse(
      await readFile(join(root, "apps", "cli", "dist", "release-dependencies.json"), "utf8"),
    );
    const manifest = createReleaseManifest(
      source,
      "0.5.0-insider.20260817-374ec99",
      audit.required,
      { registry: RELEASE_REGISTRY, tag: "insiders" },
    );

    expect(source).toMatchObject({ private: true, version: "0.0.0" });
    expect(Object.keys(manifest.dependencies)).toEqual(audit.required);
    expect(audit.required).toEqual([
      "@univer-cli/doc-typst-facade",
      "@univer-cli/headless-univer",
      "@univer-cli/univer-collaboration-runtime",
      "@univer-cli/univer-collaboration-runtime-pool",
      "@univerjs-pro/cli-assets",
      "@univerjs-pro/engine-formula-rust-binding",
      "@univerjs-pro/exchange-node-binding",
      "@univerjs/core",
      "busboy",
      "libsql",
    ]);
    expect(audit.conditional).toEqual(["bufferutil", "proxy-agent", "utf-8-validate", "yauzl"]);
  });
});
