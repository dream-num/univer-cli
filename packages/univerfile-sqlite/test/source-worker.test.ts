import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "libsql";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/migration/backup.js";
import { upgradeUniverfileSQLite } from "../src/migration/upgrade.js";
import { detectUniverfileSQLiteFormat } from "../src/schema/detect.js";
import { writeV2Fixture } from "./v2-fixture.js";

describe("source SQLite worker lifecycle", () => {
  // Each helper cold-loads the source SDK graph; concurrent Windows checks can exceed 30s.
  it("releases detection handles and upgrades without an inherited TypeScript loader", () => {
    const directory = mkdtempSync(join(tmpdir(), "univerfile-source-worker-"));
    const filename = join(directory, "source.univer");
    const moved = join(directory, "moved.univer");
    try {
      const missing = join(directory, "missing.univer");
      expect(() => detectUniverfileSQLiteFormat(missing)).toThrow(/does not exist/u);
      expect(existsSync(missing)).toBe(false);
      writeV2Fixture(filename);
      const originalHash = sha256(filename);
      expect(detectUniverfileSQLiteFormat(filename)).toBe("v2");
      expect(sha256(filename)).toBe(originalHash);
      // On Windows this fails if detection prepared a statement in the parent process.
      renameSync(filename, moved);
      renameSync(moved, filename);
      const result = upgradeUniverfileSQLite(filename);
      expect(result).toMatchObject({
        status: "upgraded",
        sourceFormat: "v2",
        backupSha256: originalHash,
      });
      expect(detectUniverfileSQLiteFormat(filename)).toBe("v3");
      renameSync(filename, moved);
      if (result.status === "upgraded") expect(sha256(result.backupPath)).toBe(originalHash);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("preserves the migration error and removes failed candidates after the child exits", () => {
    const directory = mkdtempSync(join(tmpdir(), "univerfile-source-worker-failure-"));
    const filename = join(directory, "source.univer");
    try {
      writeV2Fixture(filename);
      const database = new Database(filename);
      try {
        database.exec(`
          PRAGMA foreign_keys = OFF;
          INSERT INTO collaboration_worktree_units
          VALUES ('wt-missing', 'u-orphan', 0, 2, 'Orphan', 1, 'worktree', 1, 1, NULL, NULL);
        `);
      } finally {
        database.close();
      }
      const originalHash = sha256(filename);
      expect(() => upgradeUniverfileSQLite(filename, { execution: "subprocess" })).toThrow(
        /foreign-key violation/u,
      );
      expect(sha256(filename)).toBe(originalHash);
      expect(detectUniverfileSQLiteFormat(filename)).toBe("v2");
      expect(readdirSync(directory).filter((name) => name.includes(".upgrade-"))).toEqual([]);
      expect(
        readdirSync(directory).filter((name) => name.startsWith("source.univer.backup-")),
      ).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the bundled worker entry compatible with read-only detection and atomic upgrade", async () => {
    const packageRoot = fileURLToPath(new URL("../", import.meta.url));
    const require = createRequire(join(packageRoot, "../../apps/cli/package.json"));
    const { build } = require("esbuild") as typeof import("esbuild");
    const cache = join(packageRoot, "node_modules/.cache");
    mkdirSync(cache, { recursive: true });
    const directory = mkdtempSync(join(cache, "sqlite-worker-"));
    const filename = join(directory, "source.univer");
    const entry = join(directory, "entry.mjs");
    try {
      await build({
        stdin: {
          contents:
            'export { upgradeUniverfileSQLite } from "./src/migration/upgrade.ts"; export { detectUniverfileSQLiteFormat } from "./src/schema/detect.ts";',
          resolveDir: packageRoot,
        },
        outfile: entry,
        bundle: true,
        packages: "external",
        platform: "node",
        format: "esm",
      });
      const api = (await import(pathToFileURL(entry).href)) as {
        upgradeUniverfileSQLite: typeof upgradeUniverfileSQLite;
        detectUniverfileSQLiteFormat: typeof detectUniverfileSQLiteFormat;
      };
      writeV2Fixture(filename);
      const originalHash = sha256(filename);
      expect(api.detectUniverfileSQLiteFormat(filename)).toBe("v2");
      expect(api.upgradeUniverfileSQLite(filename, { execution: "subprocess" })).toMatchObject({
        status: "upgraded",
        backupSha256: originalHash,
      });
      expect(api.detectUniverfileSQLiteFormat(filename)).toBe("v3");
      renameSync(filename, join(directory, "renamed.univer"));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
