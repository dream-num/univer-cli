import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReleaseManifest, stageReleasePackage } from "../scripts/release/release-package.mjs";
import { RELEASE_REGISTRY } from "../scripts/release/policy.mjs";

describe("release package", () => {
  it("publishes only audited runtime dependencies without workspace protocols", () => {
    const manifest = createReleaseManifest(
      {
        name: "univer-cli",
        version: "0.0.0",
        private: true,
        description: "CLI",
        license: "Apache-2.0",
        repository: {
          type: "git",
          url: "git+https://github.com/dream-num/univer-cli.git",
          directory: "apps/cli",
        },
        homepage: "https://github.com/dream-num/univer-cli",
        bugs: { url: "https://github.com/dream-num/univer-cli/issues" },
        keywords: ["univer"],
        bin: { univer: "./dist/bin.js" },
        engines: { node: ">=22.12.0" },
        dependencies: {
          bundled: "workspace:*",
          external: "1.2.3",
        },
      },
      "0.5.0-insiders.20260817-374ec99",
      ["external"],
      { registry: RELEASE_REGISTRY, tag: "insiders" },
    );

    expect(manifest).toMatchObject({
      bin: { univer: "dist/bin.js" },
      name: "univer-cli",
      private: false,
      dependencies: { external: "1.2.3" },
      files: ["dist", "LICENSE", "README.md", "README.zh-CN.md"],
      license: "Apache-2.0",
      publishConfig: { registry: RELEASE_REGISTRY, tag: "insiders" },
      repository: {
        type: "git",
        url: "git+https://github.com/dream-num/univer-cli.git",
        directory: "apps/cli",
      },
      version: "0.5.0-insiders.20260817-374ec99",
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
      "0.5.0-insiders.20260817-374ec99",
      audit.required,
      { registry: RELEASE_REGISTRY, tag: "insiders" },
    );

    expect(source).toMatchObject({ license: "Apache-2.0", private: true, version: "0.0.0" });
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

  it("stages the repository license and both readmes", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-cli-release-package-"));
    const distPath = join(root, "dist");
    const outputRoot = join(root, "output");
    const sourceManifestPath = join(root, "package.json");
    const dependencyAuditPath = join(root, "release-dependencies.json");
    const licensePath = join(root, "LICENSE");
    const readmePath = join(root, "README.md");
    const readmeZhCnPath = join(root, "README.zh-CN.md");
    try {
      await mkdir(distPath);
      await Promise.all([
        writeFile(join(distPath, "bin.js"), "export {};\n"),
        writeFile(
          sourceManifestPath,
          `${JSON.stringify({
            bugs: { url: "https://github.com/dream-num/univer-cli/issues" },
            dependencies: {},
            description: "CLI",
            engines: { node: ">=22.12.0" },
            homepage: "https://github.com/dream-num/univer-cli",
            keywords: ["univer"],
            license: "Apache-2.0",
            name: "univer-cli",
            repository: {
              directory: "apps/cli",
              type: "git",
              url: "git+https://github.com/dream-num/univer-cli.git",
            },
          })}\n`,
        ),
        writeFile(dependencyAuditPath, '{"conditional":[],"required":[]}\n'),
        writeFile(licensePath, "Apache License\n"),
        writeFile(readmePath, "# Univer CLI\n"),
        writeFile(readmeZhCnPath, "# Univer CLI\n"),
      ]);
      const staged = await stageReleasePackage({
        dependencyAuditPath,
        distPath,
        licensePath,
        outputRoot,
        publishConfig: { registry: RELEASE_REGISTRY, tag: "insiders" },
        readmePath,
        readmeZhCnPath,
        sourceManifestPath,
        version: "0.5.0-insiders.test",
      });

      await Promise.all(
        ["LICENSE", "README.md", "README.zh-CN.md", "package.json"].map(async (file) =>
          access(join(staged.stagingDirectory, file)),
        ),
      );
      expect(staged.manifest).toMatchObject({
        files: ["dist", "LICENSE", "README.md", "README.zh-CN.md"],
        license: "Apache-2.0",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
