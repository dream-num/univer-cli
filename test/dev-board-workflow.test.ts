import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error The development runner is a Node.js maintenance script.
import {
  addSdkOverrides,
  assertCompiledSdkEntry,
  captureInstalledLock,
  replaceOwnedConfiguration,
  resolveInstalledSdkPackages,
  restoreOwnedFile,
  sourceCliRuntime,
} from "../scripts/dev/verify-board.mjs";

interface ISdkFixturePackage {
  name: string;
  version: string;
  path: string;
}

interface ISdkFixture {
  directory: string;
  packages: ISdkFixturePackage[];
  child: string;
  createPackage: (
    name: string,
    installed?: string,
    dependencies?: Record<string, string>,
  ) => ISdkFixturePackage;
}

function withSdkFixture(action: (fixture: ISdkFixture) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "univer-board-dev-sdk-"));
  if (
    !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
    !basename(directory).startsWith("univer-board-dev-sdk-")
  )
    throw new Error("SDK fixture cleanup escaped its temporary root");
  try {
    let sequence = 0;
    const createPackage: ISdkFixture["createPackage"] = (name, installed, dependencies = {}) => {
      const stage = join(directory, `stage-${++sequence}`);
      const packageRoot = join(stage, "package");
      mkdirSync(join(packageRoot, "dist"), { recursive: true });
      const version = "1.2.0-dev.test";
      writeFileSync(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name,
          version,
          type: "module",
          dependencies,
          exports: { ".": { import: "./dist/index.mjs", require: "./dist/index.cjs" } },
        }),
      );
      writeFileSync(
        join(packageRoot, "dist/index.mjs"),
        `export const name = ${JSON.stringify(name)};\n`,
      );
      writeFileSync(
        join(packageRoot, "dist/index.cjs"),
        `module.exports.name = ${JSON.stringify(name)};\n`,
      );
      const path = join(directory, `sdk-${sequence}.tgz`);
      expect(
        spawnSync("tar", ["-czf", path, "-C", stage, "package"], { windowsHide: true }).status,
      ).toBe(0);
      if (installed) cpSync(packageRoot, installed, { recursive: true });
      return { name, version, path };
    };
    const parent = join(directory, "node_modules/@univer-cli/z-parent");
    const child = join(parent, "node_modules/@univer-cli/a-child");
    const childPackage = createPackage("@univer-cli/a-child", child);
    const parentPackage = createPackage("@univer-cli/z-parent", parent, {
      [childPackage.name]: childPackage.version,
    });
    action({ directory, packages: [childPackage, parentPackage], child, createPackage });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("local Board SDK development workflow", () => {
  it("verifies a real nested SDK dependency even when its map entry precedes its parent", () => {
    withSdkFixture(({ directory, packages, child }) => {
      const installed = resolveInstalledSdkPackages(directory, packages);
      expect(installed.map((entry: { name: string }) => entry.name)).toEqual(
        packages.map(({ name }) => name),
      );
      expect(installed[0].entry).toBe(join(child, "dist/index.cjs"));
      expect(installed[0].importEntry).toBe(join(child, "dist/index.mjs"));
      expect(installed[0].importEntrySha256).toMatch(/^[a-f\d]{64}$/u);
    });
  });

  it.each(["version", "entry"])("rejects a nested SDK with a stale %s", (kind) => {
    withSdkFixture(({ directory, packages, child }) => {
      if (kind === "version") {
        const manifest = JSON.parse(readFileSync(join(child, "package.json"), "utf8"));
        writeFileSync(
          join(child, "package.json"),
          JSON.stringify({ ...manifest, version: "1.0.0" }),
        );
      } else writeFileSync(join(child, "dist/index.mjs"), "export const stale = true;\n");
      expect(() => resolveInstalledSdkPackages(directory, packages)).toThrow(
        /version mismatch|differs from its tarball/u,
      );
    });
  });

  it("still rejects a supplied SDK package that is not installed in the consumer graph", () => {
    withSdkFixture(({ directory, packages, createPackage }) => {
      expect(() =>
        resolveInstalledSdkPackages(directory, [
          ...packages,
          createPackage("@univer-cli/unreachable"),
        ]),
      ).toThrow(/Cannot resolve installed SDK @univer-cli\/unreachable/u);
    });
  });

  it("loads source daemon and workers with the same loader as the source client", () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const runtime = sourceCliRuntime(root, join(tmpdir(), "board dev evidence"), {
      NODE_OPTIONS: "--enable-source-maps",
      UNIVER_CLI_DAEMON_ENTRY: "file:///stale/dist/daemon.js",
      UNIVER_CLI_VIEW_ASSETS_ROOT: "stale-assets",
    });
    expect(runtime.cliArgs).toEqual([join(root, "apps/cli/src/bin.ts")]);
    expect(runtime.env.UNIVER_CLI_DAEMON_ENTRY).toMatch(/\/src\/daemon-entry\.ts$/u);
    expect(runtime.env.NODE_OPTIONS).toContain("--enable-source-maps --import=file:");
    expect(runtime.env.UNIVER_CLI_VIEW_ASSETS_ROOT).toBe(join(root, "apps/cli/dist/browser"));
    expect(readFileSync(runtime.entries.daemonEntry, "utf8")).toContain('"./runtime-worker.js"');
    expect(runtime.entries.workerEntry).toBe(join(root, "apps/cli/src/runtime-worker.ts"));
  });
  it("never adopts a workspace edit made during the install", () => {
    const directory = mkdtempSync(join(tmpdir(), "univer-board-dev-concurrent-"));
    const workspace = {
      path: join(directory, "workspace.yaml"),
      owned: Buffer.from("original workspace\n"),
    };
    const lock = { path: join(directory, "lock.yaml"), owned: Buffer.from("original lock\n") };
    try {
      writeFileSync(workspace.path, workspace.owned);
      writeFileSync(lock.path, lock.owned);
      const expected = Buffer.from("temporary SDK overrides\n");
      replaceOwnedConfiguration(workspace, expected);
      writeFileSync(lock.path, "installer lock\n");
      writeFileSync(workspace.path, "concurrent workspace edit\n");
      expect(() => captureInstalledLock(workspace, lock)).toThrow(/Concurrent edit preserved/u);
      expect(workspace.owned).toEqual(expected);
      expect(lock.owned).toEqual(Buffer.from("installer lock\n"));
      expect(() =>
        restoreOwnedFile(workspace.path, Buffer.from("original workspace\n"), workspace.owned),
      ).toThrow(/Concurrent/u);
      expect(readFileSync(workspace.path, "utf8")).toBe("concurrent workspace edit\n");
      expect(() => replaceOwnedConfiguration(workspace, Buffer.from("another override\n"))).toThrow(
        /Concurrent/u,
      );
      expect(readFileSync(workspace.path, "utf8")).toBe("concurrent workspace edit\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects packed source entrypoints even when the archive has a valid SDK name", () => {
    expect(() =>
      assertCompiledSdkEntry({ name: "@univerjs-pro/boards", exports: { ".": "./src/index.ts" } }),
    ).toThrow(/compiled SDK/u);
    expect(() =>
      assertCompiledSdkEntry({
        name: "@univer-cli/unit-layout-lint",
        exports: { ".": { import: "./dist/index.mjs", types: "./dist/index.d.ts" } },
      }),
    ).not.toThrow();
  });
  it("preserves existing workspace settings while adding only SDK tarballs", () => {
    const source =
      'packages:\n  - "apps/*"\noverrides:\n  react: 19.3.0\nallowBuilds:\n  esbuild: true\n';
    const result = addSdkOverrides(source, {
      "@univerjs-pro/boards": "C:\\dev packages\\boards.tgz",
    });
    expect(result).toContain('  "@univerjs-pro/boards": "file:C:/dev packages/boards.tgz"');
    expect(result).toContain("  react: 19.3.0\nallowBuilds:\n  esbuild: true");
    expect(() => addSdkOverrides(source, { "@univer/private-app": "app.tgz" })).toThrow(
      /public SDK/u,
    );
    expect(() =>
      addSdkOverrides("overrides: {}\n", { "@univer-cli/unit-layout-lint": "lint.tgz" }),
    ).toThrow(/block-style/u);
  });

  it("restores exact original bytes after failure without overwriting concurrent edits", () => {
    const directory = mkdtempSync(join(tmpdir(), "univer-board-dev-restore-"));
    const file = join(directory, "workspace.yaml");
    const original = Buffer.from("packages:\r\n  - apps/*\r\n");
    const temporary = Buffer.from("packages:\n  - apps/*\noverrides:\n");
    try {
      writeFileSync(file, temporary);
      try {
        throw new Error("Install failed");
      } catch {
        restoreOwnedFile(file, original, temporary);
      }
      expect(readFileSync(file)).toEqual(original);
      writeFileSync(file, "another developer's edit\n");
      expect(() => restoreOwnedFile(file, original, temporary)).toThrow(
        /Concurrent edit preserved/u,
      );
      expect(readFileSync(file, "utf8")).toBe("another developer's edit\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
