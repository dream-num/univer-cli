import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverInstanceType } from "@univerjs/core";
import type { IMutation } from "@univerjs/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type StartedServer } from "../src/server.js";
import { changeWorktree } from "./change-worktree.js";

describe("agent comparison context HTTP endpoint", () => {
  let dir: string;
  let server: StartedServer;
  let fileEndpoint: string;
  let key: string;

  beforeEach(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "compare-context-")));
    const filePath = join(dir, "context.univer");
    key = Buffer.from(filePath).toString("base64url");
    server = await startServer({ port: 0, allowedRoot: dir });
    fileEndpoint = `http://127.0.0.1:${server.port}/uf/${key}`;
    await fetch(fileEndpoint, { method: "POST", body: "{}" });
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { force: true, recursive: true });
  });

  it("filters and pages a real pinned Sheet comparison", async () => {
    const service = server.manager.resolveByKey(key).collab;
    const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    const right = service.createWorktree("agent", "Right");
    await changeWorktree(service, right.worktreeId, "two changes", {
      modify: {
        [sheet.unitId]: [setCell(sheet.unitId, 0, "One"), setCell(sheet.unitId, 1, "Two")].flat(),
      },
    });
    const session = service.createUnitComparison(right.worktreeId);

    const response = await fetch(
      `${fileEndpoint}/worktrees/${right.worktreeId}/comparisons/${session.comparisonId}/units/${sheet.unitId}/diff?entityType=cell&limit=1&detail=changes`,
    );
    const body = (await response.json()) as {
      context: {
        detail: string;
        items: readonly unknown[];
        scopes: readonly { entityType: string; stableId: string }[];
      };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      error: { code: 1 },
      context: {
        schemaVersion: 1,
        comparisonId: session.comparisonId,
        detail: "changes",
        page: { offset: 0, limit: 1, matched: 2, hasMore: true },
        items: [
          {
            entityType: "cell",
            kind: "insert",
            changes: expect.arrayContaining([
              { path: ["value"], kind: "insert", after: "One", valueType: "text" },
            ]),
          },
        ],
      },
    });
    expect(body.context.items[0]).not.toHaveProperty("values");
    const scope = body.context.scopes[0];
    if (scope === undefined) throw new Error("Expected a changed worksheet scope");
    const scopedResponse = await fetch(
      `${fileEndpoint}/worktrees/${right.worktreeId}/comparisons/${session.comparisonId}/units/${sheet.unitId}/diff?scopeEntityType=${scope.entityType}&scopeStableId=${scope.stableId}`,
    );
    const scopedBody = (await scopedResponse.json()) as {
      context: { items: readonly { scope?: { stableId: string } }[] };
    };
    expect(scopedBody.context.items.length).toBeGreaterThan(0);
    expect(scopedBody.context.items.every((item) => item.scope?.stableId === scope.stableId)).toBe(
      true,
    );
  });

  it("returns a typed business error for an invalid context query", async () => {
    const service = server.manager.resolveByKey(key).collab;
    const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    const right = service.createWorktree("agent", "Right");
    const session = service.createUnitComparison(right.worktreeId);

    const response = await fetch(
      `${fileEndpoint}/worktrees/${right.worktreeId}/comparisons/${session.comparisonId}/units/${sheet.unitId}/diff?kind=equal`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      error: { code: 0, message: "kind must contain only delete, insert, or update" },
    });
  });

  it("rejects an incomplete scope query", async () => {
    const service = server.manager.resolveByKey(key).collab;
    const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    const right = service.createWorktree("agent", "Right");
    const session = service.createUnitComparison(right.worktreeId);

    const response = await fetch(
      `${fileEndpoint}/worktrees/${right.worktreeId}/comparisons/${session.comparisonId}/units/${sheet.unitId}/diff?scopeEntityType=worksheet`,
    );

    expect(await response.json()).toMatchObject({
      error: { code: 0, message: "scopeEntityType and scopeStableId must be supplied together" },
    });
  });

  it("rejects a zero page limit instead of silently changing it", async () => {
    const service = server.manager.resolveByKey(key).collab;
    const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    const right = service.createWorktree("agent", "Right");
    const session = service.createUnitComparison(right.worktreeId);

    const response = await fetch(
      `${fileEndpoint}/worktrees/${right.worktreeId}/comparisons/${session.comparisonId}/units/${sheet.unitId}/diff?limit=0`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      error: { code: 0, message: "limit must be a positive integer" },
    });
  });

  it("rejects an unknown detail projection", async () => {
    const service = server.manager.resolveByKey(key).collab;
    const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    const right = service.createWorktree("agent", "Right");
    const session = service.createUnitComparison(right.worktreeId);

    const response = await fetch(
      `${fileEndpoint}/worktrees/${right.worktreeId}/comparisons/${session.comparisonId}/units/${sheet.unitId}/diff?detail=everything`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      error: { code: 0, message: "detail must be summary, changes, or full" },
    });
  });
});

function setCell(unitId: string, row: number, value: string): IMutation[] {
  return [
    {
      id: "sheet.mutation.set-range-values",
      data: JSON.stringify({
        unitId,
        subUnitId: "sheet-1",
        cellValue: { [row]: { 0: { v: value, t: 1 } } },
      }),
    },
  ] as unknown as IMutation[];
}
