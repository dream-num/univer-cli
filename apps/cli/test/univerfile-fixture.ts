import { transformWorkbookDataToSnapshot } from "@univerjs-pro/collaboration";
import {
  createUniverfileSQLite,
  openUniverfileSQLite,
  UNIVERFILE_UNIT_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY,
} from "@univer/univerfile-sqlite";
import type { IWorkbookData } from "@univerjs/core";
import { ErrorCode, UniverType, type ISheetBlock, type ISnapshot } from "@univerjs/protocol";
import Database from "libsql";

export async function createV2Fixture(filename: string): Promise<void> {
  const blocks: ISheetBlock[] = [];
  const snapshots: ISnapshot[] = [];
  const { snapshot } = await transformWorkbookDataToSnapshot(
    {},
    workbookData(),
    "unit-1",
    1,
    snapshotWriter(blocks, snapshots),
  );
  const univerfile = createUniverfileSQLite(filename);
  try {
    const customData = {
      [UNIVERFILE_UNIT_METADATA_KEY]: { name: "Runtime fixture" },
    };
    await univerfile.databaseAdapter.createUnit(
      {
        userID: "test",
        customData,
        request: {},
      },
      {
        record: { unitID: "unit-1", type: UniverType.UNIVER_SHEET, headRevision: 1 },
        sheetBlocks: blocks,
        snapshot,
      },
    );
  } finally {
    await univerfile.dispose();
  }
}

export async function createV1Fixture(filename: string): Promise<void> {
  await createV2Fixture(filename);
  makeV1(filename);
}

export async function createV1ActiveWorktreeFixture(filename: string): Promise<{
  readonly unitId: string;
  readonly worktreeId: string;
}> {
  await createV2Fixture(filename);
  const univerfile = openUniverfileSQLite(filename);
  const worktreeId = "legacy-active-worktree";
  try {
    const customData = {
      [UNIVERFILE_WORKTREE_METADATA_KEY]: {
        agentId: "legacy-agent",
        createdAtMs: 1,
        name: "Legacy active task",
        unitNames: { "unit-1": "Runtime fixture" },
      },
    };
    await univerfile.worktreeDatabaseAdapter.createWorktreeForGateway(
      {
        userID: "test",
        customData,
        request: {},
      },
      {
        record: { worktreeID: worktreeId, sid: "legacy-session", status: "draft" },
        units: [
          {
            worktreeID: worktreeId,
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
  makeV1(filename);
  return { unitId: "unit-1", worktreeId };
}

function snapshotWriter(
  blocks: ISheetBlock[],
  snapshots: ISnapshot[],
): Parameters<typeof transformWorkbookDataToSnapshot>[4] {
  return {
    saveSheetBlock: async (_context, request) => {
      if (!request.block) throw new Error("Expected a Sheet block");
      blocks.push(request.block);
      return {
        blockID: request.block.id,
        error: { code: ErrorCode.OK, message: "" },
      };
    },
    saveSnapshot: async (_context, request) => {
      if (!request.snapshot) throw new Error("Expected a Snapshot");
      snapshots.push(request.snapshot);
      return { error: { code: ErrorCode.OK, message: "" } };
    },
  } as Parameters<typeof transformWorkbookDataToSnapshot>[4];
}

function makeV1(filename: string): void {
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

      UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'worktree';

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
  } finally {
    database.close();
  }
}

function workbookData(): IWorkbookData {
  return {
    appVersion: "",
    id: "unit-1",
    locale: "enUS",
    name: "Runtime fixture",
    resources: [],
    rev: 1,
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        cellData: { 0: { 0: { v: "runtime" } } },
        columnCount: 5,
        id: "sheet-1",
        name: "Sheet 1",
        rowCount: 10,
      },
    },
    styles: {},
  } as IWorkbookData;
}
