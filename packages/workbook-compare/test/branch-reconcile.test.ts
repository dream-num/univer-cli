import type { IWorkbookData } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import {
  buildSymmetricWorkbookCompareChangesets,
  collectUnsupportedStructuralMutationIds,
} from "../src/branch-reconcile.js";
import { buildWorkbookCompareModel } from "../src/index.js";

describe("symmetric branch reconciliation", () => {
  it("mirrors an inserted row as a left deletion when comparison sides swap", () => {
    const baseline = workbook(3);
    const inserted = workbook(4);
    const insertion = changeset("sheet.mutation.insert-row", {
      subUnitId: "sheet-1",
      range: { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
    });

    const leftToRight = buildWorkbookCompareModel({
      baseSnapshot: inserted,
      targetSnapshot: baseline,
      orderedChangesetStream: buildSymmetricWorkbookCompareChangesets({
        fidelity: "history",
        leftChangesets: [insertion],
        rightChangesets: [],
      }),
    });
    const rightToLeft = buildWorkbookCompareModel({
      baseSnapshot: baseline,
      targetSnapshot: inserted,
      orderedChangesetStream: buildSymmetricWorkbookCompareChangesets({
        fidelity: "history",
        leftChangesets: [],
        rightChangesets: [insertion],
      }),
    });

    expect(leftToRight.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "delete", start: 1 },
    ]);
    expect(rightToLeft.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "insert", start: 1 },
    ]);
    expect(
      leftToRight.displayedSnapshots.base?.styles?.["__workbook_compare_delete__"],
    ).toBeDefined();
    expect(
      rightToLeft.displayedSnapshots.current?.styles?.["__workbook_compare_insert__"],
    ).toBeDefined();
  });

  it("aligns unchanged cells after a row insertion instead of reporting shifted updates", () => {
    const baseline = workbookWithRows(["Category", "Food", "Travel"]);
    const inserted = workbookWithRows(["Category", "Utilities", "Food", "Travel"]);
    const insertion = changeset("sheet.mutation.insert-row", {
      subUnitId: "sheet-1",
      range: { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
    });

    const model = buildWorkbookCompareModel({
      baseSnapshot: baseline,
      targetSnapshot: inserted,
      orderedChangesetStream: buildSymmetricWorkbookCompareChangesets({
        fidelity: "history",
        leftChangesets: [],
        rightChangesets: [insertion],
      }),
    });

    expect(model.itemsByCategory.cell.map((item) => item.detailLines[0])).toEqual([
      expect.objectContaining({ after: "Utilities", before: null, kind: "insert" }),
    ]);
    expect(model.compareInfo.worksheets["sheet-1"]?.cellChanges[0]?.selection).toEqual({
      base: null,
      current: {
        endColumn: 0,
        endRow: 1,
        sheetId: "sheet-1",
        startColumn: 0,
        startRow: 1,
      },
    });
    expect(model.compareInfo.worksheets["sheet-1"]?.presentation.baseGaps).toEqual({
      rowGaps: {
        1: expect.objectContaining({ size: 24 }),
      },
    });
  });

  it("aligns both branch histories through their common snapshot", () => {
    const left = workbookWithRows(["Category", "Left only", "Food", "Travel"]);
    const right = workbookWithRows(["Category", "Food", "Right only", "Travel"]);

    const model = buildWorkbookCompareModel({
      baseSnapshot: left,
      targetSnapshot: right,
      orderedChangesetStream: buildSymmetricWorkbookCompareChangesets({
        fidelity: "history",
        leftChangesets: [
          changeset("sheet.mutation.insert-row", {
            subUnitId: "sheet-1",
            range: { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
          }),
        ],
        rightChangesets: [
          changeset("sheet.mutation.insert-row", {
            subUnitId: "sheet-1",
            range: { startRow: 2, endRow: 2, startColumn: 0, endColumn: 0 },
          }),
        ],
      }),
    });

    expect(model.itemsByCategory.cell.map((item) => item.detailLines[0])).toEqual([
      expect.objectContaining({ after: null, before: "Left only", kind: "delete" }),
      expect.objectContaining({ after: "Right only", before: null, kind: "insert" }),
    ]);
    expect(model.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "delete", start: 1 },
      { count: 1, kind: "insert", start: 2 },
    ]);
  });

  it("treats opposite same-position structural edits as a paired blue modification", () => {
    const left = workbookWithRows(["Category", "Left only", "Food"]);
    const right = workbookWithRows(["Category", "Right only", "Food"]);
    const samePositionInsertion = changeset("sheet.mutation.insert-row", {
      subUnitId: "sheet-1",
      range: { startRow: 1, endRow: 1, startColumn: 0, endColumn: 0 },
    });

    const model = buildWorkbookCompareModel({
      baseSnapshot: left,
      targetSnapshot: right,
      orderedChangesetStream: buildSymmetricWorkbookCompareChangesets({
        fidelity: "history",
        leftChangesets: [samePositionInsertion],
        rightChangesets: [samePositionInsertion],
      }),
    });

    expect(model.itemsByCategory.cell.map((item) => item.detailLines[0])).toEqual([
      expect.objectContaining({ after: "Right only", before: "Left only", kind: "update" }),
    ]);
    expect(model.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([]);
  });

  it("keeps final-state modifications blue on both sides", () => {
    const left = workbook(3, "left");
    const right = workbook(3, "right");
    const model = buildWorkbookCompareModel({
      baseSnapshot: left,
      targetSnapshot: right,
      orderedChangesetStream: buildSymmetricWorkbookCompareChangesets({
        fidelity: "history",
        leftChangesets: [changeset("sheet.mutation.set-range-values", {})],
        rightChangesets: [changeset("sheet.mutation.set-range-values", {})],
      }),
    });

    expect(model.itemsByCategory.cell[0]?.kind).toBe("update");
    expect(model.displayedSnapshots.base?.styles?.["__workbook_compare_update__"]).toBeDefined();
    expect(model.displayedSnapshots.current?.styles?.["__workbook_compare_update__"]).toBeDefined();
  });

  it("uses no invented coordinate history for snapshot fallback", () => {
    expect(
      buildSymmetricWorkbookCompareChangesets({
        fidelity: "snapshot",
        leftChangesets: [changeset("sheet.mutation.insert-row", {})],
        rightChangesets: [],
      }),
    ).toEqual([]);
  });

  it("content-aligns snapshot-only middle row and column changes symmetrically", () => {
    const baseRows = workbookWithRows(["Header", "Alpha", "Omega"]);
    const insertedRows = workbookWithRows(["Header", "Middle", "Alpha", "Omega"]);
    const rowForward = buildWorkbookCompareModel({
      baseSnapshot: baseRows,
      orderedChangesetStream: [],
      targetSnapshot: insertedRows,
    });
    const rowReverse = buildWorkbookCompareModel({
      baseSnapshot: insertedRows,
      orderedChangesetStream: [],
      targetSnapshot: baseRows,
    });
    const baseColumns = workbookWithColumns(["Header", "Alpha", "Omega"]);
    const insertedColumns = workbookWithColumns(["Header", "Middle", "Alpha", "Omega"]);
    const columnForward = buildWorkbookCompareModel({
      baseSnapshot: baseColumns,
      orderedChangesetStream: [],
      targetSnapshot: insertedColumns,
    });
    const columnReverse = buildWorkbookCompareModel({
      baseSnapshot: insertedColumns,
      orderedChangesetStream: [],
      targetSnapshot: baseColumns,
    });

    expect(rowForward.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "insert", start: 1 },
    ]);
    expect(rowReverse.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "delete", start: 1 },
    ]);
    expect(
      columnForward.compareInfo.worksheets["sheet-1"]?.selectionMapping.columnOperations,
    ).toEqual([{ count: 1, kind: "insert", start: 1 }]);
    expect(
      columnReverse.compareInfo.worksheets["sheet-1"]?.selectionMapping.columnOperations,
    ).toEqual([{ count: 1, kind: "delete", start: 1 }]);
    expect(
      [rowForward, rowReverse, columnForward, columnReverse].map((model) => model.readiness),
    ).toEqual(["ready", "ready", "ready", "ready"]);
  });

  it("marks snapshot axis inference degraded when content cannot locate the change", () => {
    const smaller = workbook(2);
    const larger = workbook(3);
    smaller.sheets["sheet-1"]!.cellData = {};
    larger.sheets["sheet-1"]!.cellData = {};

    const forward = buildWorkbookCompareModel({
      baseSnapshot: smaller,
      orderedChangesetStream: [],
      targetSnapshot: larger,
    });
    const reverse = buildWorkbookCompareModel({
      baseSnapshot: larger,
      orderedChangesetStream: [],
      targetSnapshot: smaller,
    });

    expect(forward.readiness).toBe("degraded");
    expect(reverse.readiness).toBe("degraded");
    expect(forward.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "insert", start: 0 },
    ]);
    expect(reverse.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "delete", start: 0 },
    ]);
  });

  it("keeps sparse large-axis snapshot inference linear", () => {
    const smaller = sparseWorkbook(25_000);
    const larger = sparseWorkbook(25_001);
    const startedAt = performance.now();

    const model = buildWorkbookCompareModel({
      baseSnapshot: smaller,
      orderedChangesetStream: [],
      targetSnapshot: larger,
    });

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(model.readiness).toBe("degraded");
    expect(model.compareInfo.worksheets["sheet-1"]?.selectionMapping.rowOperations).toEqual([
      { count: 1, kind: "insert", start: 1 },
    ]);
  });

  it("reports only unknown structural hints, not snapshot-resolved value mutations", () => {
    expect(
      collectUnsupportedStructuralMutationIds({
        fidelity: "history",
        leftChangesets: [
          changeset("sheet.mutation.set-range-values", {}),
          changeset("sheet.mutation.remove-sparkline", {}),
          changeset("sheet.mutation.remove-worksheet-merge", {}),
        ],
        rightChangesets: [changeset("sheet.mutation.reorder-row-blocks", {})],
      }),
    ).toEqual(["sheet.mutation.reorder-row-blocks"]);
  });

  it("normalizes the current remove-rows SDK mutation for the legacy compare core", () => {
    expect(
      buildSymmetricWorkbookCompareChangesets({
        fidelity: "history",
        leftChangesets: [],
        rightChangesets: [changeset("sheet.mutation.remove-rows", { range: { startRow: 2 } })],
      }),
    ).toEqual([
      {
        streamOrder: 0,
        mutations: [
          { mutationId: "sheet.mutation.remove-row", params: { range: { startRow: 2 } } },
        ],
      },
    ]);
  });
});

function changeset(id: string, params: object) {
  return { mutations: [{ id, data: JSON.stringify(params) }] };
}

function workbook(rowCount: number, value = "same"): IWorkbookData {
  return {
    appVersion: "test",
    id: "workbook-1",
    locale: "enUS",
    name: "Workbook",
    resources: [],
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet",
        rowCount,
        columnCount: 3,
        cellData: { 0: { 0: { v: value } } },
      },
    },
    styles: {},
  } as IWorkbookData;
}

function workbookWithRows(values: readonly string[]): IWorkbookData {
  const snapshot = workbook(values.length);
  snapshot.sheets["sheet-1"]!.cellData = Object.fromEntries(
    values.map((value, row) => [row, { 0: { v: value } }]),
  );
  snapshot.sheets["sheet-1"]!.defaultRowHeight = 24;
  return snapshot;
}

function workbookWithColumns(values: readonly string[]): IWorkbookData {
  const snapshot = workbook(1);
  snapshot.sheets["sheet-1"]!.columnCount = values.length;
  snapshot.sheets["sheet-1"]!.cellData = {
    0: Object.fromEntries(values.map((value, column) => [column, { v: value }])),
  };
  return snapshot;
}

function sparseWorkbook(rowCount: number): IWorkbookData {
  const snapshot = workbook(rowCount);
  snapshot.sheets["sheet-1"]!.cellData = {
    0: { 0: { v: "first" } },
    [rowCount - 1]: { 0: { v: "last" } },
  };
  return snapshot;
}
