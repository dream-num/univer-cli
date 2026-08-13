import type { ILogContext } from "@univerjs-pro/collaboration";
import { getBoardsEmptySnapshot } from "@univerjs-pro/boards";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { changeWorktree } from "./change-worktree.js";

const CTX: ILogContext = { metadata: {} };
const BOARD = UniverInstanceType.UNIVER_BOARD;

describe("Board unit support", () => {
  it("creates and reads a Board snapshot through the SDK Service", async () => {
    const svc = new CollabService();
    try {
      const data = getBoardsEmptySnapshot("board-1", "Board");
      data.resources = [{ name: "UNIVER_TEST_PLUGIN", data: '{"enabled":true}' }];
      const created = await svc.createUnit(BOARD, { unitId: data.id, name: data.name, data });

      const read = await svc.storage.getUnitOnRev(CTX, {
        unitID: created.unitId,
        type: BOARD,
        revision: 0
      });
      expect(read.snapshot?.board).toBeDefined();
      expect(read.snapshot?.type).toBe(BOARD);
      expect(read.snapshot?.board?.resources).toEqual(data.resources);
    } finally {
      svc.dispose();
    }
  });

  it("keeps a worktree-created Board outside trunk until merge", async () => {
    const svc = new CollabService();
    try {
      const worktree = svc.createWorktree("agent-board");
      const committed = await changeWorktree(svc, worktree.worktreeId, "add board", {
        create: [{ type: BOARD, name: "Board" }]
      });
      const createdId = Object.keys(committed.units)[0]!;

      expect(svc.listUnits().map((unit) => unit.unitId)).not.toContain(createdId);
      expect(
        (await svc.worktreeGetUnitOnRev(worktree.worktreeId, createdId, 0)).snapshot?.board
      ).toBeDefined();

      expect((await svc.merge(worktree.worktreeId)).ok).toBe(true);
      expect(svc.listUnits().find((unit) => unit.unitId === createdId)?.type).toBe(BOARD);
    } finally {
      svc.dispose();
    }
  });
});
