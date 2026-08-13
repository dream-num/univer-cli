import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseContext } from "@univerjs-pro/collaboration-service";
import { UniverType, type ISnapshot } from "@univerjs/protocol";
import Database from "libsql";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/migration/backup.js";
import { createUniverfileSQLite, openUniverfileSQLite } from "../src/open.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Gateway v1 .univer upgrade", () => {
  it("backs up v1 and removes only logical commit storage", async () => {
    const filename = databasePath();
    await createV1Fixture(filename);
    const originalHash = sha256(filename);

    const univerfile = openUniverfileSQLite(filename);
    try {
      expect(univerfile.upgrade).toMatchObject({
        status: "upgraded",
        sourceFormat: "v1",
        targetFormat: "v2",
        backupSha256: originalHash,
        omitted: ["logical-commit-history"],
        preserved: { mergingWorktrees: 1 },
        warnings: [],
      });
      expect(univerfile.databaseAdapter.listUnits()).toEqual([
        expect.objectContaining({ unitId: "unit-1", name: "Budget", headRev: 1 }),
      ]);
      expect(univerfile.worktreeDatabaseAdapter.listWorktrees()).toEqual([
        expect.objectContaining({ worktreeId: "wt-1", name: "Task", status: "merging" }),
      ]);
      await expect(
        univerfile.worktreeDatabaseAdapter.getWorktree(context(), "wt-1"),
      ).resolves.toEqual(
        expect.objectContaining({
          worktree: expect.objectContaining({ status: "merging" }),
          units: [expect.objectContaining({ readyDraftHeadRevision: 1 })],
        }),
      );
    } finally {
      await univerfile.dispose();
    }

    const backups = readdirSync(dirname(filename)).filter((entry) => entry.includes(".backup-v1-"));
    expect(backups).toHaveLength(1);
    expect(sha256(join(dirname(filename), backups[0]!))).toBe(originalHash);

    const database = new Database(filename, { readonly: true });
    try {
      expect(
        database
          .prepare("SELECT version FROM collaboration_schema_versions WHERE component = 'worktree'")
          .get(),
      ).toEqual(expect.objectContaining({ version: 2 }));
      expect(
        database
          .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'collaboration_worktree_commits'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        database
          .prepare(
            "SELECT 1 FROM pragma_table_info('collaboration_worktrees') WHERE name = 'head_commit'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("opens v2 without creating a backup", async () => {
    const filename = databasePath();
    const created = createUniverfileSQLite(filename);
    await created.dispose();

    const opened = openUniverfileSQLite(filename);
    expect(opened.upgrade).toEqual({ status: "unchanged", format: "v2" });
    await opened.dispose();
    expect(readdirSync(dirname(filename)).filter((entry) => entry.includes(".backup-"))).toEqual(
      [],
    );
  });

  it("upgrades an early Gateway v1 file that predates the Asset component", async () => {
    const filename = databasePath();
    await createV1Fixture(filename);
    const database = new Database(filename);
    database.exec(`
      DROP TABLE collaboration_assets;
      DROP TABLE collaboration_asset_blobs;
      DELETE FROM collaboration_schema_versions WHERE component = 'assets';
    `);
    database.close();

    const opened = openUniverfileSQLite(filename);
    try {
      expect(opened.upgrade).toMatchObject({
        status: "upgraded",
        sourceFormat: "v1",
        targetFormat: "v2",
        verification: { assets: 0 },
      });
      expect(opened.databaseAdapter.listUnits()).toHaveLength(1);
      expect(opened.assetStore.countAssets()).toBe(0);
    } finally {
      await opened.dispose();
    }
    expect(detectFormat(filename)).toEqual([
      { component: "assets", version: 1 },
      { component: "core", version: 1 },
      { component: "worktree", version: 2 },
    ]);
  });
});

async function createV1Fixture(filename: string): Promise<void> {
  const univerfile = createUniverfileSQLite(filename);
  try {
    await univerfile.databaseAdapter.createUnit(
      context({ "@univer/univerfile-sqlite/unit-metadata": { name: "Budget" } }),
      {
        record: { unitID: "unit-1", type: UniverType.UNIVER_SHEET, headRevision: 1 },
        snapshot: { unitID: "unit-1", type: UniverType.UNIVER_SHEET, rev: 1 } as ISnapshot,
      },
    );
    await univerfile.worktreeDatabaseAdapter.createWorktreeForGateway(
      context({
        "@univer/univerfile-sqlite/worktree-metadata": {
          name: "Task",
          unitNames: { "unit-1": "Budget" },
        },
      }),
      {
        record: { worktreeID: "wt-1", sid: "sid-wt-1", status: "draft" },
        units: [
          {
            worktreeID: "wt-1",
            unitID: "unit-1",
            type: UniverType.UNIVER_SHEET,
            source: "trunk",
            baselineTrunkRevision: 1,
            draftHeadRevision: 1,
          },
        ],
      },
    );
  } finally {
    await univerfile.dispose();
  }

  const database = new Database(filename);
  try {
    database.exec(`
      ALTER TABLE collaboration_worktrees
      ADD COLUMN head_commit INTEGER NOT NULL DEFAULT 0 CHECK (head_commit >= 0);

      CREATE TABLE collaboration_worktree_commits (
        worktree_id TEXT NOT NULL,
        seq INTEGER NOT NULL CHECK (seq >= 1),
        message TEXT NOT NULL,
        custom_tag_json TEXT,
        units_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (worktree_id, seq),
        FOREIGN KEY (worktree_id)
          REFERENCES collaboration_worktrees(worktree_id) ON DELETE CASCADE
      );

      UPDATE collaboration_worktrees SET head_commit = 1 WHERE worktree_id = 'wt-1';
      UPDATE collaboration_worktrees SET status = 'merging' WHERE worktree_id = 'wt-1';
      UPDATE collaboration_worktree_units
      SET ready_draft_head_revision = draft_head_revision
      WHERE worktree_id = 'wt-1';
      INSERT INTO collaboration_worktree_commits
        (worktree_id, seq, message, custom_tag_json, units_json, created_at_ms)
      VALUES ('wt-1', 1, 'legacy message', '{"source":"v1"}', '{"unit-1":1}', 1);
      UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'worktree';
    `);
  } finally {
    database.close();
  }
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "univerfile-v1-"));
  directories.push(directory);
  return join(directory, "file.univer");
}

function context(customData: Record<string, unknown> = {}): DatabaseContext {
  return {
    userID: "user-1",
    customData,
    request: {},
  };
}

function detectFormat(filename: string): unknown[] {
  const database = new Database(filename, { readonly: true });
  try {
    return database
      .prepare("SELECT component, version FROM collaboration_schema_versions ORDER BY component")
      .all();
  } finally {
    database.close();
  }
}
