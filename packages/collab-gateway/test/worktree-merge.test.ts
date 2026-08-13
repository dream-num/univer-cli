import type { ILogContext } from "@univerjs-pro/collaboration";
import type { IMutation } from "@univerjs/protocol";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { changeWorktree } from "./change-worktree.js";

const CTX: ILogContext = { metadata: {} };

/**
 * A real sheet set-range-values mutation in protocol wire form: params are JSON-stringified
 * into `data` (this is what the comb protocol / collaboration-client send and what
 * parseProtocolChangeset expects).
 */
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

function setWorkbookName(unitId: string, name: string): IMutation[] {
  return [
    {
      id: "sheet.mutation.set-workbook-name",
      data: JSON.stringify({ unitId, name })
    }
  ];
}

async function trunkChangesetCount(svc: CollabService, unitId: string): Promise<number> {
  const r = await svc.storage.getUnitOnRev(CTX, {
    unitID: unitId,
    type: UniverInstanceType.UNIVER_SHEET,
    revision: 0
  });
  return r.changesets.length;
}

describe("Worktree merge (Phase 3): OT rebase into trunk", () => {
  it("keeps the worktree and trunk catalog names aligned with a rename commit", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Old name" });
      const worktree = svc.createWorktree("agent-1");

      await changeWorktree(svc,
        worktree.worktreeId,
        "rename",
        { modify: { [sheet.unitId]: setWorkbookName(sheet.unitId, "New name") } },
        undefined,
        "New name"
      );

      expect(svc.worktreeUnits(worktree.worktreeId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unitId: sheet.unitId, name: "New name" })
        ])
      );
      expect(svc.listUnits()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unitId: sheet.unitId, name: "Old name" })
        ])
      );

      expect((await svc.merge(worktree.worktreeId)).ok).toBe(true);
      expect(svc.listUnits()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unitId: sheet.unitId, name: "New name" })
        ])
      );
    } finally {
      svc.dispose();
    }
  });

  it("does not overwrite a concurrent trunk rename when merging an unrelated edit", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Old name" });
      const renameWorktree = svc.createWorktree("rename-agent");
      const editWorktree = svc.createWorktree("edit-agent");

      await changeWorktree(svc,
        renameWorktree.worktreeId,
        "rename",
        { modify: { [sheet.unitId]: setWorkbookName(sheet.unitId, "New name") } },
        undefined,
        "New name"
      );
      await changeWorktree(svc, editWorktree.worktreeId, "edit A1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "edited") }
      });

      expect((await svc.merge(renameWorktree.worktreeId)).ok).toBe(true);
      expect((await svc.merge(editWorktree.worktreeId)).ok).toBe(true);
      expect(svc.listUnits()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unitId: sheet.unitId, name: "New name" })
        ])
      );
    } finally {
      svc.dispose();
    }
  });

  it("merges a single worktree's edit into trunk; trunk advances, worktree -> merged", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const worktree = svc.createWorktree("agent-1");
      await changeWorktree(svc, worktree.worktreeId, "set A1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });

      const out = await svc.merge(worktree.worktreeId);
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.mergedRevs[sheet.unitId]).toBe(2);
      }
      expect(svc.getCurrentRev(sheet.unitId)).toBe(2);
      expect(await trunkChangesetCount(svc, sheet.unitId)).toBe(1);
      expect(svc.worktrees.getWorktree(worktree.worktreeId)?.status).toBe("merged");
    } finally {
      svc.dispose();
    }
  });

  it("two worktrees of the same unit converge via sequential merge (OT rebase)", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const a = svc.createWorktree("agent-a");
      const b = svc.createWorktree("agent-b"); // both baseline rev 1

      await changeWorktree(svc, a.worktreeId, "A1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });
      const aOut = await svc.merge(a.worktreeId);
      expect(aOut.ok).toBe(true);
      expect(svc.getCurrentRev(sheet.unitId)).toBe(2);

      // B worktreeed from rev 1 but trunk is now rev 2 -> B's op is rebased over A's.
      await changeWorktree(svc, b.worktreeId, "B1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 1, 1, "b") }
      });
      const bOut = await svc.merge(b.worktreeId);
      expect(bOut.ok).toBe(true);
      expect(svc.getCurrentRev(sheet.unitId)).toBe(3);
      expect(await trunkChangesetCount(svc, sheet.unitId)).toBe(2);
    } finally {
      svc.dispose();
    }
  });

  it("merges a multi-commit worktree after trunk advanced (iterative rebase restamps)", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const a = svc.createWorktree("agent-a");
      const b = svc.createWorktree("agent-b"); // both baseline rev 1

      await changeWorktree(svc, a.worktreeId, "A1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });
      await svc.merge(a.worktreeId); // trunk -> rev 2

      // B carries TWO commits from baseline rev 1 (worktree revs 2 and 3): the second round of
      // the iterative rebase must see the concurrent set restamped past the first worktree cs.
      await changeWorktree(svc, b.worktreeId, "B1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 1, 1, "b1") }
      });
      await changeWorktree(svc, b.worktreeId, "B2", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 2, 2, "b2") }
      });

      const bOut = await svc.merge(b.worktreeId);
      expect(bOut.ok).toBe(true);
      // SDK merge materializes the Worktree head as one confirmed trunk changeset.
      expect(svc.getCurrentRev(sheet.unitId)).toBe(3);
      expect(await trunkChangesetCount(svc, sheet.unitId)).toBe(2);
    } finally {
      svc.dispose();
    }
  });

  it("graduates a worktree-created unit into trunk on merge", async () => {
    const svc = new CollabService();
    try {
      await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const worktree = svc.createWorktree();
      const r = await changeWorktree(svc, worktree.worktreeId, "new", {
        create: [{ type: UniverInstanceType.UNIVER_SHEET, name: "S2" }]
      });
      const createdId = Object.keys(r.units)[0]!;
      expect(svc.listUnits().map((u) => u.unitId)).not.toContain(createdId);

      const out = await svc.merge(worktree.worktreeId);
      expect(out.ok).toBe(true);
      expect(svc.listUnits().map((u) => u.unitId)).toContain(createdId);
    } finally {
      svc.dispose();
    }
  });

  it("reports a modify/delete conflict (trunk advanced a worktree-deleted unit)", async () => {
    const svc = new CollabService();
    try {
      const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const a = svc.createWorktree("agent-a");
      const b = svc.createWorktree("agent-b"); // baseline rev 1

      await changeWorktree(svc, a.worktreeId, "A1", {
        modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "a") }
      });
      await svc.merge(a.worktreeId); // trunk unit -> rev 2

      await changeWorktree(svc, b.worktreeId, "del", { delete: [sheet.unitId] });
      const bOut = await svc.merge(b.worktreeId);
      expect(bOut.ok).toBe(false);
      if (!bOut.ok) {
        expect(bOut.failedUnit).toBe(sheet.unitId);
      }
      // Trunk unaffected by the aborted merge.
      expect(svc.getCurrentRev(sheet.unitId)).toBe(2);
    } finally {
      svc.dispose();
    }
  });
});
