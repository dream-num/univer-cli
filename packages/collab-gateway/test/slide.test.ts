import type { ILogContext } from "@univerjs-pro/collaboration";
import type { IChangeset as IProtocolChangeset, IMutation } from "@univerjs/protocol";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { changeWorktree } from "./change-worktree.js";

const CTX: ILogContext = { metadata: {} };
const SLIDE = UniverInstanceType.UNIVER_SLIDE;

/**
 * A real slide set-default-page-size mutation in protocol wire form: params are JSON-stringified
 * into `data` (this is what the comb protocol / collaboration-client send and what
 * parseProtocolChangeset expects).
 */
function setPageSize(unitId: string, width: number, height: number): IMutation[] {
  return [
    {
      id: "slide.mutation.set-slide-page-size",
      data: JSON.stringify({ unitId, pageId: undefined, pageSize: { width, height } })
    }
  ] as unknown as IMutation[];
}

function slideChangeset(
  unitId: string,
  baseRev: number,
  mutations: IMutation[]
): IProtocolChangeset {
  return {
    unitID: unitId,
    type: SLIDE,
    baseRev,
    revision: 0, // assigned by the server
    userID: "u1",
    memberID: "m1",
    mutations,
    sid: "s1",
    reqId: 1,
    createTime: Date.now()
  } as unknown as IProtocolChangeset;
}

describe("Slide unit support", () => {
  it("creates a slide unit and reads its snapshot back", async () => {
    const svc = new CollabService();
    try {
      const slide = await svc.createUnit(SLIDE, { name: "Deck" });
      expect(svc.listUnits().find((u) => u.unitId === slide.unitId)?.type).toBe(SLIDE);

      const read = await svc.storage.getUnitOnRev(CTX, {
        unitID: slide.unitId,
        type: SLIDE,
        revision: 0
      });
      expect(read.snapshot).toBeDefined();
      expect(read.changesets).toHaveLength(0);
    } finally {
      svc.dispose();
    }
  });

  it("materializes a slide (loadSlide) and applies a slide changeset on trunk", async () => {
    const svc = new CollabService();
    try {
      const slide = await svc.createUnit(SLIDE, { name: "Deck" });
      // submit -> ensureUnit(loadSlide) -> apply the slide mutation -> persist + bump rev.
      const result = await svc.submit(
        slide.unitId,
        SLIDE,
        slideChangeset(slide.unitId, 1, setPageSize(slide.unitId, 1280, 720))
      );
      expect(result.success).toBe(true);
      expect(svc.getCurrentRev(slide.unitId)).toBe(2);
    } finally {
      svc.dispose();
    }
  });

  it("graduates a worktree-created slide unit into trunk on merge", async () => {
    const svc = new CollabService();
    try {
      await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const worktree = svc.createWorktree("agent-slide");
      const r = await changeWorktree(svc, worktree.worktreeId, "add deck", {
        create: [{ type: SLIDE, name: "Deck" }]
      });
      const createdId = Object.keys(r.units)[0]!;
      expect(svc.listUnits().map((u) => u.unitId)).not.toContain(createdId);

      const out = await svc.merge(worktree.worktreeId);
      expect(out.ok).toBe(true);
      const trunk = svc.listUnits().find((u) => u.unitId === createdId);
      expect(trunk?.type).toBe(SLIDE);
    } finally {
      svc.dispose();
    }
  });
});
