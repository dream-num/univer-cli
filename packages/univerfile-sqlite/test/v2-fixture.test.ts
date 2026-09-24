import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseContext } from "@univerjs-pro/collaboration-service";
import Database from "libsql";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/migration/backup.js";
import { openUniverfileSQLite } from "../src/open.js";
import { detectUniverfileSQLiteFormat } from "../src/schema/detect.js";
import { V2_FIXTURE, writeV2Fixture, type V2FixtureVariant } from "./v2-fixture.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const SHEET_CREATED_AT = 1_790_234_431_390;
const DOC_CREATED_AT = 1_790_234_431_398;

describe("v2 .univer upgrade", () => {
  it.each<V2FixtureVariant>(["authoring", "millisecond-change-times", "without-history"])(
    "identifies the %s fixture as v2",
    (variant) => {
      const filename = databasePath();
      writeV2Fixture(filename, variant);

      expect(detectUniverfileSQLiteFormat(filename)).toBe("v2");
    },
  );

  it("backs up v2 and upgrades Unit creators, change times and History boundaries", async () => {
    const filename = databasePath();
    writeV2Fixture(filename);
    const originalHash = sha256(filename);

    const univerfile = openUniverfileSQLite(filename);
    try {
      expect(univerfile.upgrade).toMatchObject({
        status: "upgraded",
        sourceFormat: "v2",
        targetFormat: "v3",
        backupSha256: originalHash,
        omitted: [],
        preserved: { mergingWorktrees: 0 },
        verification: { units: 2, worktrees: 4, assets: 0 },
      });
      if (univerfile.upgrade.status !== "upgraded") throw new Error("expected an upgrade");
      expect(sha256(univerfile.upgrade.backupPath)).toBe(originalHash);

      const trunk = univerfile.databaseAdapter;
      expect(await trunk.getUnit(context(), V2_FIXTURE.sheetUnitId)).toEqual({
        unitID: V2_FIXTURE.sheetUnitId,
        type: 2,
        headRevision: 2,
        creatorID: "local",
        createdAt: SHEET_CREATED_AT,
      });
      expect(trunk.getChangeset(V2_FIXTURE.sheetUnitId, 2)?.createTime).toBe(1_790_234_433);

      const worktrees = univerfile.worktreeDatabaseAdapter;
      expect(
        await worktrees.getWorktreeUnit(
          context(),
          V2_FIXTURE.draftWorktreeId,
          V2_FIXTURE.sheetUnitId,
        ),
      ).toMatchObject({ source: "trunk", creatorID: "local", createdAt: SHEET_CREATED_AT });
      expect(
        await worktrees.getWorktreeUnit(
          context(),
          V2_FIXTURE.draftWorktreeId,
          V2_FIXTURE.slideUnitId,
        ),
      ).toMatchObject({ source: "worktree", creatorID: "local", createdAt: 1_790_234_433_991 });
      const drafts =
        (await worktrees.getDraftChangesets(
          context(),
          V2_FIXTURE.draftWorktreeId,
          V2_FIXTURE.sheetUnitId,
          { from: 1 },
        )) ?? [];
      expect(drafts.map(({ revision, createTime }) => ({ revision, createTime }))).toEqual([
        { revision: 3, createTime: 1_790_234_433 },
      ]);

      const history = univerfile.historyDatabaseAdapter;
      expect(
        await history.listRecords(context(), V2_FIXTURE.sheetUnitId, {
          throughRevision: 2,
          length: 10,
        }),
      ).toEqual({
        records: [
          {
            record: {
              unitID: V2_FIXTURE.sheetUnitId,
              startRevision: 2,
              userID: "local",
              createdAt: 1_790_234_433_000,
              origin: 1,
            },
            endRevision: 2,
          },
          {
            record: {
              unitID: V2_FIXTURE.sheetUnitId,
              startRevision: 1,
              userID: "local",
              createdAt: SHEET_CREATED_AT,
              origin: 1,
            },
            endRevision: 1,
          },
        ],
        hasMore: false,
      });
      expect(await history.getLatestRecord(context(), V2_FIXTURE.docUnitId)).toEqual({
        unitID: V2_FIXTURE.docUnitId,
        startRevision: 1,
        userID: "local",
        createdAt: DOC_CREATED_AT,
        origin: 1,
      });
    } finally {
      await univerfile.dispose();
    }

    expect(detectUniverfileSQLiteFormat(filename)).toBe("v3");
    expect(schemaObjects(filename)).not.toContain("collaboration_history_revisions");
    expect(schemaObjects(filename)).not.toContain("collaboration_history_record_lookup");
    const reopened = openUniverfileSQLite(filename);
    try {
      expect(reopened.upgrade).toEqual({ status: "unchanged", format: "v3" });
    } finally {
      await reopened.dispose();
    }
  });

  it("converts millisecond change times to Unix seconds", async () => {
    const filename = databasePath();
    writeV2Fixture(filename, "millisecond-change-times");

    const univerfile = openUniverfileSQLite(filename);
    try {
      const drafts =
        (await univerfile.worktreeDatabaseAdapter.getDraftChangesets(
          context(),
          V2_FIXTURE.draftWorktreeId,
          V2_FIXTURE.sheetUnitId,
          { from: 1, to: 0 },
        )) ?? [];
      expect(drafts.map(({ revision, createTime }) => ({ revision, createTime }))).toEqual([
        {
          revision: 3,
          createTime: Math.floor((V2_FIXTURE.legacyChangeTimeBaseMs + 3_000) / 1000),
        },
      ]);
    } finally {
      await univerfile.dispose();
    }
  });

  it("leaves History empty for lazy initialization when the v2 fixture has none", async () => {
    const filename = databasePath();
    writeV2Fixture(filename, "without-history");

    const univerfile = openUniverfileSQLite(filename);
    try {
      expect(univerfile.upgrade).toMatchObject({ status: "upgraded", sourceFormat: "v2" });
      expect(
        await univerfile.databaseAdapter.getUnit(context(), V2_FIXTURE.sheetUnitId),
      ).toMatchObject({ creatorID: "local", createdAt: SHEET_CREATED_AT });
      await expect(
        univerfile.historyDatabaseAdapter.getLatestRecord(context(), V2_FIXTURE.sheetUnitId),
      ).resolves.toBeNull();
    } finally {
      await univerfile.dispose();
    }
    expect(detectUniverfileSQLiteFormat(filename)).toBe("v3");
  });

  it("drops only the History of a Unit whose rc segments are inconsistent", async () => {
    const filename = databasePath();
    writeV2Fixture(filename);
    const database = new Database(filename);
    try {
      database
        .prepare(
          `UPDATE collaboration_history_revisions
           SET history_revision = 2
           WHERE unit_id = ? AND revision = 1`,
        )
        .run(V2_FIXTURE.sheetUnitId);
    } finally {
      database.close();
    }

    const univerfile = openUniverfileSQLite(filename);
    try {
      const history = univerfile.historyDatabaseAdapter;
      await expect(history.getLatestRecord(context(), V2_FIXTURE.sheetUnitId)).resolves.toBeNull();
      await expect(history.getLatestRecord(context(), V2_FIXTURE.docUnitId)).resolves.toMatchObject(
        { startRevision: 1 },
      );
    } finally {
      await univerfile.dispose();
    }
  });

  it("keeps the source untouched when the v2 upgrade fails", () => {
    const filename = databasePath();
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

    expect(() => openUniverfileSQLite(filename)).toThrow(
      /failed to upgrade .* from v2 to v3: .*foreign-key violation/,
    );
    expect(sha256(filename)).toBe(originalHash);
    expect(detectUniverfileSQLiteFormat(filename)).toBe("v2");
  });
});

function schemaObjects(filename: string): readonly string[] {
  const database = new Database(filename, { readonly: true });
  try {
    return (
      database.prepare("SELECT name FROM sqlite_schema").all() as unknown as Array<{
        readonly name: string;
      }>
    ).map(({ name }) => name);
  } finally {
    database.close();
  }
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "univerfile-v2-"));
  directories.push(directory);
  return join(directory, "file.univer");
}

function context(): DatabaseContext {
  return { userID: "user-1", customData: {}, request: {} };
}
