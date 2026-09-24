import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverInstanceType } from "@univerjs/core";
import type { IMutation } from "@univerjs/protocol";
import { UniverfileSQLiteConnection } from "@univer/univerfile-sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { startServer, type StartedServer } from "../src/server.js";
import { changeWorktree } from "./change-worktree.js";

const directories: string[] = [];
const servers: StartedServer[] = [];
const LOCAL = { userID: "local", customData: {} };

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("trunk History", () => {
  it("rebuilds a missing derived index from authoritative trunk revisions on reopen", async () => {
    const filename = databasePath();
    const created = new CollabService({ dbPath: filename, create: true });
    const unit = await created.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Budget" });
    await waitForLatestStart(created, unit.unitId, 1);
    created.runtime.historyAdapter.resetUnit(unit.unitId);
    await created.dispose();

    const reopened = new CollabService({ dbPath: filename });
    try {
      await reopened.runtime.historyReady;
      expect(reopened.runtime.historyAdapter.latestStartRevision(unit.unitId)).toBeNull();
      expect(
        (await reopened.runtime.historyService.getHistoryList(
          { unitID: unit.unitId, length: 20 },
          LOCAL,
        )).historyIds,
      ).toEqual([`${unit.unitId}:1`]);
      await waitForLatestStart(reopened, unit.unitId, 1);
    } finally {
      await reopened.dispose();
    }
  });

  it("indexes merged trunk changesets and drops boundaries beyond the trunk head", async () => {
    const filename = databasePath();
    const created = new CollabService({ dbPath: filename, create: true });
    const unit = await created.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Budget" });
    const worktree = created.createWorktree("agent-1", "edit");
    await changeWorktree(created, worktree.worktreeId, "edit", {
      modify: { [unit.unitId]: [cellMutation(unit.unitId)] },
    });
    expect((await created.merge(worktree.worktreeId)).ok).toBe(true);
    await waitForLatestStart(created, unit.unitId, 2);
    const [latest] = (
      await created.runtime.historyAdapter.listRecords(
        { userID: "local", customData: {}, request: {} },
        unit.unitId,
        { throughRevision: 2, length: 20 },
      )
    ).records;
    expect(latest).toMatchObject({ record: { startRevision: 2 }, endRevision: 2 });
    expect(latest!.record.createdAt % 1000).toBe(0);
    await created.dispose();

    const connection = new UniverfileSQLiteConnection({ filename });
    try {
      connection.database
        .prepare(
          `INSERT INTO collaboration_history_records
             (unit_id, start_revision, user_id, created_at_ms, origin, additional_fields)
           VALUES (?, 9, 'local', 9000, 1, NULL)`,
        )
        .run(unit.unitId);
    } finally {
      connection.dispose();
    }

    const reopened = new CollabService({ dbPath: filename });
    try {
      await reopened.runtime.historyReady;
      expect(reopened.runtime.historyAdapter.latestStartRevision(unit.unitId)).toBeNull();
      expect(
        (await reopened.runtime.historyService.getHistoryList(
          { unitID: unit.unitId, length: 20 },
          LOCAL,
        )).historyIds,
      ).toEqual([`${unit.unitId}:2`, `${unit.unitId}:1`]);
    } finally {
      await reopened.dispose();
    }
  });

  it("serves the History protocol from the file-addressed Gateway route", async () => {
    const directory = temporaryDirectory();
    const filename = join(directory, "history.univer");
    const key = Buffer.from(filename).toString("base64url");
    const server = await startServer({ port: 0, allowedRoot: directory });
    servers.push(server);
    const univerfile = server.manager.createByKey(key);
    const unit = await univerfile.collab.createUnit(UniverInstanceType.UNIVER_SHEET, {
      name: "History",
    });
    await waitForLatestStart(univerfile.collab, unit.unitId, 1);

    const response = await fetch(
      `http://127.0.0.1:${server.port}/uf/${key}/universer-api/history/${unit.unitId}/list?length=20`,
      { headers: { "x-user-id": "local" } },
    );
    const body = (await response.json()) as {
      error: { code: number };
      historyIds: string[];
    };

    expect(response.status).toBe(200);
    expect(body.error.code).toBe(1);
    expect(body.historyIds).toHaveLength(1);
  });
});

async function waitForLatestStart(
  service: CollabService,
  unitID: string,
  startRevision: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (service.runtime.historyAdapter.latestStartRevision(unitID) === startRevision) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`History did not reach ${unitID}@${startRevision}`);
}

function cellMutation(unitId: string): IMutation {
  return {
    id: "sheet.mutation.set-range-values",
    data: JSON.stringify({
      unitId,
      subUnitId: "sheet-1",
      cellValue: { 0: { 0: { v: 42 } } },
    }),
  } as IMutation;
}

function databasePath(): string {
  return join(temporaryDirectory(), "history.univer");
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "collab-history-"));
  directories.push(directory);
  return directory;
}
