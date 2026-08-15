import type { IChangeset, IMutation } from "@univerjs/protocol";
import { UniverType } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { deriveUnitCatalogName } from "../src/unit-name-middleware.js";

const UNIT_TYPES = [
  { label: "Doc", type: UniverType.UNIVER_DOC },
  { label: "Sheet", type: UniverType.UNIVER_SHEET },
  { label: "Slide", type: UniverType.UNIVER_SLIDE },
  { label: "Base", type: UniverType.UNIVER_BASE },
  { label: "Board", type: UniverType.UNIVER_BOARD },
] as const;

describe("Unit catalog name commit middleware", () => {
  it("keeps all supported Worktree Unit names aligned and propagates them on merge", async () => {
    const service = new CollabService();
    try {
      const units = await Promise.all(
        UNIT_TYPES.map(async ({ label, type }) => ({
          label,
          type,
          ...(await service.createUnit(type, { name: `${label} old` })),
        })),
      );
      const worktree = service.createWorktree("rename-agent");

      for (const unit of units) {
        await service.submitWorktreeMutations(
          worktree.worktreeId,
          unit.unitId,
          renameMutation(unit.type, unit.unitId, `${unit.label} old`, `${unit.label} new`),
        );
      }

      expect(catalogNames(service.worktreeUnits(worktree.worktreeId))).toEqual(
        Object.fromEntries(units.map((unit) => [unit.unitId, `${unit.label} new`])),
      );
      expect(catalogNames(service.listUnits())).toEqual(
        Object.fromEntries(units.map((unit) => [unit.unitId, `${unit.label} old`])),
      );

      expect((await service.merge(worktree.worktreeId)).ok).toBe(true);
      expect(catalogNames(service.listUnits())).toEqual(
        Object.fromEntries(units.map((unit) => [unit.unitId, `${unit.label} new`])),
      );
    } finally {
      await service.dispose();
    }
  });

  it("updates all supported trunk Unit names on direct changeset commits", async () => {
    const service = new CollabService();
    try {
      const units = await Promise.all(
        UNIT_TYPES.map(async ({ label, type }) => ({
          label,
          type,
          ...(await service.createUnit(type, { name: `${label} old` })),
        })),
      );

      for (const unit of units) {
        const result = await service.runtime.trunkService.submitChangeset(
          {
            changeset: changeset(
              unit.type,
              unit.unitId,
              renameMutation(unit.type, unit.unitId, `${unit.label} old`, `${unit.label} new`),
            ),
          },
          { userID: "local", memberID: "rename-test" },
        );
        expect(result.status).toBe("committed");
      }

      expect(catalogNames(service.listUnits())).toEqual(
        Object.fromEntries(units.map((unit) => [unit.unitId, `${unit.label} new`])),
      );
    } finally {
      await service.dispose();
    }
  });

  it("ignores child-object renames and mutations addressed to another Unit", () => {
    const baseChangeset = changeset(UniverType.UNIVER_BASE, "base-1", [
      mutation("base.mutation.apply-base-json1", {
        unitId: "base-1",
        op: ["tables", "table-1", "name", { r: "Table old", i: "Table new" }],
      }),
    ]);
    expect(deriveUnitCatalogName(baseChangeset)).toBeUndefined();

    const wrongUnit = changeset(UniverType.UNIVER_BOARD, "board-1", [
      mutation("board.mutation.set-name", { unitId: "board-2", name: "Wrong board" }),
    ]);
    expect(deriveUnitCatalogName(wrongUnit)).toBeUndefined();
  });

  it("uses the last root rename in mutation order, including a composed Base JSON1 op", () => {
    const sheetChangeset = changeset(UniverType.UNIVER_SHEET, "sheet-1", [
      mutation("sheet.mutation.set-workbook-name", { unitId: "sheet-1", name: "First" }),
      mutation("sheet.mutation.set-workbook-name", { unitId: "sheet-1", name: "Final" }),
    ]);
    expect(deriveUnitCatalogName(sheetChangeset)).toBe("Final");

    const baseChangeset = changeset(UniverType.UNIVER_BASE, "base-1", [
      mutation("base.mutation.apply-base-json1", {
        unitId: "base-1",
        op: [
          ["name", { r: "Old", i: "New" }],
          ["tables", "table-1", "name", { r: "Table old", i: "Table new" }],
        ],
      }),
    ]);
    expect(deriveUnitCatalogName(baseChangeset)).toBe("New");
  });
});

function renameMutation(
  type: UniverType,
  unitId: string,
  oldName: string,
  newName: string,
): IMutation[] {
  switch (type) {
    case UniverType.UNIVER_DOC:
      return [mutation("doc.mutation.rename-doc", { unitId, name: newName })];
    case UniverType.UNIVER_SHEET:
      return [mutation("sheet.mutation.set-workbook-name", { unitId, name: newName })];
    case UniverType.UNIVER_SLIDE:
      return [mutation("slide.mutation.set-name", { unitId, name: newName })];
    case UniverType.UNIVER_BASE:
      return [
        mutation("base.mutation.apply-base-json1", {
          unitId,
          op: ["name", { r: oldName, i: newName }],
          trigger: "facade",
        }),
      ];
    case UniverType.UNIVER_BOARD:
      return [mutation("board.mutation.set-name", { unitId, name: newName })];
    default:
      throw new Error(`unsupported Unit type: ${type}`);
  }
}

function changeset(type: UniverType, unitID: string, mutations: IMutation[]): IChangeset {
  return {
    unitID,
    type,
    baseRev: 1,
    revision: 2,
    userID: "local",
    memberID: "rename-test",
    sid: `rename:${unitID}`,
    reqId: 1,
    mutations,
  };
}

function mutation(id: string, params: object): IMutation {
  return { id, data: JSON.stringify(params) };
}

function catalogNames(
  units: readonly { readonly unitId: string; readonly name: string }[],
): Record<string, string> {
  return Object.fromEntries(units.map((unit) => [unit.unitId, unit.name]));
}
