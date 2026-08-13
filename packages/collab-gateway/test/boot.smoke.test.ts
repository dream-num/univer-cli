import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";

const CTX = { metadata: {} } as unknown as Parameters<CollabService["storage"]["getUnitOnRev"]>[0];

describe("SDK-backed CollabService create + read (sheet + doc)", () => {
  it("boots headless Univer and creates + reads a sheet unit", async () => {
    const svc = new CollabService(); // :memory:
    try {
      const created = await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Book1" });
      expect(created.unitId).toBeTruthy();
      expect(created.sheetOrder).toBeDefined();
      expect(svc.hasUnit(created.unitId)).toBe(true);
      expect(svc.getCurrentRev(created.unitId)).toBe(1);

      const res = await svc.storage.getUnitOnRev(CTX, {
        unitID: created.unitId,
        type: UniverInstanceType.UNIVER_SHEET,
        revision: 0
      });
      expect(res.snapshot).toBeDefined();
      expect(res.snapshot?.unitID).toBe(created.unitId);
    } finally {
      svc.dispose();
    }
  });

  it("creates + reads a doc unit (Doc transform/instance mounts headlessly)", async () => {
    const svc = new CollabService();
    try {
      const created = await svc.createUnit(UniverInstanceType.UNIVER_DOC, { name: "Doc1" });
      expect(created.unitId).toBeTruthy();
      expect(svc.getCurrentRev(created.unitId)).toBe(1);

      const res = await svc.storage.getUnitOnRev(CTX, {
        unitID: created.unitId,
        type: UniverInstanceType.UNIVER_DOC,
        revision: 0
      });
      expect(res.snapshot).toBeDefined();
      expect(res.snapshot?.unitID).toBe(created.unitId);
    } finally {
      svc.dispose();
    }
  });

  it("lists created units via the meta surface", async () => {
    const svc = new CollabService();
    try {
      await svc.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      await svc.createUnit(UniverInstanceType.UNIVER_DOC, { name: "D" });
      const units = svc.listUnits();
      expect(units.length).toBe(2);
      expect(units.map((u) => u.type).sort()).toEqual(
        [UniverInstanceType.UNIVER_DOC, UniverInstanceType.UNIVER_SHEET].sort()
      );
      // Both sheet and doc persist the create-input name (doc name used to be blank).
      expect(units.map((u) => u.name).sort()).toEqual(["D", "S"]);
    } finally {
      svc.dispose();
    }
  });
});
