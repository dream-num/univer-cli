import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseContext } from "@univerjs-pro/collaboration-service";
import { UniverType, type IMutation, type ISnapshot } from "@univerjs/protocol";
import Database from "libsql";
import { afterEach, describe, expect, it } from "vitest";
import { openUniverfileSQLite } from "../src/open.js";
import { sha256 } from "../src/migration/backup.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform === "win32" && (code === "EBUSY" || code === "EPERM")) {
        // libsql statements can retain Windows file handles until process exit. Migration itself
        // no longer renames or deletes the database file; only this test-directory cleanup does.
        continue;
      }
      throw error;
    }
  }
});

describe("legacy v0 .univer upgrade", () => {
  it("backs up v0, upgrades directly to v2 and remains writable", async () => {
    const filename = legacyDatabasePath();
    await createLegacyFixture(filename);
    const originalHash = sha256(filename);

    const univerfile = openUniverfileSQLite(filename);
    try {
      expect(univerfile.upgrade).toMatchObject({
        status: "upgraded",
        sourceFormat: "v0",
        targetFormat: "v2",
        backupSha256: originalHash,
        omitted: ["logical-commit-history"],
      });
      expect(univerfile.databaseAdapter.listUnits()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            unitId: "trunk-sheet",
            type: UniverType.UNIVER_SHEET,
            name: "Budget",
            headRev: 2,
          }),
          expect.objectContaining({
            unitId: "legacy-base",
            type: UniverType.UNIVER_BASE,
            name: "Legacy Base",
            headRev: 2,
          }),
        ]),
      );
      const snapshot = await univerfile.databaseAdapter.getSnapshot(context(), "trunk-sheet");
      expect(snapshot).toMatchObject({ unitID: "trunk-sheet", rev: 1 });
      expect((snapshot as ISnapshot & { migrationProbe: Uint8Array }).migrationProbe).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      expect(
        (
          await univerfile.databaseAdapter.getChangesets(context(), "trunk-sheet", {
            from: 1,
            to: 0,
          })
        ).changesets,
      ).toEqual([
        expect.objectContaining({
          unitID: "trunk-sheet",
          baseRev: 1,
          revision: 2,
          sid: "legacy-migration:core:trunk-sheet:2",
          reqId: 1,
        }),
      ]);
      const baseSnapshot = await univerfile.databaseAdapter.getSnapshot(context(), "legacy-base");
      expect(readJsonBytes(baseSnapshot?.workbook?.originalMeta)).toMatchObject({
        schemaVersion: 2,
      });
      expect(
        readJsonBytes(baseSnapshot?.workbook?.sheets["base-table"]?.originalMeta),
      ).toMatchObject({
        fieldOrder: ["__record_id", "primary"],
        colIndex: { __record_id: 0, primary: 1 },
      });
      const migratedBaseChangeset = univerfile.databaseAdapter.getChangeset("legacy-base", 2);
      const migratedBaseParams = JSON.parse(migratedBaseChangeset!.mutations![0]!.data) as Record<
        string,
        any
      >;
      expect(migratedBaseParams.op[2]).toEqual([
        "cellData",
        "0",
        "1",
        { i: { v: "updated", t: 1 } },
      ]);
      expect(
        await univerfile.databaseAdapter.getSheetBlock(context(), "trunk-sheet", "block-1"),
      ).toMatchObject({
        id: "block-1",
        startRow: 0,
        endRow: 1,
        data: new Uint8Array([91, 49, 93]),
      });

      expect(
        univerfile.worktreeDatabaseAdapter
          .listWorktrees()
          .map(({ worktreeId, status }) => ({ worktreeId, status })),
      ).toEqual([
        { worktreeId: "wt-draft", status: "draft" },
        { worktreeId: "wt-ready", status: "ready" },
        { worktreeId: "wt-merged", status: "merged" },
        { worktreeId: "wt-discarded", status: "discarded" },
      ]);
      expect(
        univerfile.worktreeDatabaseAdapter
          .listWorktreeUnits("wt-draft")
          .map(({ unitId }) => unitId),
      ).toEqual(["trunk-sheet", "created-sheet"]);
      expect(univerfile.worktreeDatabaseAdapter.listDeletedUnits("wt-draft")).toEqual([
        expect.objectContaining({
          unitId: "deleted-doc",
          deleteFromTrunk: true,
        }),
      ]);
      expect(
        await univerfile.worktreeDatabaseAdapter.getUnitSeed(
          context(),
          "wt-draft",
          "created-sheet",
        ),
      ).toMatchObject({ snapshot: { unitID: "created-sheet", rev: 1 } });
      expect(
        (
          await univerfile.worktreeDatabaseAdapter.getDraftChangesets(
            context(),
            "wt-draft",
            "created-sheet",
            { from: 1, to: 0 },
          )
        ).changesets.map(({ revision }) => revision),
      ).toEqual([2]);

      await univerfile.worktreeDatabaseAdapter.commitDraftChangeset(context(), {
        worktreeID: "wt-draft",
        expectedHeadRevision: 3,
        changeset: {
          unitID: "trunk-sheet",
          type: UniverType.UNIVER_SHEET,
          baseRev: 3,
          revision: 4,
          mutations: [mutation("trunk-sheet", 9)],
          sid: "post-upgrade",
          reqId: 1,
        },
      });
      expect(
        univerfile.worktreeDatabaseAdapter
          .listWorktreeUnits("wt-draft")
          .find(({ unitId }) => unitId === "trunk-sheet")?.headRev,
      ).toBe(4);
    } finally {
      await univerfile.dispose();
    }

    const backups = readdirSync(dirname(filename)).filter((entry) => entry.includes(".backup-v0-"));
    expect(backups).toHaveLength(1);
    expect(sha256(join(dirname(filename), backups[0]!))).toBe(originalHash);
    expect(readdirSync(dirname(filename)).filter((entry) => entry.includes(".upgrade-"))).toEqual(
      [],
    );

    const reopened = openUniverfileSQLite(filename);
    expect(reopened.upgrade).toEqual({ status: "unchanged", format: "v2" });
    await reopened.dispose();

    const database = new Database(filename, { readonly: true });
    try {
      const legacyTables = database
        .prepare(
          `SELECT name FROM sqlite_schema
           WHERE type = 'table' AND name IN
             ('units', 'changesets', 'snapshots', 'sheet_blocks',
              'worktrees', 'worktree_commits', 'worktree_changesets', 'worktree_snapshots')`,
        )
        .all();
      expect(legacyTables).toEqual([]);
      expect(
        database
          .prepare(
            `SELECT version FROM collaboration_schema_versions
             WHERE component IN ('assets', 'core', 'worktree')
             ORDER BY component`,
          )
          .all(),
      ).toEqual([{ version: 1 }, { version: 1 }, { version: 2 }]);
      expect(
        database
          .prepare(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'collaboration_worktree_commits'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("rejects invalid legacy data without changing the original file", async () => {
    const filename = legacyDatabasePath();
    await createLegacyFixture(filename);
    const database = new Database(filename);
    database.prepare("DELETE FROM snapshots WHERE unit_id = ?").run("trunk-sheet");
    database.close();

    expect(() => openUniverfileSQLite(filename)).toThrow(/failed to upgrade .* from v0 to v2/);

    expect(
      readdirSync(dirname(filename)).filter((entry) => entry.includes(".backup-v0-")),
    ).toHaveLength(1);
    expect(readdirSync(dirname(filename)).filter((entry) => entry.includes(".upgrade-"))).toEqual(
      [],
    );

    const databaseAfter = new Database(filename, { readonly: true });
    try {
      expect(
        (
          databaseAfter.prepare("SELECT COUNT(*) AS count FROM units").get() as {
            readonly count: number;
          }
        ).count,
      ).toBe(3);
      expect(
        (
          databaseAfter.prepare("SELECT COUNT(*) AS count FROM snapshots").get() as {
            readonly count: number;
          }
        ).count,
      ).toBe(2);
      expect(
        databaseAfter
          .prepare(
            `SELECT name
             FROM sqlite_schema
             WHERE type = 'table'
               AND (
                 name LIKE 'collaboration_%'
                 OR name LIKE '__collaboration_migration_v0_%'
               )`,
          )
          .all(),
      ).toEqual([]);
    } finally {
      databaseAfter.close();
    }
  });

  it("refuses a v0 merging Worktree that has no recoverable SDK merge context", async () => {
    const filename = legacyDatabasePath();
    await createLegacyFixture(filename);
    const originalHash = sha256(filename);
    const database = new Database(filename);
    database
      .prepare("UPDATE worktrees SET status = 'merging' WHERE worktree_id = ?")
      .run("wt-ready");
    database.close();
    const mergingHash = sha256(filename);

    expect(() => openUniverfileSQLite(filename)).toThrow(
      /merging Worktree without Collaboration SDK recovery context/,
    );
    expect(sha256(filename)).toBe(mergingHash);
    expect(sha256(filename)).not.toBe(originalHash);
    expect(readdirSync(dirname(filename)).filter((entry) => entry.includes(".upgrade-"))).toEqual(
      [],
    );
  });
});

function legacyDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "collab-gateway-legacy-"));
  directories.push(directory);
  return join(directory, "legacy.univer");
}

function context(): DatabaseContext {
  return {
    userID: "migration-test",
    customData: {},
    request: {},
  };
}

function mutation(unitId: string, value: number): IMutation {
  return {
    id: "sheet.mutation.set-range-values",
    data: JSON.stringify({
      unitId,
      subUnitId: "sheet-1",
      cellValue: { 0: { 0: { v: value, t: 2 } } },
    }),
  };
}

async function createLegacyFixture(filename: string): Promise<void> {
  const trunkSnapshot = Object.assign(
    { unitID: "trunk-sheet", type: UniverType.UNIVER_SHEET, rev: 1 } as ISnapshot,
    {
      migrationProbe: new Uint8Array([1, 2, 3]),
    },
  );
  const deletedSnapshot = {
    unitID: "deleted-doc",
    type: UniverType.UNIVER_DOC,
    rev: 1,
  } as ISnapshot;
  const createdSnapshot = {
    unitID: "created-sheet",
    type: UniverType.UNIVER_SHEET,
    rev: 1,
  } as ISnapshot;
  const legacyBase = legacyV0BaseSnapshot();

  const database = new Database(filename);
  database.exec(LEGACY_SCHEMA);

  database
    .prepare(
      `INSERT INTO units
         (unit_id, type, name, baseline_rev, head_rev, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "trunk-sheet",
      UniverType.UNIVER_SHEET,
      "Budget",
      1,
      2,
      "2026-07-01 00:00:00",
      "2026-07-01 00:01:00",
      null,
    );
  database
    .prepare(
      `INSERT INTO units
         (unit_id, type, name, baseline_rev, head_rev, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "deleted-doc",
      UniverType.UNIVER_DOC,
      "Old notes",
      1,
      1,
      "2026-07-01 00:00:01",
      "2026-07-01 00:02:00",
      "2026-07-01 00:02:00",
    );
  database
    .prepare(
      `INSERT INTO units
         (unit_id, type, name, baseline_rev, head_rev, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "legacy-base",
      UniverType.UNIVER_BASE,
      "Legacy Base",
      1,
      2,
      "2026-07-01 00:00:02",
      "2026-07-01 00:02:00",
      null,
    );

  insertLegacySnapshot(database, trunkSnapshot);
  insertLegacySnapshot(database, deletedSnapshot);
  insertLegacySnapshot(database, legacyBase);
  database
    .prepare(
      `INSERT INTO changesets
         (unit_id, revision, type, base_rev, user_id, member_id, sid, req_id, mutations,
          mutation_size, additional_fields, create_time)
       VALUES (?, 2, ?, 1, '', '', '', 0, ?, NULL, NULL, ?)`,
    )
    .run(
      "trunk-sheet",
      UniverType.UNIVER_SHEET,
      JSON.stringify([mutation("trunk-sheet", 2)]),
      Date.UTC(2026, 6, 1, 0, 1),
    );
  database
    .prepare(
      `INSERT INTO changesets
         (unit_id, revision, type, base_rev, user_id, member_id, sid, req_id, mutations,
          mutation_size, additional_fields, create_time)
       VALUES (?, 2, ?, 1, '', '', '', 0, ?, NULL, NULL, ?)`,
    )
    .run(
      "legacy-base",
      UniverType.UNIVER_BASE,
      JSON.stringify([
        {
          id: "base.mutation.apply-base-json1",
          data: JSON.stringify({
            unitId: "legacy-base",
            op: [
              "tables",
              "base-table",
              ["cellData", "0", "0", { i: { v: "updated", t: 1 } }],
              ["records", "base-record", "values", "primary", { i: "updated" }],
            ],
          }),
        },
      ]),
      Date.UTC(2026, 6, 1, 0, 2),
    );
  database
    .prepare(
      `INSERT INTO sheet_blocks
         (unit_id, block_id, start_row, end_row, data)
       VALUES (?, ?, 0, 1, ?)`,
    )
    .run("trunk-sheet", "block-1", Buffer.from("[1]"));

  insertLegacyWorktree(
    database,
    "wt-draft",
    "draft",
    { "trunk-sheet": 2, "deleted-doc": 1 },
    3,
    "2026-07-02 00:00:00",
    null,
  );
  insertLegacyWorktree(
    database,
    "wt-ready",
    "ready",
    { "trunk-sheet": 2 },
    0,
    "2026-07-02 00:00:01",
    null,
  );
  insertLegacyWorktree(
    database,
    "wt-merged",
    "merged",
    { "trunk-sheet": 2 },
    0,
    "2026-07-02 00:00:02",
    "2026-07-02 00:03:00",
  );
  insertLegacyWorktree(
    database,
    "wt-discarded",
    "discarded",
    { "trunk-sheet": 2 },
    0,
    "2026-07-02 00:00:03",
    null,
  );

  insertLegacyCommit(
    database,
    1,
    "create sheet",
    {
      create: [{ unitId: "created-sheet", type: UniverType.UNIVER_SHEET, name: "Scenario" }],
      delete: [],
    },
    { source: "legacy" },
    { "created-sheet": 1 },
  );
  insertLegacyCommit(database, 2, "edit both", { create: [], delete: [] }, null, {
    "trunk-sheet": 3,
    "created-sheet": 2,
  });
  insertLegacyCommit(database, 3, "delete doc", { create: [], delete: ["deleted-doc"] }, null, {});

  database
    .prepare(
      `INSERT INTO worktree_snapshots (worktree_id, unit_id, revision, data)
       VALUES ('wt-draft', 'created-sheet', 1, ?)`,
    )
    .run(stringifyLegacy(createdSnapshot));
  database
    .prepare(
      `INSERT INTO sheet_blocks
         (unit_id, block_id, start_row, end_row, data)
       VALUES ('created-sheet', 'created-block', 0, 1, ?)`,
    )
    .run([Buffer.from("[2]")]);
  insertLegacyWorktreeChangeset(
    database,
    "trunk-sheet",
    UniverType.UNIVER_SHEET,
    2,
    3,
    2,
    mutation("trunk-sheet", 3),
  );
  insertLegacyWorktreeChangeset(
    database,
    "created-sheet",
    UniverType.UNIVER_SHEET,
    1,
    2,
    2,
    mutation("created-sheet", 2),
  );
  database.close();
}

function legacyV0BaseSnapshot(): ISnapshot {
  const table = {
    id: "base-table",
    name: "Base Table",
    primaryFieldId: "primary",
    fieldOrder: ["primary"],
    fields: { primary: { id: "primary", name: "Name", type: "text", config: {} } },
    records: {
      "base-record": {
        id: "base-record",
        values: {},
        orderKey: "0001",
        createdAt: 1,
        updatedAt: 1,
      },
    },
    recordOrder: ["base-record"],
    rowIndex: { "base-record": 0 },
    rowId: { "0": "base-record" },
    colIndex: { primary: 0 },
    colId: { "0": "primary" },
    cellData: { "0": {} },
    resources: { attachmentSets: {}, attachments: {} },
    views: {
      view: {
        id: "view",
        tableId: "base-table",
        name: "Grid",
        type: "grid",
        fieldOrder: ["primary"],
        fieldSettings: {},
        config: { frozenFieldCount: 1 },
      },
    },
    viewOrder: ["view"],
  };
  return {
    unitID: "legacy-base",
    type: UniverType.UNIVER_BASE,
    rev: 1,
    workbook: {
      unitID: "legacy-base",
      rev: 1,
      creator: "",
      name: "Legacy Base",
      sheetOrder: ["base-table"],
      sheets: {
        "base-table": {
          id: "base-table",
          type: 0,
          name: "Base Table",
          rowCount: 1,
          columnCount: 1,
          originalMeta: jsonBytes(table),
        },
      },
      blockMeta: { "base-table": { sheetID: "base-table", blocks: [] } },
      resources: [],
      originalMeta: jsonBytes({
        locale: "zhCN",
        appVersion: "legacy",
        schemaVersion: 1,
        createdAt: 1,
        updatedAt: 1,
        resources: [],
      }),
    },
  } as ISnapshot;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function readJsonBytes(value: unknown): Record<string, any> {
  expect(value).toBeInstanceOf(Uint8Array);
  return JSON.parse(new TextDecoder().decode(value as Uint8Array)) as Record<string, any>;
}

function insertLegacySnapshot(database: Database.Database, snapshot: ISnapshot): void {
  database
    .prepare("INSERT INTO snapshots (unit_id, revision, data) VALUES (?, 1, ?)")
    .run(snapshot.unitID, stringifyLegacy(snapshot));
}

function insertLegacyWorktree(
  database: Database.Database,
  worktreeId: string,
  status: string,
  baseline: Readonly<Record<string, number>>,
  headCommit: number,
  createdAt: string,
  mergedAt: string | null,
): void {
  database
    .prepare(
      `INSERT INTO worktrees
         (worktree_id, status, agent_id, name, baseline, head_commit, created_at, merged_at)
       VALUES (?, ?, 'agent-legacy', ?, ?, ?, ?, ?)`,
    )
    .run(worktreeId, status, worktreeId, JSON.stringify(baseline), headCommit, createdAt, mergedAt);
}

function insertLegacyCommit(
  database: Database.Database,
  seq: number,
  message: string,
  changes: unknown,
  customTag: unknown,
  units: Readonly<Record<string, number>>,
): void {
  database
    .prepare(
      `INSERT INTO worktree_commits
         (worktree_id, seq, message, changes, custom_tag, units, created_at)
       VALUES ('wt-draft', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      seq,
      message,
      JSON.stringify(changes),
      customTag === null ? null : JSON.stringify(customTag),
      JSON.stringify(units),
      Date.UTC(2026, 6, 2, 0, seq),
    );
}

function insertLegacyWorktreeChangeset(
  database: Database.Database,
  unitId: string,
  type: UniverType,
  baseRev: number,
  revision: number,
  commitSeq: number,
  worktreeMutation: IMutation,
): void {
  database
    .prepare(
      `INSERT INTO worktree_changesets
         (worktree_id, unit_id, revision, commit_seq, type, base_rev, user_id, member_id,
          sid, req_id, mutations, mutation_size, additional_fields, create_time)
       VALUES ('wt-draft', ?, ?, ?, ?, ?, 'agent-legacy', '', '', 0, ?, NULL, NULL, ?)`,
    )
    .run(
      unitId,
      revision,
      commitSeq,
      type,
      baseRev,
      JSON.stringify([worktreeMutation]),
      Date.UTC(2026, 6, 2, 0, commitSeq),
    );
}

function stringifyLegacy(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry instanceof Uint8Array ? { __u8__: Buffer.from(entry).toString("base64") } : entry,
  );
}

const LEGACY_SCHEMA = `
CREATE TABLE units (
  unit_id TEXT PRIMARY KEY, type INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '',
  baseline_rev INTEGER NOT NULL DEFAULT 0, head_rev INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT
);
CREATE TABLE changesets (
  unit_id TEXT NOT NULL, revision INTEGER NOT NULL, type INTEGER NOT NULL,
  base_rev INTEGER NOT NULL, user_id TEXT NOT NULL DEFAULT '',
  member_id TEXT NOT NULL DEFAULT '', sid TEXT NOT NULL DEFAULT '',
  req_id INTEGER NOT NULL DEFAULT 0, mutations TEXT NOT NULL, mutation_size INTEGER,
  additional_fields TEXT, create_time INTEGER NOT NULL, PRIMARY KEY (unit_id, revision)
);
CREATE TABLE snapshots (
  unit_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (unit_id, revision)
);
CREATE TABLE sheet_blocks (
  unit_id TEXT NOT NULL, block_id TEXT NOT NULL, start_row INTEGER NOT NULL,
  end_row INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (unit_id, block_id)
);
CREATE TABLE worktrees (
  worktree_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'draft',
  agent_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', baseline TEXT NOT NULL,
  head_commit INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  merged_at TEXT
);
CREATE TABLE worktree_commits (
  worktree_id TEXT NOT NULL, seq INTEGER NOT NULL, message TEXT NOT NULL DEFAULT '',
  changes TEXT NOT NULL, custom_tag TEXT, units TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, PRIMARY KEY (worktree_id, seq)
);
CREATE TABLE worktree_changesets (
  worktree_id TEXT NOT NULL, unit_id TEXT NOT NULL, revision INTEGER NOT NULL,
  commit_seq INTEGER NOT NULL, type INTEGER NOT NULL, base_rev INTEGER NOT NULL,
  user_id TEXT NOT NULL DEFAULT '', member_id TEXT NOT NULL DEFAULT '',
  sid TEXT NOT NULL DEFAULT '', req_id INTEGER NOT NULL DEFAULT 0, mutations TEXT NOT NULL,
  mutation_size INTEGER, additional_fields TEXT, create_time INTEGER NOT NULL,
  PRIMARY KEY (worktree_id, unit_id, revision)
);
CREATE TABLE worktree_snapshots (
  worktree_id TEXT NOT NULL, unit_id TEXT NOT NULL, revision INTEGER NOT NULL,
  data TEXT NOT NULL, PRIMARY KEY (worktree_id, unit_id, revision)
);
`;
