import {
  createDefaultBaseTableSnapshot,
  UniverInstanceType,
  type IBaseSnapshot,
} from "@univerjs/core";
import type { IMutation } from "@univerjs/protocol";
import { describe, expect, it, vi } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { decodeComparisonUnitData } from "../src/comparison-unit-data.js";
import { changeWorktree } from "./change-worktree.js";

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

describe("pinned Worktree Unit comparisons", () => {
  it("retries a pinned comparison after a transient storage read failure", async () => {
    const service = new CollabService();
    try {
      const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Retry" });
      const branch = service.createWorktree("retry");
      const session = service.createUnitComparison(branch.worktreeId);
      const storageRead = vi.spyOn(service.runtime.trunkAdapter, "getSnapshot");
      storageRead.mockRejectedValueOnce(new Error("Transient snapshot storage failure"));
      const args = [branch.worktreeId, session.comparisonId, unit.unitId] as const;
      await expect(service.getUnitComparisonContext(...args)).rejects.toThrow("Database Adapter failed");
      storageRead.mockRestore();
      expect((await service.getUnitComparisonContext(...args)).items).toEqual([]);
      expect((await service.getUnitComparison(...args)).comparisonId).toBe(session.comparisonId);
    } finally {
      vi.restoreAllMocks();
      await service.dispose();
    }
  });

  it("expires materialized and pending contexts together when the session window advances", async () => {
    const service = new CollabService();
    try {
      const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Eviction" });
      const branch = service.createWorktree("eviction");
      const first = service.createUnitComparison(branch.worktreeId);
      await service.getUnitComparison(branch.worktreeId, first.comparisonId, unit.unitId);
      const pending = service.getUnitComparisonContext(branch.worktreeId, first.comparisonId, unit.unitId);
      const expired = expect(pending).rejects.toThrow(/expired|not found/u);
      let last = first;
      for (let index = 0; index < 65; index++) last = service.createUnitComparison(branch.worktreeId);
      await expired;
      await expect(service.getUnitComparison(branch.worktreeId, first.comparisonId, unit.unitId)).rejects.toThrow(/expired|not found/u);
      await expect(service.getUnitComparisonContext(branch.worktreeId, first.comparisonId, unit.unitId)).rejects.toThrow(/expired|not found/u);
      expect((await service.getUnitComparisonContext(branch.worktreeId, last.comparisonId, unit.unitId)).items).toEqual([]);
      await service.dispose();
      await expect(service.getUnitComparisonContext(branch.worktreeId, last.comparisonId, unit.unitId)).rejects.toThrow(/not found/u);
    } finally {
      await service.dispose();
    }
  });

  it("shares concurrent materialization without leaking consumed Sheet blocks to later readers", async () => {
    const service = new CollabService();
    try {
      const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Shared" });
      const branch = service.createWorktree("shared");
      await changeWorktree(service, branch.worktreeId, "edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, "Pinned value") },
      });
      const session = service.createUnitComparison(branch.worktreeId);
      const args = [branch.worktreeId, session.comparisonId, sheet.unitId] as const;
      const [first, second, context] = await Promise.all([
        service.getUnitComparison(...args), service.getUnitComparison(...args), service.getUnitComparisonContext(...args),
      ]);
      expect(first).toEqual(second);
      expect(first.right.snapshot).not.toBe(second.right.snapshot);
      const canonical = structuredClone(first);
      const decoded = await decodeComparisonUnitData(UniverInstanceType.UNIVER_SHEET, first.right.snapshot, first.right.sheetBlocks);
      expect(first).toEqual(canonical);
      const again = await service.getUnitComparison(...args);
      expect(again).toEqual(canonical);
      expect(await decodeComparisonUnitData(UniverInstanceType.UNIVER_SHEET, again.right.snapshot, again.right.sheetBlocks)).toEqual(decoded);
      expect(context.items).toEqual((await service.getUnitComparisonContext(...args)).items);
    } finally {
      await service.dispose();
    }
  });

  it("materializes both branch heads and keeps them pinned after either side advances", async () => {
    const service = new CollabService();
    try {
      const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
      const right = service.createWorktree("right");
      const advanceTrunk = service.createWorktree("trunk");

      await changeWorktree(service, right.worktreeId, "right edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 1, "right") },
      });
      await changeWorktree(service, advanceTrunk.worktreeId, "trunk edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, "trunk") },
      });
      await service.merge(advanceTrunk.worktreeId);

      const session = service.createUnitComparison(right.worktreeId);
      expect(session.left).toMatchObject({ kind: "trunk", heads: { [sheet.unitId]: 2 } });
      expect(session.right).toMatchObject({
        kind: "worktree",
        worktreeId: right.worktreeId,
        heads: { [sheet.unitId]: 2 },
      });

      const first = await service.getUnitComparison(
        right.worktreeId,
        session.comparisonId,
        sheet.unitId,
      );
      expect(first.fidelity).toBe("history");
      expect(first.commonBaseRevision).toBe(1);
      expect(first.left.revision).toBe(2);
      expect(first.right.revision).toBe(2);
      expect(first.left.snapshot?.rev).toBe(2);
      expect(first.right.snapshot?.rev).toBe(2);
      expect(first.leftChangesets).toHaveLength(1);
      expect(first.rightChangesets).toHaveLength(1);
      expect(first.stale).toBe(false);

      const context = await service.getUnitComparisonContext(
        right.worktreeId,
        session.comparisonId,
        sheet.unitId,
        { entityTypes: ["cell"], limit: 1, includeValues: false },
      );
      expect(context).toMatchObject({
        schemaVersion: 1,
        comparisonId: session.comparisonId,
        fidelity: "history",
        diagnostics: { readiness: "ready" },
        page: { offset: 0, limit: 1, matched: 2, hasMore: true },
      });
      expect(context.items[0]).toMatchObject({ entityType: "cell" });
      expect(context.items[0]).not.toHaveProperty("values");

      await changeWorktree(service, right.worktreeId, "later edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 2, "later") },
      });
      const cachedContext = await service.getUnitComparisonContext(
        right.worktreeId,
        session.comparisonId,
        sheet.unitId,
        { entityTypes: ["cell"], offset: 1, limit: 1, includeValues: false },
      );
      expect(cachedContext).toMatchObject({
        stale: true,
        page: { offset: 1, limit: 1, matched: 2, hasMore: false },
      });
      const pinned = await service.getUnitComparison(
        right.worktreeId,
        session.comparisonId,
        sheet.unitId,
      );
      expect(pinned.right.revision).toBe(2);
      expect(pinned.right.snapshot?.rev).toBe(2);
      expect(pinned.rightChangesets).toHaveLength(1);
      expect(pinned.stale).toBe(true);
    } finally {
      service.dispose();
    }
  });

  it("compares another active Worktree through their common Trunk ancestor", async () => {
    const service = new CollabService();
    try {
      const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
      const left = service.createWorktree("left", "Left");
      const right = service.createWorktree("right", "Right");
      await changeWorktree(service, left.worktreeId, "left edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, "left") },
      });
      await changeWorktree(service, right.worktreeId, "right edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 1, "right") },
      });

      const session = service.createUnitComparison(right.worktreeId, {
        kind: "worktree",
        worktreeId: left.worktreeId,
      });
      const comparison = await service.getUnitComparison(
        right.worktreeId,
        session.comparisonId,
        sheet.unitId,
      );

      expect(session.left).toMatchObject({ kind: "worktree", worktreeId: left.worktreeId });
      expect(comparison.fidelity).toBe("history");
      expect(comparison.commonBaseRevision).toBe(1);
      expect(comparison.leftChangesets).toHaveLength(1);
      expect(comparison.rightChangesets).toHaveLength(1);
    } finally {
      service.dispose();
    }
  });

  it("materializes Base blocks on both comparison sides", async () => {
    const service = new CollabService();
    try {
      const table = createDefaultBaseTableSnapshot({
        id: "table-1",
        name: "Tasks",
        primaryFieldId: "title",
        primaryFieldName: "Title",
        recordCount: 2,
        recordNamePrefix: "Task",
        now: 1,
      });
      const baseData: IBaseSnapshot = {
        id: "base-1",
        name: "Base",
        schemaVersion: 2,
        createdAt: 1,
        updatedAt: 1,
        tableOrder: [table.id],
        tables: { [table.id]: table },
      };
      const base = await service.createUnit(UniverInstanceType.UNIVER_BASE, {
        unitId: baseData.id,
        name: baseData.name,
        data: baseData,
      });
      const right = service.createWorktree("right");
      const session = service.createUnitComparison(right.worktreeId);

      const comparison = await service.getUnitComparison(
        right.worktreeId,
        session.comparisonId,
        base.unitId,
      );

      expect(comparison.left.sheetBlocks).toHaveLength(1);
      expect(comparison.right.sheetBlocks).toHaveLength(1);
      expect(comparison.left.snapshot?.workbook?.blockMeta[table.id]?.blocks).toEqual([
        comparison.left.sheetBlocks?.[0]?.id,
      ]);
      expect(comparison.right.snapshot?.workbook?.blockMeta[table.id]?.blocks).toEqual([
        comparison.right.sheetBlocks?.[0]?.id,
      ]);
    } finally {
      service.dispose();
    }
  });

  it("keeps left-only and right-only Units as mirrored snapshot gaps", async () => {
    const service = new CollabService();
    try {
      const kept = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Kept" });
      const deleted = await service.createUnit(UniverInstanceType.UNIVER_DOC, { name: "Deleted" });
      const right = service.createWorktree("right");
      await changeWorktree(service, right.worktreeId, "presence changes", {
        create: [
          {
            type: UniverInstanceType.UNIVER_SLIDE,
            name: "Created",
            unitId: "created-slide",
          },
        ],
        delete: [deleted.unitId],
      });

      const session = service.createUnitComparison(right.worktreeId);
      expect(session.units).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unitId: kept.unitId, presence: "paired" }),
          expect.objectContaining({ unitId: deleted.unitId, presence: "left-only" }),
          expect.objectContaining({ unitId: "created-slide", presence: "right-only" }),
        ]),
      );

      const leftOnly = await service.getUnitComparison(
        right.worktreeId,
        session.comparisonId,
        deleted.unitId,
      );
      expect(leftOnly).toMatchObject({
        fidelity: "snapshot",
        left: { present: true },
        right: { present: false },
      });

      const rightOnly = await service.getUnitComparison(
        right.worktreeId,
        session.comparisonId,
        "created-slide",
      );
      expect(rightOnly).toMatchObject({
        fidelity: "snapshot",
        left: { present: false },
        right: { present: true },
      });
    } finally {
      service.dispose();
    }
  });
});
