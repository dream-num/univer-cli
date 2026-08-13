import type { ILogContext } from "@univerjs-pro/collaboration";
import type { IMutation } from "@univerjs/protocol";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { changeWorktree } from "./change-worktree.js";

const CTX: ILogContext = { metadata: {} };

/** A real sheet set-range-values mutation in protocol wire form (params JSON-stringified into `data`). */
function setCell(unitId: string, row: number, col: number, v: string): IMutation[] {
  return [
    {
      id: "sheet.mutation.set-range-values",
      data: JSON.stringify({
        unitId,
        subUnitId: "sheet-1",
        cellValue: { [row]: { [col]: { v, t: 1 } } }
      })
    }
  ] as unknown as IMutation[];
}

describe("previewMerge: merge preview summary (no writes)", () => {
  it("clean modified unit, trunk not advanced -> modified, mergeable, not diverged", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const w = svc.createWorktree("agent-1");
      await changeWorktree(svc, w.worktreeId, "edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });

      const preview = await svc.previewMerge(w.worktreeId);
      const u = preview.units.find((x) => x.unitId === sheet.unitId);
      expect(u?.status).toBe("modified");
      expect(u?.baseStale).toBe(false);
      expect(u?.baseRev).toBe(1);
      expect(u?.trunkRev).toBe(1);
      expect(preview.mergeable).toBe(true);
      expect(preview.diverged).toBe(false);
      expect(preview.conflicts).toEqual([]);

      // Preview is read-only: trunk must not advance.
      expect(svc.getCurrentRev(sheet.unitId)).toBe(1);
      expect(svc.worktrees.getWorktree(w.worktreeId)?.status).toBe("draft");
    } finally {
      svc.dispose();
    }
  });

  it("trunk advanced under worktree -> clean rebase modified + untouched unit flagged baseStale/diverged", async () => {
    const svc = new CollabService();
    try {
      const s1 = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S1" });
      const s2 = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S2" });
      const w = svc.createWorktree("agent-w"); // baseline s1:1, s2:1
      const a = svc.createWorktree("agent-a");

      // a advances trunk s2 to rev 2
      await changeWorktree(svc, a.worktreeId, "a edits s2", {
        modify: { [s2.unitId]: setCell(s2.unitId, 0, 0, "a") }
      });
      await svc.merge(a.worktreeId);
      expect(svc.getCurrentRev(s2.unitId)).toBe(2);

      // w edits s1 only, leaves s2 untouched
      await changeWorktree(svc, w.worktreeId, "w edits s1", {
        modify: { [s1.unitId]: setCell(s1.unitId, 0, 0, "w") }
      });

      const preview = await svc.previewMerge(w.worktreeId);
      const u1 = preview.units.find((x) => x.unitId === s1.unitId);
      const u2 = preview.units.find((x) => x.unitId === s2.unitId);
      expect(u1?.status).toBe("modified");
      expect(u1?.baseStale).toBe(false);
      expect(u2?.status).toBe("unchanged");
      expect(u2?.baseStale).toBe(true); // trunk s2 moved to 2, baseline was 1
      expect(u2?.trunkRev).toBe(2);
      expect(preview.diverged).toBe(true);
      expect(preview.mergeable).toBe(true);
    } finally {
      svc.dispose();
    }
  });

  it("multi-commit worktree with trunk advanced -> preview computes (modified, diverged, mergeable)", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const a = svc.createWorktree("agent-a");
      const w = svc.createWorktree("agent-w"); // baseline rev 1

      await changeWorktree(svc, a.worktreeId, "A1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });
      await svc.merge(a.worktreeId); // trunk -> rev 2

      // Two worktree commits from baseline rev 1: preview's iterative rebase runs two rounds.
      await changeWorktree(svc, w.worktreeId, "W1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 1, 1, "w1") }
      });
      await changeWorktree(svc, w.worktreeId, "W2", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 2, 2, "w2") }
      });

      const preview = await svc.previewMerge(w.worktreeId);
      const u = preview.units.find((x) => x.unitId === sheet.unitId);
      expect(u?.status).toBe("modified");
      expect(u?.baseStale).toBe(true);
      expect(preview.diverged).toBe(true);
      expect(preview.mergeable).toBe(true);
      expect(preview.conflicts).toEqual([]);
    } finally {
      svc.dispose();
    }
  });

  it("delete vs trunk-advanced -> conflict, not mergeable", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const a = svc.createWorktree("agent-a");
      const b = svc.createWorktree("agent-b");

      await changeWorktree(svc, a.worktreeId, "a", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });
      await svc.merge(a.worktreeId); // trunk sheet -> rev 2

      await changeWorktree(svc, b.worktreeId, "del", { delete: [sheet.unitId] });
      const preview = await svc.previewMerge(b.worktreeId);
      const u = preview.units.find((x) => x.unitId === sheet.unitId);
      expect(u?.status).toBe("conflict");
      expect(preview.mergeable).toBe(false);
      expect(preview.conflicts).toContain(sheet.unitId);
      expect(preview.diverged).toBe(true);
    } finally {
      svc.dispose();
    }
  });

  it("worktree-created unit -> created", async () => {
    const svc = new CollabService();
    try {
      await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const w = svc.createWorktree();
      const r = await changeWorktree(svc, w.worktreeId, "new", {
        create: [{ type: UniverInstanceType.UNIVER_SHEET, name: "S2" }]
      });
      const createdId = Object.keys(r.units)[0]!;

      const preview = await svc.previewMerge(w.worktreeId);
      const created = preview.units.find((x) => x.unitId === createdId);
      expect(created?.status).toBe("created");
      expect(created?.baseStale).toBe(false);
      expect(preview.mergeable).toBe(true);
    } finally {
      svc.dispose();
    }
  });

  it("clean delete (trunk not advanced) -> deleted, mergeable", async () => {
    const svc = new CollabService();
    try {
      await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S1" });
      const s2 = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S2" });
      const w = svc.createWorktree();
      await changeWorktree(svc, w.worktreeId, "del s2", { delete: [s2.unitId] });

      const preview = await svc.previewMerge(w.worktreeId);
      const u = preview.units.find((x) => x.unitId === s2.unitId);
      expect(u?.status).toBe("deleted");
      expect(preview.mergeable).toBe(true);
      expect(preview.diverged).toBe(false);
    } finally {
      svc.dispose();
    }
  });
});

describe("getMergePreviewUnit: per-unit render data", () => {
  it("sheet render data carries snapshot + sheetBlocks + the edit's changeset", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const w = svc.createWorktree();
      await changeWorktree(svc, w.worktreeId, "edit", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "x") }
      });

      const data = await svc.getMergePreviewUnit(w.worktreeId, sheet.unitId);
      expect(data.error).toBeUndefined();
      expect(data.type).toBe(UniverInstanceType.UNIVER_SHEET);
      expect(data.snapshot).toBeDefined();
      expect(Array.isArray(data.sheetBlocks)).toBe(true);
      const blockIds = Object.values(data.snapshot?.workbook?.blockMeta ?? {}).flatMap(
        (meta) => meta.blocks
      );
      expect(data.sheetBlocks?.map((block) => block.id)).toEqual(blockIds);
      expect(data.sheetBlocks?.every((block) => typeof block.data === "object")).toBe(true);
      expect(data.changesets.length).toBeGreaterThan(0);
    } finally {
      svc.dispose();
    }
  });

  it("preview render data is the Worktree view before SDK merge rebases it", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const a = svc.createWorktree("agent-a");
      const w = svc.createWorktree("agent-w");

      // a advances trunk to rev 2
      await changeWorktree(svc, a.worktreeId, "a", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });
      await svc.merge(a.worktreeId);

      // w edits the same unit (different cell) -> clean rebase over a
      await changeWorktree(svc, w.worktreeId, "w", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 1, 1, "w") }
      });

      const preview = await svc.getMergePreviewUnit(w.worktreeId, sheet.unitId);

      // Now actually merge and read the trunk that results.
      const out = await svc.merge(w.worktreeId);
      expect(out.ok).toBe(true);
      const postMerge = await svc.storage.getUnitOnRev(CTX, {
        unitID: sheet.unitId,
        type: UniverInstanceType.UNIVER_SHEET,
        revision: 0
      });

      expect(preview.changesets).toHaveLength(1);
      expect(postMerge.changesets).toHaveLength(2);
      expect(preview.changesets[0]?.mutations).toEqual(postMerge.changesets[1]?.mutations);
    } finally {
      svc.dispose();
    }
  });

  it("doc render data carries snapshot, no sheetBlocks", async () => {
    const svc = new CollabService();
    try {
      const doc = await svc.createUnit(UniverInstanceType.UNIVER_DOC, { name: "D" });
      const w = svc.createWorktree();

      const data = await svc.getMergePreviewUnit(w.worktreeId, doc.unitId);
      expect(data.error).toBeUndefined();
      expect(data.type).toBe(UniverInstanceType.UNIVER_DOC);
      expect(data.snapshot).toBeDefined();
      expect(data.sheetBlocks).toBeUndefined();
    } finally {
      svc.dispose();
    }
  });

  it("deleted baseline unit -> no render (error)", async () => {
    const svc = new CollabService();
    try {
      await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S1" });
      const s2 = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S2" });
      const w = svc.createWorktree();
      await changeWorktree(svc, w.worktreeId, "del s2", { delete: [s2.unitId] });

      const data = await svc.getMergePreviewUnit(w.worktreeId, s2.unitId);
      expect(data.error).toBeDefined();
      expect(data.snapshot).toBeUndefined();
    } finally {
      svc.dispose();
    }
  });
});
