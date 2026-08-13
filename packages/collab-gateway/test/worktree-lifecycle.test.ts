import type { IMutation } from "@univerjs/protocol";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { changeWorktree } from "./change-worktree.js";

function mutations(unitId: string, row = 0): IMutation[] {
  return [
    {
      id: "sheet.mutation.set-range-values",
      data: JSON.stringify({
        unitId,
        subUnitId: "sheet-1",
        cellValue: { [row]: { 0: { v: row + 1, t: 2 } } },
      }),
    },
  ];
}

async function withSheet(): Promise<{ svc: CollabService; unitId: string }> {
  const svc = new CollabService();
  const sheet = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
  return { svc, unitId: sheet.unitId };
}

describe("Worktree lifecycle", () => {
  it("uses the SDK draft-to-ready transition without a logical commit token", async () => {
    const { svc, unitId } = await withSheet();
    try {
      const worktree = svc.createWorktree();
      await changeWorktree(svc, worktree.worktreeId, "initial", {
        modify: { [unitId]: mutations(unitId) },
      });

      expect((await svc.ready(worktree.worktreeId)).status).toBe("ready");
      expect(svc.worktrees.getWorktree(worktree.worktreeId)).toMatchObject({ status: "ready" });
      await expect(
        changeWorktree(svc, worktree.worktreeId, "late", {
          modify: { [unitId]: mutations(unitId, 1) },
        }),
      ).rejects.toThrow();
    } finally {
      svc.dispose();
    }
  });

  it("reopen returns a ready Worktree to draft and permits further changes", async () => {
    const { svc, unitId } = await withSheet();
    try {
      const worktree = svc.createWorktree();
      await svc.ready(worktree.worktreeId);
      expect((await svc.reopen(worktree.worktreeId)).status).toBe("draft");

      await changeWorktree(svc, worktree.worktreeId, "after review", {
        modify: { [unitId]: mutations(unitId) },
      });
      expect(
        (await svc.worktreeGetUnitOnRev(worktree.worktreeId, unitId, 0)).changesets,
      ).toHaveLength(1);
    } finally {
      svc.dispose();
    }
  });

  it("reopen rejects draft and terminal Worktrees", async () => {
    const { svc } = await withSheet();
    try {
      const draft = svc.createWorktree();
      await expect(svc.reopen(draft.worktreeId)).rejects.toThrow(/draft.*cannot reopen/i);

      const discarded = svc.createWorktree();
      await svc.discard(discarded.worktreeId);
      await expect(svc.reopen(discarded.worktreeId)).rejects.toThrow(/discarded.*cannot reopen/i);
    } finally {
      svc.dispose();
    }
  });

  it("discard freezes Worktree data and leaves trunk unchanged", async () => {
    const { svc, unitId } = await withSheet();
    try {
      const worktree = svc.createWorktree();
      await changeWorktree(svc, worktree.worktreeId, "edit", {
        modify: { [unitId]: mutations(unitId) },
      });

      await svc.discard(worktree.worktreeId);
      expect(svc.worktrees.getWorktree(worktree.worktreeId)?.status).toBe("discarded");
      expect(
        (await svc.worktreeGetUnitOnRev(worktree.worktreeId, unitId, 0)).error,
      ).toBeUndefined();
      await expect(
        changeWorktree(svc, worktree.worktreeId, "late", {
          modify: { [unitId]: mutations(unitId, 1) },
        }),
      ).rejects.toThrow();
      expect(svc.getCurrentRev(unitId)).toBe(1);
    } finally {
      svc.dispose();
    }
  });

  it("does not change a merged Worktree into discarded", async () => {
    const { svc } = await withSheet();
    try {
      const worktree = svc.createWorktree();
      await changeWorktree(svc, worktree.worktreeId, "new", {
        create: [{ type: UniverInstanceType.UNIVER_SHEET, name: "X" }],
      });
      expect((await svc.merge(worktree.worktreeId)).ok).toBe(true);

      await expect(svc.discard(worktree.worktreeId)).rejects.toThrow(/merged|not mutable/i);
      expect(svc.worktrees.getWorktree(worktree.worktreeId)?.status).toBe("merged");
    } finally {
      svc.dispose();
    }
  });
});
