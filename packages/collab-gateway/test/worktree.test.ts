import type { ILogContext } from "@univerjs-pro/collaboration";
import type { IMutation } from "@univerjs/protocol";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { changeWorktree } from "./change-worktree.js";

const CTX: ILogContext = { metadata: {} };
function mutations(unitId: string): IMutation[] {
  return [
    {
      id: "sheet.mutation.set-range-values",
      data: JSON.stringify({
        unitId,
        subUnitId: "sheet-1",
        cellValue: { 0: { 0: { v: 1, t: 2 } } }
      })
    }
  ];
}

describe("SDK-backed Worktree via CollabService", () => {
  it("createWorktree snapshots the current trunk unit-set into baseline", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const worktree = svc.createWorktree("agent-1", "task");
      expect(worktree.status).toBe("draft");
      expect(worktree.baseline[sheet.unitId]).toBe(1);
      expect(svc.listWorktrees().map((f) => f.worktreeId)).toEqual([worktree.worktreeId]);
    } finally {
      svc.dispose();
    }
  });

  it("submits a Worktree changeset while leaving trunk untouched", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const worktree = svc.createWorktree();
      const r = await changeWorktree(svc, worktree.worktreeId, "edit A1", {
        modify: { [sheet.unitId]: mutations(sheet.unitId) }
      });
      expect(r.units[sheet.unitId]).toBe(2); // worktreeRev 1 -> 2
      expect(r.modified).toHaveLength(1);

      // Worktree read: B-virtual = trunk snapshot@<=1 + worktree cs@2.
      const fr = await svc.worktreeGetUnitOnRev(worktree.worktreeId, sheet.unitId, 0);
      expect(fr.error).toBeUndefined();
      expect(fr.snapshot?.unitID).toBe(sheet.unitId);
      expect(fr.changesets.map((c) => c.revision)).toEqual([2]);

      // Trunk is unaffected by the worktree commit.
      expect(svc.getCurrentRev(sheet.unitId)).toBe(1);
      const tr = await svc.storage.getUnitOnRev(CTX, {
        unitID: sheet.unitId,
        type: UniverInstanceType.UNIVER_SHEET,
        revision: 0
      });
      expect(tr.changesets).toHaveLength(0);
    } finally {
      svc.dispose();
    }
  });

  it("creates a unit visible only inside the Worktree", async () => {
    const svc = new CollabService();
    try {
      await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const worktree = svc.createWorktree();
      const r = await changeWorktree(svc, worktree.worktreeId, "new sheet", {
        create: [{ type: UniverInstanceType.UNIVER_SHEET, name: "S2" }]
      });
      const createdId = Object.keys(r.units)[0]!;
      expect(svc.worktreeUnits(worktree.worktreeId).map((u) => u.unitId)).toContain(createdId);
      // Trunk does not see the worktree-created unit.
      expect(svc.listUnits().map((u) => u.unitId)).not.toContain(createdId);

      const cr = await svc.worktreeGetUnitOnRev(worktree.worktreeId, createdId, 0);
      expect(cr.error).toBeUndefined();
      expect(cr.snapshot?.unitID).toBe(createdId);
    } finally {
      svc.dispose();
    }
  });

  it("preserves the Base unit type in a worktree-created snapshot", async () => {
    const svc = new CollabService();
    try {
      const worktree = svc.createWorktree();
      const result = await changeWorktree(svc, worktree.worktreeId, "new base", {
        create: [{ type: UniverInstanceType.UNIVER_BASE, name: "B" }]
      });
      const createdId = Object.keys(result.units)[0]!;

      const read = await svc.worktreeGetUnitOnRev(worktree.worktreeId, createdId, 0);
      expect(read.error).toBeUndefined();
      expect(read.snapshot).toMatchObject({
        unitID: createdId,
        type: UniverInstanceType.UNIVER_BASE
      });
    } finally {
      svc.dispose();
    }
  });

  it("two worktrees of the same trunk are isolated from each other", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const a = svc.createWorktree("agent-a");
      const b = svc.createWorktree("agent-b");
      await changeWorktree(svc, a.worktreeId, "a-edit", {
        modify: { [sheet.unitId]: mutations(sheet.unitId) }
      });

      // A sees its edit; B (worktreeed from the same trunk) does not.
      expect(
        (await svc.worktreeGetUnitOnRev(a.worktreeId, sheet.unitId, 0)).changesets
      ).toHaveLength(1);
      expect(
        (await svc.worktreeGetUnitOnRev(b.worktreeId, sheet.unitId, 0)).changesets
      ).toHaveLength(0);
    } finally {
      svc.dispose();
    }
  });
});
