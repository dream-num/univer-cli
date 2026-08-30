import type { IWorkbookData } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import {
  buildCompareSnapshots,
  buildWorkbookCompareSidebarTree,
  buildWorkbookCompareAgentReport,
  buildWorkbookCompareModel,
  createWorkbookComparePaneFxStates,
  flattenWorkbookCompareMutations,
  mapScrollTargetAcrossPanes,
  mapSelectionTargetAcrossPanes,
} from "../src/index.js";

describe("workbook compare core", () => {
  it("classifies cell value, formula, style, and sheet status changes", () => {
    const base = createWorkbook({
      name: "Budget",
      value: "10",
      formula: "=A2",
      style: "base-style",
    });
    const current = createWorkbook({
      name: "Budget 2026",
      value: "12",
      formula: "=A3",
      style: "current-style",
    });

    const model = buildWorkbookCompareModel({
      baseSnapshot: base,
      orderedChangesetStream: [
        {
          localSeqEnd: 7,
          localSeqStart: 7,
          mutations: [
            {
              localBatchId: "batch-1",
              localSeq: 7,
              mutationId: "sheet.mutation.set-range-values",
              params: { subUnitId: "sheet-1", cellValue: { 0: { 0: { v: "12" } } } },
            },
          ],
          streamOrder: 3,
        },
      ],
      targetSnapshot: current,
    });

    expect(flattenWorkbookCompareMutations(model.compareInfo ? [] : [])).toEqual([]);
    expect(buildWorkbookCompareAgentReport(model)).toMatchObject({
      schemaVersion: 1,
      unitType: "sheet",
      sheets: [expect.objectContaining({ id: "sheet-1" })],
    });
    const tree = buildWorkbookCompareSidebarTree({
      activeSheetId: "sheet-1",
      items: model.items,
      labels: {
        categories: { cell: "Cells", workbook: "Workbook", worksheet: "Worksheet" },
        emptyText: "(empty)",
        noActiveSheetLabel: "No active sheet",
        noCompareDataLabel: "No comparison data",
        rowLabel: (index) => `Row ${index}`,
        styleGroupLabel: "Styles",
        workbookRootLabel: "Workbook",
      },
      model,
      searchQuery: "",
      tab: "worksheet",
    });
    expect(tree).toEqual([
      expect.objectContaining({
        label: "Main",
        type: "root",
        children: expect.arrayContaining([
          expect.objectContaining({ label: "Cells (1)", type: "group" }),
        ]),
      }),
    ]);
    expect(model.summary.semanticSummary).toContain("2 changes");
    expect(model.itemsByCategory.workbook[0]?.kind).toBe("update");
    expect(model.itemsByCategory.cell[0]).toMatchObject({
      address: "A1",
      kind: "update",
      sheetId: "sheet-1",
    });
    expect(model.itemsByCategory.cell[0]?.detailLines.map((line) => line.label)).toEqual([
      "Formula",
      "Value",
      "Background",
    ]);
    expect(model.sheetOptions[0]).toMatchObject({ sheetId: "sheet-1", status: "update" });
    expect(model.displayedSnapshots.current?.styles?.["__workbook_compare_update__"]).toBeDefined();
  });

  it("canonicalizes rich-text cell values instead of collapsing them to object strings", () => {
    const snapshot = (text: string, reverseKeys = false): IWorkbookData => {
      const workbook = createWorkbook({});
      const richText = reverseKeys
        ? { id: "rich-1", body: { textRuns: [], dataStream: `${text}\r\n` } }
        : { body: { dataStream: `${text}\r\n`, textRuns: [] }, id: "rich-1" };
      workbook.sheets["sheet-1"]!.cellData = { 0: { 0: { p: richText } } };
      return workbook;
    };
    const equal = buildWorkbookCompareModel({
      baseSnapshot: snapshot("Plan", false),
      orderedChangesetStream: [],
      targetSnapshot: snapshot("Plan", true),
    });
    const changed = buildWorkbookCompareModel({
      baseSnapshot: snapshot("Plan A"),
      orderedChangesetStream: [],
      targetSnapshot: snapshot("Plan B"),
    });

    expect(equal.itemsByCategory.cell).toEqual([]);
    expect(changed.itemsByCategory.cell[0]?.detailLines[0]).toMatchObject({
      kind: "update",
      label: "Value",
    });
    expect(changed.itemsByCategory.cell[0]?.detailLines[0]?.before).toContain("Plan A");
    expect(changed.itemsByCategory.cell[0]?.detailLines[0]?.after).toContain("Plan B");
    expect(JSON.stringify(changed.itemsByCategory.cell[0])).not.toContain("[object Object]");
  });

  it("does not duplicate history-backed worksheet insertions or deletions", () => {
    const withoutExtra = createWorkbook({});
    const withExtra = structuredClone(withoutExtra);
    withExtra.sheetOrder.push("sheet-2");
    withExtra.sheets["sheet-2"] = {
      cellData: {},
      columnCount: 10,
      id: "sheet-2",
      name: "Extra",
      rowCount: 10,
    };
    const inserted = buildWorkbookCompareModel({
      baseSnapshot: withoutExtra,
      orderedChangesetStream: [
        {
          mutations: [
            {
              mutationId: "sheet.mutation.insert-sheet",
              params: { sheet: { id: "sheet-2", name: "Extra" } },
            },
          ],
          streamOrder: 0,
        },
      ],
      targetSnapshot: withExtra,
    });
    const deleted = buildWorkbookCompareModel({
      baseSnapshot: withExtra,
      orderedChangesetStream: [
        {
          mutations: [
            { mutationId: "sheet.mutation.remove-sheet", params: { subUnitId: "sheet-2" } },
          ],
          streamOrder: 0,
        },
      ],
      targetSnapshot: withoutExtra,
    });

    expect(inserted.compareInfo.worksheets["sheet-2"]?.categories.worksheet).toHaveLength(1);
    expect(deleted.compareInfo.worksheets["sheet-2"]?.categories.worksheet).toHaveLength(1);
  });

  it("tracks row and column insert/delete operations and maps selections", () => {
    const base = createWorkbook({ rowCount: 5, columnCount: 5 });
    const current = createWorkbook({ rowCount: 7, columnCount: 4 });
    const model = buildWorkbookCompareModel({
      baseSnapshot: base,
      orderedChangesetStream: [
        {
          mutations: [
            {
              mutationId: "sheet.mutation.insert-row",
              params: {
                range: { endColumn: 0, endRow: 1, startColumn: 0, startRow: 1 },
                subUnitId: "sheet-1",
              },
            },
            {
              mutationId: "sheet.mutation.remove-col",
              params: {
                range: { endColumn: 2, endRow: 0, startColumn: 2, startRow: 0 },
                subUnitId: "sheet-1",
              },
            },
          ],
          streamOrder: 0,
        },
      ],
      targetSnapshot: current,
    });

    const sheet = model.compareInfo.worksheets["sheet-1"]!;
    expect(sheet.selectionMapping.rowOperations).toEqual([{ count: 1, kind: "insert", start: 1 }]);
    expect(sheet.selectionMapping.columnOperations).toEqual([
      { count: 1, kind: "delete", start: 2 },
    ]);
    expect(
      mapSelectionTargetAcrossPanes({
        compareInfo: model.compareInfo,
        sourceRole: "current",
        target: { endColumn: 1, endRow: 2, sheetId: "sheet-1", startColumn: 1, startRow: 2 },
      }),
    ).toMatchObject({ endColumn: 1, endRow: 1, startColumn: 1, startRow: 1 });
    expect(
      mapScrollTargetAcrossPanes({
        compareInfo: model.compareInfo,
        sourceRole: "base",
        target: {
          offsetX: 0,
          offsetY: 0,
          sheetId: "sheet-1",
          sheetViewStartColumn: 3,
          sheetViewStartRow: 2,
        },
      }),
    ).toMatchObject({ sheetViewStartColumn: 2, sheetViewStartRow: 3 });
  });

  it("uses each pane's mapped address in formula-strip state", () => {
    const model = buildWorkbookCompareModel({
      baseSnapshot: createWorkbook({ formula: "=A1", row: 1, value: "10" }),
      orderedChangesetStream: [
        {
          mutations: [
            {
              mutationId: "sheet.mutation.insert-row",
              params: {
                range: { endColumn: 0, endRow: 1, startColumn: 0, startRow: 1 },
                subUnitId: "sheet-1",
              },
            },
          ],
          streamOrder: 0,
        },
      ],
      targetSnapshot: createWorkbook({ formula: "=A2", row: 2, value: "10" }),
    });
    const item = model.itemsByCategory.cell[0] ?? null;

    expect(
      createWorkbookComparePaneFxStates({ compareInfo: model.compareInfo, item }),
    ).toMatchObject({
      base: { activeCellLabel: "A2", formula: "=A1" },
      current: { activeCellLabel: "A3", formula: "=A2" },
    });
  });

  it("creates advanced resource categories and value/style presentation snapshots", () => {
    const base = createWorkbook({
      resources: [
        {
          name: "SHEET_DATA_VALIDATION_PLUGIN",
          data: JSON.stringify({
            "sheet-1": { rule1: { name: "Old rule", ranges: [cellRange()] } },
          }),
        },
      ],
    });
    const current = createWorkbook({
      resources: [
        {
          name: "SHEET_DATA_VALIDATION_PLUGIN",
          data: JSON.stringify({
            "sheet-1": { rule1: { name: "New rule", ranges: [cellRange()] } },
          }),
        },
      ],
    });
    const model = buildWorkbookCompareModel({
      baseSnapshot: base,
      orderedChangesetStream: [],
      targetSnapshot: current,
    });

    expect(model.itemsByCategory["data-validation"][0]).toMatchObject({
      category: "data-validation",
      kind: "update",
      sheetId: "sheet-1",
      title: "New rule",
    });
    expect(
      buildCompareSnapshots({
        baseSnapshot: base,
        compareInfo: model.compareInfo,
        currentSnapshot: current,
        mode: "style",
      }).current?.sheets["sheet-1"],
    ).toBeDefined();
  });

  it("keeps resource locations independent on both sides", () => {
    const resources = (range: ReturnType<typeof cellRange> | null) =>
      range === null
        ? []
        : [
            {
              name: "SHEET_DATA_VALIDATION_PLUGIN",
              data: JSON.stringify({
                "sheet-1": { rule1: { name: "Rule", ranges: [range] } },
              }),
            },
          ];
    const oldRange = cellRange();
    const newRange = { endColumn: 2, endRow: 3, startColumn: 2, startRow: 3 };
    const moved = buildWorkbookCompareModel({
      baseSnapshot: createWorkbook({ resources: resources(oldRange) }),
      orderedChangesetStream: [],
      targetSnapshot: createWorkbook({ resources: resources(newRange) }),
    });
    const deleted = buildWorkbookCompareModel({
      baseSnapshot: createWorkbook({ resources: resources(oldRange) }),
      orderedChangesetStream: [],
      targetSnapshot: createWorkbook({ resources: resources(null) }),
    });
    const inserted = buildWorkbookCompareModel({
      baseSnapshot: createWorkbook({ resources: resources(null) }),
      orderedChangesetStream: [],
      targetSnapshot: createWorkbook({ resources: resources(oldRange) }),
    });

    expect(moved.itemsByCategory["data-validation"][0]?.selection).toEqual({
      base: { ...oldRange, sheetId: "sheet-1" },
      current: { ...newRange, sheetId: "sheet-1" },
    });
    expect(deleted.itemsByCategory["data-validation"][0]?.selection).toEqual({
      base: { ...oldRange, sheetId: "sheet-1" },
      current: null,
    });
    expect(inserted.itemsByCategory["data-validation"][0]?.selection).toEqual({
      base: null,
      current: { ...oldRange, sheetId: "sheet-1" },
    });
  });

  it("does not degrade for ordinary style and resource mutation IDs", () => {
    const model = buildWorkbookCompareModel({
      baseSnapshot: createWorkbook({ style: "base-style" }),
      orderedChangesetStream: [
        {
          mutations: [
            { mutationId: "sheet.mutation.set-style", params: {} },
            { mutationId: "sheet.mutation.set-data-validation", params: {} },
            { mutationId: "sheet.mutation.remove-sparkline", params: {} },
          ],
          streamOrder: 0,
        },
      ],
      targetSnapshot: createWorkbook({ style: "current-style" }),
    });

    expect(model.unsupportedMutationIds).toEqual([]);
    expect(model.readiness).toBe("ready");
  });

  it("keeps workbook-scoped resource keys out of worksheet tabs and finds nested sheet resources", () => {
    const resources = (sparklineValue: number, pivotValue: string) => [
      {
        name: "SHEET_SPARKLINE_PLUGIN",
        data: JSON.stringify({
          "workbook-1": {
            "sheet-1": { group1: { config: { color: sparklineValue }, sparklines: {} } },
          },
        }),
      },
      {
        name: "SHEET_PIVOT_TABLE_PLUGIN",
        data: JSON.stringify({
          dataFieldManagerConfig: { "workbook-1": { value: pivotValue } },
          pivotTableConfigs: {},
        }),
      },
    ];
    const model = buildWorkbookCompareModel({
      baseSnapshot: createWorkbook({ resources: resources(1, "before") }),
      orderedChangesetStream: [],
      targetSnapshot: createWorkbook({ resources: resources(2, "after") }),
    });

    expect(model.sheetOptions.map((sheet) => sheet.sheetId)).toEqual(["sheet-1"]);
    expect(model.itemsByCategory.sparkline).toHaveLength(1);
    expect(model.itemsByCategory.pivot).toHaveLength(0);
  });
});

function cellRange() {
  return { endColumn: 0, endRow: 0, startColumn: 0, startRow: 0 };
}

function createWorkbook(input: {
  readonly columnCount?: number;
  readonly formula?: string;
  readonly name?: string;
  readonly resources?: IWorkbookData["resources"];
  readonly row?: number;
  readonly rowCount?: number;
  readonly style?: string;
  readonly value?: string;
}): IWorkbookData {
  return {
    appVersion: "0.0.0-test",
    id: "workbook-1",
    locale: "enUS",
    name: input.name ?? "Budget",
    resources: input.resources ?? [],
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        cellData: {
          [input.row ?? 0]: {
            0: {
              ...(input.formula === undefined ? {} : { f: input.formula }),
              ...(input.style === undefined ? {} : { s: input.style }),
              ...(input.value === undefined ? {} : { v: input.value }),
            },
          },
        },
        columnCount: input.columnCount ?? 20,
        id: "sheet-1",
        name: "Main",
        rowCount: input.rowCount ?? 20,
      },
    },
    styles: {
      "base-style": { bg: { rgb: "#ffffff" } },
      "current-style": { bg: { rgb: "#f8fafc" } },
    },
  } as IWorkbookData;
}
