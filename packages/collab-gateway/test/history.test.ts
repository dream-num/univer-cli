import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverInstanceType } from "@univerjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { startServer, type StartedServer } from "../src/server.js";

const directories: string[] = [];
const servers: StartedServer[] = [];

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
    await waitForRevision(created, unit.unitId, 1);
    created.runtime.historyAdapter.resetUnit(unit.unitId);
    await created.dispose();

    const reopened = new CollabService({ dbPath: filename });
    try {
      await reopened.runtime.historyReady;
      expect(await reopened.runtime.historyAdapter.getIndexState(unit.unitId)).toMatchObject({
        latestRevision: 1,
        currentHistoryRevision: 1,
      });
      expect(
        (await reopened.runtime.historyService.getHistoryList(
          { unitID: unit.unitId, length: 20 },
          { userID: "local", customData: {} },
        )).historyIds,
      ).toHaveLength(1);
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
    await waitForRevision(univerfile.collab, unit.unitId, 1);

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

async function waitForRevision(
  service: CollabService,
  unitID: string,
  revision: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = await service.runtime.historyAdapter.getIndexState(unitID);
    if (state?.latestRevision === revision) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`History did not reach ${unitID}@${revision}`);
}

function databasePath(): string {
  return join(temporaryDirectory(), "history.univer");
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "collab-history-"));
  directories.push(directory);
  return directory;
}
