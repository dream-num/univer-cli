import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "libsql";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/migration/backup.js";
import { detectUniverfileSQLiteFormat } from "../src/schema/detect.js";
import { writeV2Fixture } from "./v2-fixture.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliRequire = createRequire(join(packageRoot, "../../apps/cli/package.json"));
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("v2 .univer upgrade helper", () => {
  // Bundling the helper and migrating in subprocesses exceeds Vitest's 5s default on CI.
  it("replaces the original after the helper exits and reuses one backup", async () => {
    const { build } = cliRequire("esbuild") as typeof import("esbuild");
    const cacheRoot = join(packageRoot, "node_modules/.cache");
    mkdirSync(cacheRoot, { recursive: true });
    const bundleDirectory = mkdtempSync(join(cacheRoot, "univerfile-upgrade-"));
    directories.push(bundleDirectory);
    const outfile = join(bundleDirectory, "entry.mjs");
    await build({
      stdin: {
        contents: `export { openUniverfileSQLite } from "./src/open.ts";`,
        resolveDir: packageRoot,
      },
      outfile,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
    });
    const api = (await import(pathToFileURL(outfile).href)) as {
      openUniverfileSQLite: (
        filename: string,
        options?: { readonly execution?: "subprocess" },
      ) => {
        readonly upgrade: { readonly status: string; readonly sourceFormat?: string };
        dispose(): Promise<void>;
      };
    };

    const workspace = mkdtempSync(join(tmpdir(), "univerfile-upgrade-subprocess-"));
    directories.push(workspace);
    const filename = join(workspace, "file.univer");
    writeV2Fixture(filename);
    const originalHash = sha256(filename);

    const opened = api.openUniverfileSQLite(filename, { execution: "subprocess" });
    try {
      expect(opened.upgrade).toMatchObject({ status: "upgraded", sourceFormat: "v2" });
      expect(detectUniverfileSQLiteFormat(filename)).toBe("v3");
    } finally {
      await opened.dispose();
    }

    const again = api.openUniverfileSQLite(filename, { execution: "subprocess" });
    try {
      expect(again.upgrade).toEqual({ status: "unchanged", format: "v3" });
    } finally {
      await again.dispose();
    }
    const backups = readdirSync(workspace).filter((entry) =>
      entry.startsWith("file.univer.backup-"),
    );
    expect(backups).toHaveLength(1);
    expect(sha256(join(workspace, backups[0]!))).toBe(originalHash);

    const failed = join(workspace, "failed.univer");
    writeV2Fixture(failed);
    const database = new Database(failed);
    try {
      database.exec(`
        PRAGMA foreign_keys = OFF;
        INSERT INTO collaboration_worktree_units
        VALUES ('wt-missing', 'u-orphan', 0, 2, 'Orphan', 1, 'worktree', 1, 1, NULL, NULL);
      `);
    } finally {
      database.close();
    }
    expect(() => api.openUniverfileSQLite(failed, { execution: "subprocess" })).toThrow(
      /foreign-key violation/,
    );
    expect(detectUniverfileSQLiteFormat(failed)).toBe("v2");
    const failedBackups = readdirSync(workspace).filter((entry) =>
      entry.startsWith("failed.univer.backup-"),
    );
    expect(failedBackups).toHaveLength(1);
    expect(sha256(join(workspace, failedBackups[0]!))).toBe(sha256(failed));
    expect(() => api.openUniverfileSQLite(failed, { execution: "subprocess" })).toThrow(
      /foreign-key violation/,
    );
    expect(
      readdirSync(workspace).filter((entry) => entry.startsWith("failed.univer.backup-")),
    ).toEqual(failedBackups);
  }, 60_000);
});
