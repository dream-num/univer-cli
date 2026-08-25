import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseContext, UnitRecord } from "@univerjs-pro/collaboration-service";
import type {
  WorktreeRecord,
  WorktreeUnitRecord,
} from "@univerjs-pro/collaboration-worktree-service";
import { UniverType, type IChangeset, type ISnapshot } from "@univerjs/protocol";
import Database from "libsql";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UniverfileSQLiteConnection } from "../src/connection.js";
import { UniverfileSQLiteAssetStore } from "../src/database-adapters/asset-store.js";
import {
  UNIVERFILE_UNIT_METADATA_KEY,
  UniverfileSQLiteDatabaseAdapter,
} from "../src/database-adapters/collaboration-database-adapter.js";
import { UniverfileSQLiteHistoryDatabaseAdapter } from "../src/database-adapters/history-database-adapter.js";
import {
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY,
  UniverfileSQLiteWorktreeDatabaseAdapter,
} from "../src/database-adapters/worktree-database-adapter.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "collab-gateway-db-"));
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

function snapshot(unitID: string, type = UniverType.UNIVER_SHEET): ISnapshot {
  return { unitID, type, rev: 1 } as ISnapshot;
}

function unitRecord(unitID: string, type = UniverType.UNIVER_SHEET): UnitRecord {
  return { unitID, type, headRevision: 1 };
}

function worktreeRecord(worktreeID: string): WorktreeRecord {
  return { worktreeID, sid: `sid-${worktreeID}`, status: "draft" };
}

function trunkWorktreeUnit(
  worktreeID: string,
  unitID: string,
  type = UniverType.UNIVER_SHEET,
): WorktreeUnitRecord {
  return {
    worktreeID,
    unitID,
    type,
    source: "trunk",
    baselineTrunkRevision: 1,
    draftHeadRevision: 1,
  };
}

describe("Univerfile SQLite database adapters", () => {
  it("normalizes libsql ArrayBuffer blobs when opening Assets", () => {
    const filename = databasePath();
    const connection = new UniverfileSQLiteConnection({ filename });
    new UniverfileSQLiteDatabaseAdapter({ filename, connection });
    const store = new UniverfileSQLiteAssetStore({ connection });
    const expected = new Uint8Array([0, 1, 2, 127, 255]);
    const record = store.store({
      unitId: "unit-1",
      originalFilename: "fixture.bin",
      mediaType: "application/octet-stream",
      bytes: expected,
    });

    expect(store.open(record.assetId)?.bytes).toEqual(expected);
    connection.dispose();
  });

  it("borrows one file-owned connection across trunk and Worktree adapters", async () => {
    const filename = databasePath();
    const connection = new UniverfileSQLiteConnection({ filename });
    const disposeConnection = vi.spyOn(connection, "dispose");
    const trunk = new UniverfileSQLiteDatabaseAdapter({ filename, connection });
    const worktree = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename, connection });

    await trunk.createUnit(context(), {
      record: unitRecord("unit-1"),
      snapshot: snapshot("unit-1"),
    });
    await worktree.createWorktree(context(), {
      record: worktreeRecord("wt-1"),
      units: [trunkWorktreeUnit("wt-1", "unit-1")],
    });

    await worktree.dispose();
    await trunk.dispose();
    expect(disposeConnection).not.toHaveBeenCalled();

    connection.dispose();
    expect(disposeConnection).toHaveBeenCalledOnce();
  });

  it("persists a rebuildable History index on the shared file connection", async () => {
    const filename = databasePath();
    const connection = new UniverfileSQLiteConnection({ filename });
    const disposeConnection = vi.spyOn(connection, "dispose");
    new UniverfileSQLiteDatabaseAdapter({ filename, connection });
    const history = new UniverfileSQLiteHistoryDatabaseAdapter({ connection });

    expect(
      await history.appendRevision(
        {
          unitID: "unit-1",
          type: UniverType.UNIVER_SHEET,
          revision: 1,
          userID: "user-1",
          commands: ["univer.mutation.create-unit"],
          committedAt: 1_000,
          origin: 1,
          historyRevision: 1,
          forceNextHistory: false,
        },
        { expectedLatestRevision: 0 },
      ),
    ).toEqual({ status: "appended" });
    expect(
      await history.appendRevision(
        {
          unitID: "unit-1",
          type: UniverType.UNIVER_SHEET,
          revision: 2,
          userID: "user-2",
          commands: ["sheet.mutation.set-range-values"],
          committedAt: 1_500,
          origin: 1,
          historyRevision: 1,
          forceNextHistory: false,
        },
        { expectedLatestRevision: 1 },
      ),
    ).toEqual({ status: "appended" });

    expect(await history.getIndexState("unit-1")).toMatchObject({
      latestRevision: 2,
      currentHistoryRevision: 1,
    });
    expect((await history.listRecords("unit-1", { length: 10 })).records).toEqual([
      expect.objectContaining({
        startRevision: 1,
        endRevision: 2,
        userIDs: ["user-1", "user-2"],
      }),
    ]);
    expect(await history.listCreators("unit-1")).toEqual([
      { userID: "user-1", origins: [1] },
      { userID: "user-2", origins: [1] },
    ]);

    history.resetUnit("unit-1");
    expect(await history.getIndexState("unit-1")).toBeNull();
    await history.dispose();
    expect(disposeConnection).not.toHaveBeenCalled();
    connection.dispose();
  });

  it("persists Unit catalog metadata in the SDK create transaction", async () => {
    const filename = databasePath();
    const adapter = new UniverfileSQLiteDatabaseAdapter({ filename });
    const customData = {
      [UNIVERFILE_UNIT_METADATA_KEY]: {
        name: "Budget",
        createdAtMs: 1_234,
      },
    };

    await adapter.createUnit(context(customData), {
      record: unitRecord("unit-1"),
      snapshot: snapshot("unit-1"),
    });

    expect(adapter.listUnits()).toEqual([
      {
        unitId: "unit-1",
        type: UniverType.UNIVER_SHEET,
        name: "Budget",
        headRev: 1,
        createdAt: new Date(1_234).toISOString(),
      },
    ]);
    await adapter.dispose();
  });

  it("persists Worktree metadata, created Unit and deletion without a logical commit log", async () => {
    const filename = databasePath();
    const trunk = new UniverfileSQLiteDatabaseAdapter({ filename });
    await trunk.createUnit(context(), {
      record: unitRecord("trunk-unit"),
      snapshot: snapshot("trunk-unit"),
    });
    const adapter = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename });
    const worktreeID = "wt-1";
    const createContext = context({
      [UNIVERFILE_WORKTREE_METADATA_KEY]: {
        agentId: "agent-1",
        name: "Task",
        createdAtMs: 2_000,
        unitNames: { "trunk-unit": "Budget" },
      },
    });
    await adapter.createWorktree(createContext, {
      record: worktreeRecord(worktreeID),
      units: [trunkWorktreeUnit(worktreeID, "trunk-unit")],
    });

    const createUnitContext = context({
      [UNIVERFILE_WORKTREE_METADATA_KEY]: {
        createdAtMs: 3_000,
        unitNames: { "new-unit": "Notes" },
      },
      [UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY]: {
        createdAtMs: 3_000,
      },
    });
    await adapter.createUnit(createUnitContext, {
      unit: {
        worktreeID,
        unitID: "new-unit",
        type: UniverType.UNIVER_DOC,
        source: "worktree",
        draftHeadRevision: 1,
      },
      seed: { snapshot: snapshot("new-unit", UniverType.UNIVER_DOC) },
    });

    expect(adapter.listWorktrees()).toEqual([
      {
        worktreeId: worktreeID,
        status: "draft",
        agentId: "agent-1",
        name: "Task",
        baseline: { "trunk-unit": 1 },
        createdAt: new Date(2_000).toISOString(),
      },
    ]);
    expect(adapter.listWorktreeUnits(worktreeID)).toEqual([
      {
        unitId: "trunk-unit",
        type: UniverType.UNIVER_SHEET,
        name: "Budget",
        headRev: 1,
      },
      {
        unitId: "new-unit",
        type: UniverType.UNIVER_DOC,
        name: "Notes",
        headRev: 1,
      },
    ]);
    const deleted = adapter.deleteUnit(
      context({
        [UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY]: { createdAtMs: 4_000 },
      }),
      worktreeID,
      "trunk-unit",
    );
    expect(deleted).toEqual({ status: "deleted" });
    expect(adapter.listWorktreeUnits(worktreeID).map((unit) => unit.unitId)).toEqual(["new-unit"]);
    expect(adapter.listDeletedUnits(worktreeID)).toEqual([
      {
        unitId: "trunk-unit",
        type: UniverType.UNIVER_SHEET,
        name: "Budget",
        deleteFromTrunk: true,
      },
    ]);
    expect(adapter.listWorktrees()[0]?.baseline).toEqual({ "trunk-unit": 1 });

    const inspector = new Database(filename, { readonly: true });
    expect(
      inspector
        .prepare(
          "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'collaboration_worktree_commits'",
        )
        .get(),
    ).toBeUndefined();
    expect(
      inspector
        .prepare(
          "SELECT 1 FROM pragma_table_info('collaboration_worktrees') WHERE name = 'head_commit'",
        )
        .get(),
    ).toBeUndefined();
    inspector.close();

    await adapter.dispose();
    await trunk.dispose();
  });

  it("commits an SDK draft changeset without application commit metadata", async () => {
    const filename = databasePath();
    const trunk = new UniverfileSQLiteDatabaseAdapter({ filename });
    const adapter = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename });
    const worktreeID = "wt-1";
    await adapter.createWorktree(context(), {
      record: worktreeRecord(worktreeID),
      units: [trunkWorktreeUnit(worktreeID, "unit-1")],
    });
    const changeset: IChangeset = {
      unitID: "unit-1",
      type: UniverType.UNIVER_SHEET,
      baseRev: 1,
      revision: 2,
      mutations: [],
      sid: "sid-1",
      reqId: 1,
    };

    await adapter.commitDraftChangeset(
      context({
        [UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY]: {
          createdAtMs: 5_000,
        },
      }),
      { worktreeID, changeset },
    );

    expect(adapter.listWorktreeUnits(worktreeID)[0]?.headRev).toBe(2);
    await adapter.dispose();
    await trunk.dispose();
  });

  it("does not enable WAL for a new file", async () => {
    const filename = databasePath();
    const trunk = new UniverfileSQLiteDatabaseAdapter({ filename });
    const worktree = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename });
    await worktree.dispose();
    await trunk.dispose();

    const inspector = new Database(filename);
    expect(
      (
        inspector.pragma("journal_mode", { simple: true }) as {
          journal_mode: string;
        }
      ).journal_mode,
    ).toBe("delete");
    inspector.close();
  });

  it("rejects the pre-database-v1 Gateway schema without partial initialization", () => {
    const filename = databasePath();
    const legacy = new Database(filename);
    legacy.exec("CREATE TABLE units (unit_id TEXT PRIMARY KEY, head_rev INTEGER NOT NULL)");
    legacy.close();

    expect(() => new UniverfileSQLiteDatabaseAdapter({ filename })).toThrow(
      /pre-database-v1.*not supported/i,
    );

    const inspector = new Database(filename);
    const collaborationTables = inspector
      .prepare(
        `SELECT name
         FROM sqlite_schema
         WHERE type = 'table' AND name LIKE 'collaboration_%'`,
      )
      .all() as unknown as Array<{ name: string }>;
    expect(collaborationTables).toEqual([]);
    inspector.close();
  });
});
