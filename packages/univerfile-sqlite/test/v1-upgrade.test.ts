import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { DatabaseContext } from "@univerjs-pro/collaboration-service";
import { UniverType, type IChangeset, type ISnapshot } from "@univerjs/protocol";
import Database from "libsql";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/migration/backup.js";
import { createUniverfileSQLite, openUniverfileSQLite } from "../src/open.js";
import { detectUniverfileSQLiteFormat } from "../src/schema/detect.js";

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
      expect(univerfile.databaseAdapter.listUnits()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unitId: "unit-1", name: "Budget", headRev: 1 }),
          expect.objectContaining({ unitId: "base-1", name: "Legacy Base", headRev: 2 }),
        ]),
      );
      expect(univerfile.worktreeDatabaseAdapter.listWorktrees()).toEqual([
        expect.objectContaining({ worktreeId: "wt-1", name: "Task", status: "merging" }),
      ]);
      await expect(
        univerfile.worktreeDatabaseAdapter.getWorktree(context(), "wt-1"),
      ).resolves.toEqual(
        expect.objectContaining({
          worktree: expect.objectContaining({ status: "merging" }),
          units: expect.arrayContaining([
            expect.objectContaining({ unitID: "unit-1", readyDraftHeadRevision: 1 }),
            expect.objectContaining({ unitID: "base-wt", readyDraftHeadRevision: 2 }),
          ]),
        }),
      );
      const baseSeed = await univerfile.worktreeDatabaseAdapter.getUnitSeed(
        context(),
        "wt-1",
        "base-wt",
      );
      expect(readJsonBytes(baseSeed?.snapshot.workbook?.originalMeta)).toMatchObject({
        schemaVersion: 2,
      });
      const baseDraft = await univerfile.worktreeDatabaseAdapter.getDraftChangesets(
        context(),
        "wt-1",
        "base-wt",
        { from: 1, to: 0 },
      );
      expect(readMutationData(baseDraft.changesets[0], 2).op[2]).toEqual([
        "cellData",
        "0",
        "1",
        { i: { v: "new value", t: 1 } },
      ]);

      const snapshot = await univerfile.databaseAdapter.getSnapshot(context(), "base-1");
      const workbook = snapshot?.workbook;
      expect(readJsonBytes(workbook?.originalMeta)).toMatchObject({ schemaVersion: 2 });
      expect(readJsonBytes(workbook?.sheets["table-a"]?.originalMeta)).toMatchObject({
        fieldOrder: ["__record_id", "primary"],
        colIndex: { __record_id: 0, primary: 1 },
        records: {
          "record-a": {
            values: { __record_id: "record-a" },
          },
        },
        cellData: {
          "0": {
            "0": { v: "record-a", t: 1 },
            "1": { v: "old value", t: 1 },
          },
        },
      });
      const baseBlock = await univerfile.databaseAdapter.getSheetBlock(
        context(),
        "base-1",
        "base-block",
      );
      expect(readJsonBytes(baseBlock?.data)).toEqual({
        "0": {
          "0": { v: "record-a", t: 1 },
          "1": { v: "blocked value", t: 1 },
        },
      });
      const baseChangeset = univerfile.databaseAdapter.getChangeset("base-1", 2);
      const createTable = readMutationData(baseChangeset, 0);
      expect(createTable.op[1][2].i).toMatchObject({
        fieldOrder: ["__record_id", "primary"],
        colIndex: { __record_id: 0, primary: 1 },
      });
      const createField = readMutationData(baseChangeset, 1);
      expect(createField.op).toEqual([
        "tables",
        "table-b",
        ["fieldOrder", 2, { i: "field-2" }],
        ["fields", "field-2", { i: { id: "field-2", name: "Owner", type: "text", config: {} } }],
        ["views", "view-table-b", "fieldOrder", 2, { i: "field-2" }],
      ]);
      const updateCell = readMutationData(baseChangeset, 2);
      expect(updateCell.op[2]).toEqual(["cellData", "0", "1", { i: { v: "new value", t: 1 } }]);
      expect(readMutationData(baseChangeset, 3)).toMatchObject({
        reference: { range: { startColumn: 0, endColumn: 2 } },
      });
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

  it("opens v2 with retired tables and v1 logical commit storage as ignored extras", async () => {
    const filename = databasePath();
    const created = createUniverfileSQLite(filename);
    await created.dispose();

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
      `);
      createRetiredLocalStorageSchema(database);
    } finally {
      database.close();
    }
    const originalHash = sha256(filename);

    expect(detectUniverfileSQLiteFormat(filename)).toBe("v2");
    const opened = openUniverfileSQLite(filename);
    expect(opened.upgrade).toEqual({ status: "unchanged", format: "v2" });
    await opened.dispose();

    expect(sha256(filename)).toBe(originalHash);
    expect(readdirSync(dirname(filename)).filter((entry) => entry.includes(".backup-"))).toEqual(
      [],
    );
  });

  it("does not treat an already-v2 file as a Base repair target", async () => {
    const filename = databasePath();
    const created = createUniverfileSQLite(filename);
    await created.databaseAdapter.createUnit(context(), {
      record: { unitID: "base-v2", type: UniverType.UNIVER_BASE, headRevision: 1 },
      snapshot: legacyBaseSnapshot("base-v2"),
    });
    await created.dispose();

    const opened = openUniverfileSQLite(filename);
    try {
      expect(opened.upgrade).toEqual({ status: "unchanged", format: "v2" });
      const snapshot = await opened.databaseAdapter.getSnapshot(context(), "base-v2");
      expect(readJsonBytes(snapshot?.workbook?.originalMeta)).toMatchObject({ schemaVersion: 1 });
    } finally {
      await opened.dispose();
    }
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
      expect(opened.databaseAdapter.listUnits()).toHaveLength(2);
      expect(opened.assetStore.countAssets()).toBe(0);
    } finally {
      await opened.dispose();
    }
    expect(detectFormat(filename)).toEqual([
      { component: "assets", version: 1 },
      { component: "core", version: 1 },
      { component: "history", version: 1 },
      { component: "worktree", version: 2 },
    ]);
  });

  it("prioritizes component versions and prunes source-only tables from a v1 candidate", async () => {
    const filename = databasePath();
    await createV1Fixture(filename);
    const source = new Database(filename);
    try {
      source.exec(`
        DROP TABLE collaboration_assets;
        DROP TABLE collaboration_asset_blobs;
        DELETE FROM collaboration_schema_versions WHERE component = 'assets';
      `);
      createRetiredLocalStorageSchema(source);
      source.exec(`
        CREATE TABLE source_only_notes (id INTEGER PRIMARY KEY, note TEXT NOT NULL);
        CREATE INDEX source_only_notes_text ON source_only_notes(note);
        CREATE VIEW source_only_notes_view AS SELECT id, note FROM source_only_notes;
        CREATE TRIGGER source_only_notes_insert
        AFTER INSERT ON source_only_notes BEGIN
          UPDATE source_only_notes SET note = NEW.note WHERE id = NEW.id;
        END;
        INSERT INTO source_only_notes (id, note) VALUES (1, 'kept in backup only');
      `);
    } finally {
      source.close();
    }
    const originalHash = sha256(filename);

    expect(detectUniverfileSQLiteFormat(filename)).toBe("v1");
    const opened = openUniverfileSQLite(filename);
    expect(opened.upgrade).toMatchObject({
      status: "upgraded",
      sourceFormat: "v1",
      targetFormat: "v2",
      backupSha256: originalHash,
      verification: { units: 2, worktrees: 1, assets: 0 },
    });
    const backupPath = opened.upgrade.status === "upgraded" ? opened.upgrade.backupPath : undefined;
    await opened.dispose();

    const upgraded = new Database(filename, { readonly: true });
    try {
      expect(
        upgraded
          .prepare(
            `SELECT type, name
             FROM sqlite_schema
             WHERE name IN (${[...RETIRED_LOCAL_STORAGE_TABLES, "source_only_notes", "source_only_notes_text", "source_only_notes_view", "source_only_notes_insert"].map(() => "?").join(", ")})`,
          )
          .all(
            ...RETIRED_LOCAL_STORAGE_TABLES,
            "source_only_notes",
            "source_only_notes_text",
            "source_only_notes_view",
            "source_only_notes_insert",
          ),
      ).toEqual([]);
    } finally {
      upgraded.close();
    }

    expect(backupPath).toBeDefined();
    const backup = new Database(backupPath!, { readonly: true });
    try {
      expect(backup.prepare("SELECT note FROM source_only_notes WHERE id = 1").get()).toMatchObject(
        { note: "kept in backup only" },
      );
      expect(backup.prepare("SELECT COUNT(*) AS count FROM units").get()).toMatchObject({
        count: 0,
      });
    } finally {
      backup.close();
    }
  });
});

const RETIRED_LOCAL_STORAGE_TABLES = [
  "units",
  "init_datas",
  "local_changesets",
  "local_mutations",
  "synced_changesets",
  "sac_applied_migrations",
  "sac_mutation_locks",
] as const;

function createRetiredLocalStorageSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE units (
      local_unit_id TEXT PRIMARY KEY,
      remote_unit_id TEXT UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      init_rev INTEGER,
      synced_rev INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
    CREATE TABLE init_datas (
      local_unit_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL,
      FOREIGN KEY (local_unit_id) REFERENCES units(local_unit_id) ON DELETE CASCADE
    );
    CREATE TABLE local_changesets (
      local_unit_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      changeset_json TEXT NOT NULL,
      PRIMARY KEY (local_unit_id, position),
      FOREIGN KEY (local_unit_id) REFERENCES units(local_unit_id) ON DELETE CASCADE
    );
    CREATE TABLE local_mutations (
      local_unit_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      mutation_json TEXT NOT NULL,
      PRIMARY KEY (local_unit_id, position),
      FOREIGN KEY (local_unit_id) REFERENCES units(local_unit_id) ON DELETE CASCADE
    );
    CREATE TABLE synced_changesets (
      local_unit_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      changeset_json TEXT NOT NULL,
      PRIMARY KEY (local_unit_id, revision),
      FOREIGN KEY (local_unit_id) REFERENCES units(local_unit_id) ON DELETE CASCADE
    );
    CREATE TABLE sac_applied_migrations (
      position INTEGER PRIMARY KEY,
      pack_id TEXT NOT NULL UNIQUE,
      entry_json TEXT NOT NULL
    );
    CREATE TABLE sac_mutation_locks (
      lock_key TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      owner_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

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
    await univerfile.databaseAdapter.createUnit(
      context({ "@univer/univerfile-sqlite/unit-metadata": { name: "Legacy Base" } }),
      {
        record: { unitID: "base-1", type: UniverType.UNIVER_BASE, headRevision: 1 },
        snapshot: legacyBaseSnapshot("base-1"),
        sheetBlocks: [
          {
            id: "base-block",
            startRow: 0,
            endRow: 0,
            data: jsonBytes({ "0": { "0": { v: "blocked value", t: 1 } } }),
          },
        ],
      },
    );
    await univerfile.databaseAdapter.commitChangeset(context(), {
      changeset: legacyBaseChangeset("base-1"),
    });
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
    await univerfile.worktreeDatabaseAdapter.createUnit(context(), {
      unit: {
        worktreeID: "wt-1",
        unitID: "base-wt",
        type: UniverType.UNIVER_BASE,
        source: "worktree",
        draftHeadRevision: 1,
      },
      seed: { snapshot: legacyBaseSnapshot("base-wt") },
    });
    await univerfile.worktreeDatabaseAdapter.commitDraftChangeset(context(), {
      worktreeID: "wt-1",
      changeset: legacyBaseChangeset("base-wt"),
    });
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

function legacyBaseSnapshot(unitId: string): ISnapshot {
  const table = legacyBaseTable("table-a", "record-a", "old value");
  return {
    unitID: unitId,
    type: UniverType.UNIVER_BASE,
    rev: 1,
    workbook: {
      unitID: unitId,
      rev: 1,
      creator: "",
      name: "Legacy Base",
      sheetOrder: ["table-a"],
      sheets: {
        "table-a": {
          id: "table-a",
          type: 0,
          name: "Table A",
          rowCount: 1,
          columnCount: 1,
          originalMeta: jsonBytes(table),
        },
      },
      blockMeta: { "table-a": { sheetID: "table-a", blocks: ["base-block"] } },
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

function legacyBaseChangeset(unitId: string): IChangeset {
  const table = legacyBaseTable("table-b", "record-b", undefined);
  return {
    unitID: unitId,
    type: UniverType.UNIVER_BASE,
    baseRev: 1,
    revision: 2,
    sid: "legacy-base",
    reqId: 1,
    mutations: [
      baseMutation(unitId, [
        ["tableOrder", 1, { i: "table-b" }],
        ["tables", "table-b", { i: table }],
      ]),
      baseMutation(unitId, [
        "tables",
        "table-b",
        ["fieldOrder", 1, { i: "field-2" }],
        ["fields", "field-2", { i: { id: "field-2", name: "Owner", type: "text", config: {} } }],
        ["views", "view-table-b", "fieldOrder", 1, { i: "field-2" }],
      ]),
      baseMutation(unitId, [
        "tables",
        "table-b",
        ["cellData", "0", "0", { i: { v: "new value", t: 1 } }],
        ["records", "record-b", "values", "primary", { i: "new value" }],
      ]),
      {
        id: "formula.mutation.set-super-table",
        data: JSON.stringify({
          unitId,
          tableName: "Table B",
          reference: {
            sheetId: "table-b",
            titleMap: {},
            range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 },
            showHeader: false,
          },
        }),
      },
    ],
  };
}

function baseMutation(unitId: string, op: unknown): IChangeset["mutations"][number] {
  return {
    id: "base.mutation.apply-base-json1",
    data: JSON.stringify({ unitId, op }),
  };
}

function legacyBaseTable(tableId: string, recordId: string, value: string | undefined): object {
  return {
    id: tableId,
    name: tableId === "table-a" ? "Table A" : "Table B",
    primaryFieldId: "primary",
    fieldOrder: ["primary"],
    fields: {
      primary: { id: "primary", name: "Name", type: "text", config: {} },
    },
    records: {
      [recordId]: {
        id: recordId,
        values: value === undefined ? {} : { primary: value },
        orderKey: "0001",
        createdAt: 1,
        updatedAt: 1,
      },
    },
    recordOrder: [recordId],
    rowIndex: { [recordId]: 0 },
    rowId: { "0": recordId },
    colIndex: { primary: 0 },
    colId: { "0": "primary" },
    cellData: { "0": value === undefined ? {} : { "0": { v: value, t: 1 } } },
    resources: { attachmentSets: {}, attachments: {} },
    views: {
      [`view-${tableId}`]: {
        id: `view-${tableId}`,
        tableId,
        name: "Grid",
        type: "grid",
        fieldOrder: ["primary"],
        fieldSettings: {},
        config: { frozenFieldCount: 1 },
      },
    },
    viewOrder: [`view-${tableId}`],
  };
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function readJsonBytes(value: unknown): Record<string, any> {
  expect(value).toBeInstanceOf(Uint8Array);
  return JSON.parse(new TextDecoder().decode(value as Uint8Array)) as Record<string, any>;
}

function readMutationData(changeset: IChangeset | undefined, index: number): Record<string, any> {
  expect(changeset).toBeDefined();
  const mutation = changeset?.mutations?.[index];
  expect(mutation?.data).toBeTypeOf("string");
  return JSON.parse(mutation!.data) as Record<string, any>;
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
