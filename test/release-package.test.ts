import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInsidersVersion,
  createLocalVersion,
  createReleaseManifest,
  INSIDERS_REGISTRY,
} from "../scripts/release/release-package.mjs";

describe("insiders release package", () => {
  it("derives the channel version without mutating the development manifest", () => {
    expect(createInsidersVersion("0.5.0", "20260813", "374ec99")).toBe(
      "0.5.0-insiders.20260813-374ec99",
    );
  });

  it("marks local consumer tarballs when the worktree is dirty", () => {
    expect(createLocalVersion("0.5.0", "374ec99", false)).toBe("0.5.0-local.374ec99");
    expect(createLocalVersion("0.5.0", "374ec99", true)).toBe("0.5.0-local.374ec99.dirty");
  });

  it("publishes only audited runtime dependencies without workspace protocols", () => {
    const manifest = createReleaseManifest(
      {
        name: "univer-cli",
        version: "0.5.0",
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
      "0.5.0-insiders.20260813-374ec99",
      ["external"],
    );

    expect(manifest).toMatchObject({
      bin: { univer: "dist/bin.js" },
      name: "univer-cli",
      private: false,
      dependencies: { external: "1.2.3" },
      publishConfig: { registry: INSIDERS_REGISTRY, tag: "insiders" },
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
      "0.5.0-insiders.20260813-374ec99",
      audit.required,
    );

    expect(Object.keys(manifest.dependencies)).toEqual(audit.required);
    expect(audit.required).toEqual([
      "@univer-cli/doc-typst-facade",
      "@univer-cli/headless-univer",
      "@univer-cli/univer-collaboration-runtime",
      "@univer-cli/univer-collaboration-runtime-pool",
      "@univerjs-pro/cli-assets",
      "@univerjs-pro/engine-formula-rust-binding",
      "@univerjs-pro/uexcli",
      "busboy",
      "libsql",
    ]);
    expect(audit.conditional).toEqual(["bufferutil", "proxy-agent", "utf-8-validate", "yauzl"]);
  });
});
