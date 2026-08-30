import type { ICellData, IRange, IStyleData, IWorkbookData, IWorksheetData } from "@univerjs/core";

export {
  buildWorkbookCompareFxDiffPanes,
  type WorkbookCompareFxDiffContentKind,
  type WorkbookCompareFxDiffPane,
  type WorkbookCompareFxDiffSegment,
  type WorkbookComparePaneFxState,
} from "./fx-diff.js";
import type { WorkbookComparePaneFxState } from "./fx-diff.js";

export type WorkbookCompareDiffKind = "delete" | "insert" | "update";
export type WorkbookCompareMode = "structure" | "style" | "value";
export type WorkbookCompareCategory =
  | "cell"
  | "chart"
  | "condition-format"
  | "data-validation"
  | "move"
  | "pivot"
  | "row-column"
  | "shape"
  | "sparkline"
  | "table"
  | "workbook"
  | "worksheet";
export type WorkbookComparePaneRole = "base" | "current";
export type WorkbookCompareSheetTabStatus = "default" | WorkbookCompareDiffKind;

export interface WorkbookCompareMutation {
  readonly localBatchId?: string;
  readonly localSeq?: number;
  readonly mutationId: string;
  readonly params: Record<string, unknown>;
}

export interface WorkbookCompareChangeset {
  readonly localSeqEnd?: number;
  readonly localSeqStart?: number;
  readonly mutations: readonly WorkbookCompareMutation[];
  readonly streamOrder: number;
}

export interface FlattenedWorkbookCompareMutation {
  readonly localSeqEnd?: number;
  readonly localSeqStart?: number;
  readonly mutation: WorkbookCompareMutation;
  readonly streamOrder: number;
}

export interface WorkbookCompareRangeTarget {
  readonly endColumn: number;
  readonly endRow: number;
  readonly sheetId: string;
  readonly startColumn: number;
  readonly startRow: number;
}

export interface WorkbookCompareSelectionTarget {
  readonly base: WorkbookCompareRangeTarget | null;
  readonly current: WorkbookCompareRangeTarget | null;
}

export interface WorkbookCompareAxisOperation {
  readonly count: number;
  readonly kind: "delete" | "insert";
  readonly start: number;
}

export interface WorkbookCompareSelectionMapping {
  readonly columnBaseIndexByCurrentIndex?: readonly (number | null)[];
  readonly columnCurrentIndexByBaseIndex?: readonly (number | null)[];
  readonly columnOperations: readonly WorkbookCompareAxisOperation[];
  readonly rowBaseIndexByCurrentIndex?: readonly (number | null)[];
  readonly rowCurrentIndexByBaseIndex?: readonly (number | null)[];
  readonly rowOperations: readonly WorkbookCompareAxisOperation[];
}

export interface WorkbookCompareScrollTarget {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sheetId: string;
  readonly sheetViewStartColumn: number;
  readonly sheetViewStartRow: number;
}

export interface WorkbookCompareDetailLine {
  readonly after?: string | null;
  readonly before?: string | null;
  readonly kind?: WorkbookCompareDiffKind | null;
  readonly label: string;
}

export interface WorkbookCompareItem {
  readonly address?: string;
  readonly category: WorkbookCompareCategory;
  readonly detailLines: readonly WorkbookCompareDetailLine[];
  readonly id: string;
  readonly kind: WorkbookCompareDiffKind;
  readonly mode: WorkbookCompareMode;
  readonly range?: IRange;
  readonly selection: WorkbookCompareSelectionTarget | null;
  readonly sheetId?: string;
  readonly sheetName?: string;
  readonly subtitle?: string;
  readonly title: string;
}

export interface WorkbookCompareCellChange {
  readonly address: string;
  readonly formula: { readonly base: string | null; readonly current: string | null };
  readonly kind: WorkbookCompareDiffKind | null;
  readonly selection: WorkbookCompareSelectionTarget;
  readonly styles: readonly WorkbookCompareDetailLine[];
  readonly value: { readonly base: string | null; readonly current: string | null };
}

export interface WorkbookCompareDimensionChange {
  readonly baseIndex: number | null;
  readonly currentIndex: number | null;
  readonly details: readonly WorkbookCompareDetailLine[];
  readonly kind: WorkbookCompareDiffKind;
}

export interface WorkbookCompareGapItem {
  readonly color?: string;
  readonly size: number;
  readonly stripeColor?: string;
}

export interface WorkbookCompareSheetGapConfig {
  readonly colGaps?: Record<number, WorkbookCompareGapItem>;
  readonly rowGaps?: Record<number, WorkbookCompareGapItem>;
}

export interface WorkbookCompareDimensionOverlay {
  readonly index: number;
  readonly kind: "hidden-mask" | "size-delta";
  readonly size: number;
}

export interface WorkbookCompareSheetOverlayConfig {
  readonly columnOverlays?: readonly WorkbookCompareDimensionOverlay[];
  readonly rowOverlays?: readonly WorkbookCompareDimensionOverlay[];
}

export interface WorkbookCompareCellHighlight {
  readonly column: number;
  readonly kind: WorkbookCompareDiffKind;
  readonly row: number;
}

export interface WorkbookCompareRangeHighlight {
  readonly kind: WorkbookCompareDiffKind;
  readonly range: IRange;
}

export interface WorkbookCompareSheetPresentation {
  readonly baseCellHighlights: readonly WorkbookCompareCellHighlight[];
  readonly baseColumnHighlights: readonly number[];
  readonly baseGaps: WorkbookCompareSheetGapConfig | null;
  readonly baseOverlayConfig: WorkbookCompareSheetOverlayConfig | null;
  readonly baseRangeHighlights: readonly WorkbookCompareRangeHighlight[];
  readonly baseRowHighlights: readonly number[];
  readonly currentCellHighlights: readonly WorkbookCompareCellHighlight[];
  readonly currentColumnHighlights: readonly number[];
  readonly currentGaps: WorkbookCompareSheetGapConfig | null;
  readonly currentOverlayConfig: WorkbookCompareSheetOverlayConfig | null;
  readonly currentRangeHighlights: readonly WorkbookCompareRangeHighlight[];
  readonly currentRowHighlights: readonly number[];
}

export interface WorkbookCompareSheetData {
  readonly categories: Record<Exclude<WorkbookCompareCategory, "workbook">, WorkbookCompareItem[]>;
  readonly cellChanges: readonly WorkbookCompareCellChange[];
  readonly cellItemByCurrentPosition: Record<string, WorkbookCompareItem>;
  readonly columnChanges: readonly WorkbookCompareDimensionChange[];
  readonly items: readonly WorkbookCompareItem[];
  readonly presentation: WorkbookCompareSheetPresentation;
  readonly rowChanges: readonly WorkbookCompareDimensionChange[];
  readonly selectionMapping: WorkbookCompareSelectionMapping;
  readonly sheetId: string;
  readonly sheetName: string;
}

export interface WorkbookCompareInfo {
  readonly snapshotAlignmentDegraded: boolean;
  readonly workbookItems: readonly WorkbookCompareItem[];
  readonly worksheets: Record<string, WorkbookCompareSheetData>;
}

export interface WorkbookCompareSheetOption {
  readonly baseSheet: WorkbookSheetMeta | null;
  readonly currentSheet: WorkbookSheetMeta | null;
  readonly label: string;
  readonly sheetId: string;
  readonly sortOrder: number;
  readonly status: WorkbookCompareSheetTabStatus;
}

export interface WorkbookSheetMeta {
  readonly hidden: boolean;
  readonly name: string;
  readonly order: number;
  readonly sheetId: string;
  readonly tabColor: string;
  readonly zoomRatio: number;
}

export interface WorkbookCompareSummary {
  readonly changedCells: number;
  readonly changedSheets: number;
  readonly deletedColumns: number;
  readonly deletedRows: number;
  readonly hasChanges: boolean;
  readonly insertedColumns: number;
  readonly insertedRows: number;
  readonly resourceChanges: number;
  readonly semanticSummary: readonly string[];
  readonly styleChanges: number;
}

export interface WorkbookCompareModel {
  readonly schemaVersion: 1;
  readonly compareInfo: WorkbookCompareInfo;
  readonly displayedSnapshots: {
    readonly base: IWorkbookData | null;
    readonly current: IWorkbookData | null;
  };
  readonly itemById: Record<string, WorkbookCompareItem>;
  readonly items: readonly WorkbookCompareItem[];
  readonly itemsByCategory: Record<WorkbookCompareCategory, WorkbookCompareItem[]>;
  readonly message: string | null;
  readonly preferredSheetId: string | null;
  readonly readiness: "degraded" | "ready";
  readonly sheetOptions: readonly WorkbookCompareSheetOption[];
  readonly summary: WorkbookCompareSummary;
  readonly unsupportedMutationIds: readonly string[];
  readonly worksheets: readonly WorkbookCompareSheetData[];
}

export interface WorkbookCompareSidebarTreeLabels {
  readonly categories: Partial<Record<WorkbookCompareCategory, string>>;
  readonly emptyText: string;
  readonly noActiveSheetLabel: string;
  readonly noCompareDataLabel: string;
  readonly rowLabel: (index: number) => string;
  readonly styleGroupLabel: string;
  readonly workbookRootLabel: string;
}

export interface WorkbookCompareSidebarTreeNode {
  readonly children?: readonly WorkbookCompareSidebarTreeNode[];
  readonly details: readonly WorkbookCompareDetailLine[];
  readonly id: string;
  readonly itemId: string | null;
  readonly kind: WorkbookCompareDiffKind;
  readonly label: string;
  readonly type: "detail" | "group" | "item" | "root";
}

export interface WorkbookCompareAgentReport {
  readonly schemaVersion: 1;
  readonly unitType: "sheet";
  readonly readiness: WorkbookCompareModel["readiness"];
  readonly summary: WorkbookCompareSummary;
  readonly items: readonly WorkbookCompareItem[];
  readonly sheets: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: WorkbookCompareSheetTabStatus;
    readonly itemIds: readonly string[];
  }[];
  readonly unsupportedMutationIds: readonly string[];
}

export interface WorkbookCompareFxState {
  readonly activeCellLabel: string;
  readonly baseDisplayValue: string;
  readonly baseFormula: string;
  readonly currentDisplayValue: string;
  readonly currentFormula: string;
  readonly selectionLabel: string;
}

export interface WorkbookComparePaneFxStates {
  readonly base: WorkbookComparePaneFxState;
  readonly current: WorkbookComparePaneFxState;
}

export interface BuildWorkbookCompareModelInput {
  readonly baseSnapshot: IWorkbookData | null;
  readonly mode?: Exclude<WorkbookCompareMode, "structure">;
  readonly orderedChangesetStream: readonly WorkbookCompareChangeset[];
  readonly preferredSheetId?: string | null;
  readonly targetSnapshot: IWorkbookData;
}

const CATEGORY_ORDER: WorkbookCompareCategory[] = [
  "worksheet",
  "cell",
  "row-column",
  "move",
  "condition-format",
  "data-validation",
  "sparkline",
  "table",
  "shape",
  "chart",
  "pivot",
  "workbook",
];

const WORKSHEET_CATEGORIES: Exclude<WorkbookCompareCategory, "workbook">[] = [
  "worksheet",
  "cell",
  "row-column",
  "move",
  "condition-format",
  "data-validation",
  "sparkline",
  "table",
  "shape",
  "chart",
  "pivot",
];

const RESOURCE_PLUGIN_NAMES: Record<
  Extract<
    WorkbookCompareCategory,
    "chart" | "condition-format" | "data-validation" | "pivot" | "shape" | "sparkline" | "table"
  >,
  string
> = {
  chart: "SHEET_CHART_PLUGIN",
  "condition-format": "SHEET_CONDITIONAL_FORMATTING_PLUGIN",
  "data-validation": "SHEET_DATA_VALIDATION_PLUGIN",
  pivot: "SHEET_PIVOT_TABLE_PLUGIN",
  shape: "SHEET_DRAWING_PLUGIN",
  sparkline: "SHEET_SPARKLINE_PLUGIN",
  table: "SHEET_TABLE_PLUGIN",
};

const MUTATION_IDS = {
  insertCol: "sheet.mutation.insert-col",
  insertRow: "sheet.mutation.insert-row",
  insertSheet: "sheet.mutation.insert-sheet",
  moveCols: "sheet.mutation.move-cols",
  moveColumns: "sheet.mutation.move-columns",
  moveRows: "sheet.mutation.move-rows",
  removeCol: "sheet.mutation.remove-col",
  removeRow: "sheet.mutation.remove-row",
  removeSheet: "sheet.mutation.remove-sheet",
  setRangeValues: "sheet.mutation.set-range-values",
  setTabColor: "sheet.mutation.set-tab-color",
  setWorkbookName: "sheet.mutation.set-workbook-name",
  setWorksheetColumnCount: "sheet.mutation.set-worksheet-column-count",
  setWorksheetHide: "sheet.mutation.set-worksheet-hide",
  setWorksheetName: "sheet.mutation.set-worksheet-name",
  setWorksheetOrder: "sheet.mutation.set-worksheet-order",
  setWorksheetRowCount: "sheet.mutation.set-worksheet-row-count",
} as const;

const UPDATE_SHEET_MUTATION_IDS = new Set<string>([
  MUTATION_IDS.setTabColor,
  MUTATION_IDS.setWorksheetColumnCount,
  MUTATION_IDS.setWorksheetHide,
  MUTATION_IDS.setWorksheetName,
  MUTATION_IDS.setWorksheetOrder,
  MUTATION_IDS.setWorksheetRowCount,
]);

const STRUCTURAL_MUTATION_NAME =
  /(?:^|\.)(?:insert|remove|delete|move|reorder)-(?:(?:row|rows|col|cols|column|columns)(?:-|$)|(?:sheet|sheets)$)/iu;

const HIGHLIGHT_STYLE_IDS: Record<WorkbookCompareDiffKind, string> = {
  delete: "__workbook_compare_delete__",
  insert: "__workbook_compare_insert__",
  update: "__workbook_compare_update__",
};

const HIGHLIGHT_STYLES: Record<WorkbookCompareDiffKind, IStyleData> = {
  delete: { bg: { rgb: "#fee2e2" }, cl: { rgb: "#7f1d1d" } },
  insert: { bg: { rgb: "#dcfce7" }, cl: { rgb: "#14532d" } },
  update: { bg: { rgb: "#dbeafe" }, cl: { rgb: "#1e3a8a" } },
};

export function flattenWorkbookCompareMutations(
  orderedChangesetStream: readonly WorkbookCompareChangeset[],
): FlattenedWorkbookCompareMutation[] {
  return [...orderedChangesetStream]
    .sort((left, right) => left.streamOrder - right.streamOrder)
    .flatMap((changeset) =>
      changeset.mutations.map((mutation) => ({
        ...(changeset.localSeqEnd === undefined ? {} : { localSeqEnd: changeset.localSeqEnd }),
        ...(changeset.localSeqStart === undefined
          ? {}
          : { localSeqStart: changeset.localSeqStart }),
        mutation,
        streamOrder: changeset.streamOrder,
      })),
    );
}

export function buildWorkbookCompareModel(
  input: BuildWorkbookCompareModelInput,
): WorkbookCompareModel {
  const mutations = flattenWorkbookCompareMutations(input.orderedChangesetStream);
  const compareInfo = getCompareInfoByMutations({
    baseSnapshot: input.baseSnapshot,
    currentSnapshot: input.targetSnapshot,
    mutations,
  });
  const sheetOptions = deriveCompareSheetOptions({
    baseSnapshot: input.baseSnapshot,
    compareInfo,
    currentSnapshot: input.targetSnapshot,
    mutations,
  });
  const items = [
    ...compareInfo.workbookItems,
    ...Object.values(compareInfo.worksheets).flatMap((sheet) => sheet.items),
  ];
  const itemsByCategory = groupItemsByCategoryFilled(items);
  const summary = buildSummary(compareInfo);
  const displayedSnapshots = buildCompareSnapshots({
    baseSnapshot: input.baseSnapshot,
    compareInfo,
    currentSnapshot: input.targetSnapshot,
    mode: input.mode ?? "value",
  });

  return {
    schemaVersion: 1,
    compareInfo,
    displayedSnapshots,
    itemById: Object.fromEntries(items.map((item) => [item.id, item])),
    items,
    itemsByCategory,
    message: summary.hasChanges ? null : "No workbook differences were found.",
    preferredSheetId: input.preferredSheetId ?? getDefaultCompareSheetId(sheetOptions),
    readiness:
      input.baseSnapshot === null || compareInfo.snapshotAlignmentDegraded ? "degraded" : "ready",
    sheetOptions,
    summary,
    unsupportedMutationIds: collectUnsupportedMutationIds(mutations),
    worksheets: Object.values(compareInfo.worksheets),
  };
}

/** Serializable Sheet diff report without rendered snapshots or UI presentation state. */
export function buildWorkbookCompareAgentReport(
  model: WorkbookCompareModel,
): WorkbookCompareAgentReport {
  return {
    schemaVersion: 1,
    unitType: "sheet",
    readiness: model.readiness,
    summary: model.summary,
    items: model.items,
    sheets: model.sheetOptions.map((sheet) => ({
      id: sheet.sheetId,
      name: sheet.label,
      status: sheet.status,
      itemIds:
        model.worksheets
          .find((worksheet) => worksheet.sheetId === sheet.sheetId)
          ?.items.map((item) => item.id) ?? [],
    })),
    unsupportedMutationIds: model.unsupportedMutationIds,
  };
}

export function getCompareInfoByMutations(input: {
  readonly baseSnapshot: IWorkbookData | null;
  readonly currentSnapshot: IWorkbookData | null;
  readonly mutations: readonly FlattenedWorkbookCompareMutation[];
}): WorkbookCompareInfo {
  const context = createBuildContext(input.baseSnapshot, input.currentSnapshot);
  recordMutationHints(context, input.mutations);
  normalizeOppositeAxisOperations(context);
  recordSnapshotDiffs(context);
  recordResourceDiffs(context);

  return {
    snapshotAlignmentDegraded: context.snapshotAlignmentDegraded,
    workbookItems: context.workbookItems,
    worksheets: Object.fromEntries(
      [...context.sheets.values()].map((sheet) => {
        const cellItemByCurrentPosition: Record<string, WorkbookCompareItem> = {};
        for (const item of sheet.categories.cell) {
          const current = item.selection?.current;
          if (current !== null && current !== undefined) {
            cellItemByCurrentPosition[`${current.startRow}:${current.startColumn}`] = item;
          }
        }
        const items = WORKSHEET_CATEGORIES.flatMap((category) => sheet.categories[category]);
        return [
          sheet.sheetId,
          {
            categories: sheet.categories,
            cellChanges: sheet.cellChanges,
            cellItemByCurrentPosition,
            columnChanges: sheet.columnChanges,
            items,
            presentation: buildSheetPresentation(sheet, input.baseSnapshot, input.currentSnapshot),
            rowChanges: sheet.rowChanges,
            selectionMapping: buildSelectionMapping(sheet),
            sheetId: sheet.sheetId,
            sheetName: sheet.sheetName,
          },
        ];
      }),
    ),
  };
}

export function deriveCompareSheetOptions(input: {
  readonly baseSnapshot: IWorkbookData | null;
  readonly compareInfo?: WorkbookCompareInfo;
  readonly currentSnapshot: IWorkbookData | null;
  readonly mutations: readonly FlattenedWorkbookCompareMutation[];
}): WorkbookCompareSheetOption[] {
  const baseMeta = readWorkbookMeta(input.baseSnapshot);
  const currentMeta = readWorkbookMeta(input.currentSnapshot);
  const sheetIds = new Set<string>([...baseMeta.sheetIds, ...currentMeta.sheetIds]);
  const statusMap = new Map<string, WorkbookCompareSheetTabStatus>();

  for (const mutation of input.mutations) {
    const params = asRecord(mutation.mutation.params) ?? {};
    const mutationId = mutation.mutation.mutationId;
    if (mutationId === MUTATION_IDS.insertSheet) {
      const sheetId = asString(asRecord(params.sheet)?.id);
      if (sheetId !== null) {
        sheetIds.add(sheetId);
        statusMap.set(sheetId, mergeSheetStatus(statusMap.get(sheetId), "insert"));
      }
      continue;
    }
    if (mutationId === MUTATION_IDS.removeSheet) {
      const sheetId = asString(params.subUnitId);
      if (sheetId !== null) {
        sheetIds.add(sheetId);
        statusMap.set(sheetId, mergeSheetStatus(statusMap.get(sheetId), "delete"));
      }
      continue;
    }
    if (UPDATE_SHEET_MUTATION_IDS.has(mutationId)) {
      const sheetId = asString(params.subUnitId);
      if (sheetId !== null) {
        statusMap.set(sheetId, mergeSheetStatus(statusMap.get(sheetId), "update"));
      }
    }
  }

  for (const [sheetId, sheetData] of Object.entries(input.compareInfo?.worksheets ?? {})) {
    sheetIds.add(sheetId);
    if (sheetData.items.length > 0) {
      const nextStatus = sheetData.categories.worksheet.some((item) => item.kind === "insert")
        ? "insert"
        : sheetData.categories.worksheet.some((item) => item.kind === "delete")
          ? "delete"
          : "update";
      statusMap.set(sheetId, mergeSheetStatus(statusMap.get(sheetId), nextStatus));
    }
  }

  return [...sheetIds]
    .map((sheetId) => {
      const baseSheet = baseMeta.sheets[sheetId] ?? null;
      const currentSheet = currentMeta.sheets[sheetId] ?? null;
      return {
        baseSheet,
        currentSheet,
        label: currentSheet?.name ?? baseSheet?.name ?? sheetId,
        sheetId,
        sortOrder: Math.min(
          baseSheet?.order ?? Number.MAX_SAFE_INTEGER,
          currentSheet?.order ?? Number.MAX_SAFE_INTEGER,
        ),
        status: statusMap.get(sheetId) ?? "default",
      };
    })
    .sort((left, right) =>
      left.sortOrder === right.sortOrder
        ? left.label.localeCompare(right.label)
        : left.sortOrder - right.sortOrder,
    );
}

export function getDefaultCompareSheetId(
  sheetOptions: readonly WorkbookCompareSheetOption[],
): string | null {
  return (
    (
      sheetOptions.find((option) => option.currentSheet !== null && !option.currentSheet.hidden) ??
      sheetOptions.find((option) => option.baseSheet !== null && !option.baseSheet.hidden) ??
      sheetOptions[0] ??
      null
    )?.sheetId ?? null
  );
}

export function buildCompareSnapshots(input: {
  readonly baseSnapshot: IWorkbookData | null;
  readonly compareInfo: WorkbookCompareInfo;
  readonly currentSnapshot: IWorkbookData | null;
  readonly mode: Exclude<WorkbookCompareMode, "structure">;
}): { readonly base: IWorkbookData | null; readonly current: IWorkbookData | null } {
  return {
    base: applyPresentationToSnapshot(input.baseSnapshot, input.compareInfo, input.mode, "base"),
    current: applyPresentationToSnapshot(
      input.currentSnapshot,
      input.compareInfo,
      input.mode,
      "current",
    ),
  };
}

export function mapSelectionTargetAcrossPanes(input: {
  readonly compareInfo: WorkbookCompareInfo;
  readonly sourceRole: WorkbookComparePaneRole;
  readonly target: WorkbookCompareRangeTarget;
}): WorkbookCompareRangeTarget | null {
  const mapping = input.compareInfo.worksheets[input.target.sheetId]?.selectionMapping;
  if (mapping === undefined) {
    return input.target;
  }
  return mapRangeTargetAcrossAxes(mapping, input.sourceRole, input.target);
}

export function mapScrollTargetAcrossPanes(input: {
  readonly compareInfo: WorkbookCompareInfo;
  readonly sourceRole: WorkbookComparePaneRole;
  readonly target: WorkbookCompareScrollTarget;
}): WorkbookCompareScrollTarget | null {
  const mapping = input.compareInfo.worksheets[input.target.sheetId]?.selectionMapping;
  if (mapping === undefined) {
    return input.target;
  }
  const sheetViewStartRow =
    input.sourceRole === "current"
      ? mapCurrentIndexToBase(
          input.target.sheetViewStartRow,
          mapping.rowOperations,
          mapping.rowBaseIndexByCurrentIndex,
        )
      : mapBaseIndexToCurrent(
          input.target.sheetViewStartRow,
          mapping.rowOperations,
          mapping.rowCurrentIndexByBaseIndex,
        );
  const sheetViewStartColumn =
    input.sourceRole === "current"
      ? mapCurrentIndexToBase(
          input.target.sheetViewStartColumn,
          mapping.columnOperations,
          mapping.columnBaseIndexByCurrentIndex,
        )
      : mapBaseIndexToCurrent(
          input.target.sheetViewStartColumn,
          mapping.columnOperations,
          mapping.columnCurrentIndexByBaseIndex,
        );
  if (sheetViewStartRow === null || sheetViewStartColumn === null) {
    return null;
  }
  return { ...input.target, sheetViewStartColumn, sheetViewStartRow };
}

export function createEmptyWorkbookCompareFxState(): WorkbookCompareFxState {
  return {
    activeCellLabel: "--",
    baseDisplayValue: "",
    baseFormula: "",
    currentDisplayValue: "",
    currentFormula: "",
    selectionLabel: "--",
  };
}

export function createWorkbookCompareFxState(input: {
  readonly compareInfo: WorkbookCompareInfo;
  readonly item: WorkbookCompareItem | null;
}): WorkbookCompareFxState {
  const item = input.item;
  if (item?.category !== "cell" || item.sheetId === undefined) {
    return createEmptyWorkbookCompareFxState();
  }
  const sheet = input.compareInfo.worksheets[item.sheetId];
  const change = sheet?.cellChanges.find((candidate) => candidate.address === item.address) ?? null;
  if (change === null) {
    return createEmptyWorkbookCompareFxState();
  }
  return {
    activeCellLabel: change.address,
    baseDisplayValue: change.value.base ?? "",
    baseFormula: change.formula.base ?? "",
    currentDisplayValue: change.value.current ?? "",
    currentFormula: change.formula.current ?? "",
    selectionLabel: item.address ?? "--",
  };
}

export function createWorkbookComparePaneFxStates(input: {
  readonly compareInfo: WorkbookCompareInfo;
  readonly item: WorkbookCompareItem | null;
}): WorkbookComparePaneFxStates {
  const fx = createWorkbookCompareFxState(input);
  const selection = input.item?.selection ?? null;
  return {
    base: createWorkbookComparePaneFxState({
      displayValue: fx.baseDisplayValue,
      fallbackLabel: fx.activeCellLabel,
      formula: fx.baseFormula,
      selection: selection?.base ?? null,
    }),
    current: createWorkbookComparePaneFxState({
      displayValue: fx.currentDisplayValue,
      fallbackLabel: fx.activeCellLabel,
      formula: fx.currentFormula,
      selection: selection?.current ?? null,
    }),
  };
}

function createWorkbookComparePaneFxState(input: {
  readonly displayValue: string;
  readonly fallbackLabel: string;
  readonly formula: string;
  readonly selection: WorkbookCompareRangeTarget | null;
}): WorkbookComparePaneFxState {
  const selection = input.selection;
  if (selection === null) {
    return {
      activeCellLabel: input.fallbackLabel,
      displayValue: input.displayValue,
      formula: input.formula,
      selectionLabel: input.fallbackLabel,
    };
  }

  const start = formatCellAddress(selection.startRow, selection.startColumn);
  const end = formatCellAddress(selection.endRow, selection.endColumn);
  return {
    activeCellLabel: start,
    displayValue: input.displayValue,
    formula: input.formula,
    selectionLabel: start === end ? start : `${start}:${end}`,
  };
}

export function buildWorkbookCompareSidebarTree(input: {
  readonly activeSheetId: string | null;
  readonly items: readonly WorkbookCompareItem[];
  readonly labels: WorkbookCompareSidebarTreeLabels;
  readonly model: Pick<WorkbookCompareModel, "worksheets">;
  readonly searchQuery: string;
  readonly tab: "workbook" | "worksheet";
}): WorkbookCompareSidebarTreeNode[] {
  const query = input.searchQuery.trim();
  const items = input.items.filter((item) => matchesSidebarSearch(item, query));
  const buckets = groupItemsByCategoryFilled(items);
  const categories = input.tab === "workbook" ? (["workbook"] as const) : WORKSHEET_CATEGORIES;
  const categoryNodes = categories.flatMap((category) => {
    const children = (buckets[category] ?? []).map((item) => buildItemTreeNode(item));
    if (children.length === 0) {
      return [];
    }
    return [
      {
        children,
        details: [],
        id: `category:${category}`,
        itemId: null,
        kind: "update" as const,
        label: `${input.labels.categories[category] ?? category} (${children.length})`,
        type: "group" as const,
      },
    ];
  });
  if (categoryNodes.length === 0) {
    return [];
  }
  const activeWorksheet =
    input.activeSheetId === null
      ? null
      : (input.model.worksheets.find((worksheet) => worksheet.sheetId === input.activeSheetId) ??
        null);
  return [
    {
      children: categoryNodes,
      details: [],
      id: input.tab === "workbook" ? "root:workbook" : `root:${input.activeSheetId ?? "none"}`,
      itemId: null,
      kind: "update",
      label:
        input.tab === "workbook"
          ? input.labels.workbookRootLabel
          : activeWorksheet?.sheetName || input.labels.noActiveSheetLabel,
      type: "root",
    },
  ];
}

export function collectWorkbookCompareSidebarItemIds(
  nodes: readonly WorkbookCompareSidebarTreeNode[],
): string[] {
  return nodes.flatMap((node) => [
    ...(node.itemId !== null ? [node.itemId] : []),
    ...collectWorkbookCompareSidebarItemIds(node.children ?? []),
  ]);
}

function createBuildContext(
  baseSnapshot: IWorkbookData | null,
  currentSnapshot: IWorkbookData | null,
): BuildContext {
  return {
    baseSnapshot,
    currentSnapshot,
    sheets: new Map(),
    snapshotAlignmentDegraded: false,
    workbookItems: [],
  };
}

interface BuildContext {
  readonly baseSnapshot: IWorkbookData | null;
  readonly currentSnapshot: IWorkbookData | null;
  readonly sheets: Map<string, SheetBuildState>;
  snapshotAlignmentDegraded: boolean;
  readonly workbookItems: WorkbookCompareItem[];
}

interface SheetBuildState {
  readonly categories: Record<Exclude<WorkbookCompareCategory, "workbook">, WorkbookCompareItem[]>;
  readonly cellChanges: WorkbookCompareCellChange[];
  readonly columnChanges: WorkbookCompareDimensionChange[];
  readonly columnOperations: WorkbookCompareAxisOperation[];
  readonly rowChanges: WorkbookCompareDimensionChange[];
  readonly rowOperations: WorkbookCompareAxisOperation[];
  readonly sheetId: string;
  sheetName: string;
}

function createCategories(): Record<
  Exclude<WorkbookCompareCategory, "workbook">,
  WorkbookCompareItem[]
> {
  return Object.fromEntries(
    WORKSHEET_CATEGORIES.map((category) => [category, []]),
  ) as unknown as Record<Exclude<WorkbookCompareCategory, "workbook">, WorkbookCompareItem[]>;
}

function ensureSheet(context: BuildContext, sheetId: string): SheetBuildState {
  const existing = context.sheets.get(sheetId);
  if (existing !== undefined) {
    return existing;
  }
  const sheet = {
    categories: createCategories(),
    cellChanges: [],
    columnChanges: [],
    columnOperations: [],
    rowChanges: [],
    rowOperations: [],
    sheetId,
    sheetName:
      getSheetName(context.currentSnapshot, sheetId) ??
      getSheetName(context.baseSnapshot, sheetId) ??
      sheetId,
  };
  context.sheets.set(sheetId, sheet);
  return sheet;
}

function recordMutationHints(
  context: BuildContext,
  mutations: readonly FlattenedWorkbookCompareMutation[],
): void {
  for (const flattened of mutations) {
    const mutationId = flattened.mutation.mutationId;
    const params = asRecord(flattened.mutation.params) ?? {};
    switch (mutationId) {
      case MUTATION_IDS.insertSheet: {
        const sheet = asRecord(params.sheet);
        const sheetId = asString(sheet?.id);
        if (sheetId === null) {
          break;
        }
        const sheetName = asString(sheet?.name) ?? sheetId;
        const item = createItem({
          category: "worksheet",
          kind: "insert",
          mode: "structure",
          sheetId,
          sheetName,
          title: `Sheet added: ${sheetName}`,
        });
        ensureSheet(context, sheetId).categories.worksheet.push(item);
        context.workbookItems.push({ ...item, category: "workbook", id: `workbook:${item.id}` });
        break;
      }
      case MUTATION_IDS.removeSheet: {
        const sheetId = asString(params.subUnitId);
        if (sheetId === null) {
          break;
        }
        const sheetName = getSheetName(context.baseSnapshot, sheetId) ?? sheetId;
        const item = createItem({
          category: "worksheet",
          kind: "delete",
          mode: "structure",
          sheetId,
          sheetName,
          title: `Sheet deleted: ${sheetName}`,
        });
        ensureSheet(context, sheetId).categories.worksheet.push(item);
        context.workbookItems.push({ ...item, category: "workbook", id: `workbook:${item.id}` });
        break;
      }
      case MUTATION_IDS.insertRow:
      case MUTATION_IDS.removeRow:
        recordAxisOperation(
          context,
          params,
          "row",
          mutationId === MUTATION_IDS.insertRow ? "insert" : "delete",
        );
        break;
      case MUTATION_IDS.insertCol:
      case MUTATION_IDS.removeCol:
        recordAxisOperation(
          context,
          params,
          "column",
          mutationId === MUTATION_IDS.insertCol ? "insert" : "delete",
        );
        break;
      case MUTATION_IDS.moveRows:
      case MUTATION_IDS.moveCols:
      case MUTATION_IDS.moveColumns:
        recordMoveItem(context, params, mutationId === MUTATION_IDS.moveRows ? "row" : "column");
        break;
      default:
        break;
    }
  }
}

function normalizeOppositeAxisOperations(context: BuildContext): void {
  for (const sheet of context.sheets.values()) {
    replaceArrayContents(sheet.rowOperations, cancelOppositeAxisOperations(sheet.rowOperations));
    replaceArrayContents(
      sheet.columnOperations,
      cancelOppositeAxisOperations(sheet.columnOperations),
    );
  }
}

function cancelOppositeAxisOperations(
  operations: readonly WorkbookCompareAxisOperation[],
): WorkbookCompareAxisOperation[] {
  const normalized: WorkbookCompareAxisOperation[] = [];
  for (const operation of operations) {
    const previous = normalized[normalized.length - 1];
    if (
      previous !== undefined &&
      previous.kind !== operation.kind &&
      previous.start === operation.start &&
      previous.count === operation.count
    ) {
      normalized.pop();
    } else {
      normalized.push(operation);
    }
  }
  return normalized;
}

function replaceArrayContents<T>(target: T[], values: readonly T[]): void {
  target.splice(0, target.length, ...values);
}

function recordAxisOperation(
  context: BuildContext,
  params: Record<string, unknown>,
  axis: "column" | "row",
  kind: "delete" | "insert",
): void {
  const sheetId = asString(params.subUnitId);
  const range = asRange(params.range) ?? asRange(params);
  if (sheetId === null || range === null) {
    return;
  }
  const start = axis === "row" ? range.startRow : range.startColumn;
  const count =
    axis === "row" ? range.endRow - range.startRow + 1 : range.endColumn - range.startColumn + 1;
  const sheet = ensureSheet(context, sheetId);
  const operation = { count, kind, start };
  if (axis === "row") {
    sheet.rowOperations.push(operation);
  } else {
    sheet.columnOperations.push(operation);
  }
}

function recordMoveItem(
  context: BuildContext,
  params: Record<string, unknown>,
  axis: "column" | "row",
): void {
  const sheetId = asString(params.subUnitId);
  const range = asRange(params.sourceRange) ?? asRange(params.range) ?? asRange(params);
  const targetRange = asRange(params.targetRange);
  const to =
    (targetRange === null
      ? null
      : axis === "row"
        ? targetRange.startRow
        : targetRange.startColumn) ??
    asNumber(params.to) ??
    asNumber(params.target) ??
    asNumber(params.toIndex);
  if (sheetId === null || range === null || to === null) {
    return;
  }
  const sheet = ensureSheet(context, sheetId);
  const from = axis === "row" ? range.startRow : range.startColumn;
  const count =
    axis === "row" ? range.endRow - range.startRow + 1 : range.endColumn - range.startColumn + 1;
  sheet.categories.move.push(
    createItem({
      category: "move",
      detailLines: [
        { after: String(to + 1), before: String(from + 1), kind: "update", label: "Position" },
        { after: String(count), before: String(count), kind: null, label: "Count" },
      ],
      kind: "update",
      mode: "structure",
      sheetId,
      sheetName: sheet.sheetName,
      title: `${axis === "row" ? "Rows" : "Columns"} moved`,
    }),
  );
}

function recordSnapshotDiffs(context: BuildContext): void {
  const baseMeta = readWorkbookMeta(context.baseSnapshot);
  const currentMeta = readWorkbookMeta(context.currentSnapshot);
  if (baseMeta.name !== currentMeta.name) {
    context.workbookItems.push(
      createItem({
        category: "workbook",
        detailLines: [
          { after: currentMeta.name, before: baseMeta.name, kind: "update", label: "Name" },
        ],
        kind: "update",
        mode: "structure",
        title: "Workbook renamed",
      }),
    );
  }

  const sheetIds = mergeOrderedIds(baseMeta.sheetIds, currentMeta.sheetIds);
  for (const sheetId of sheetIds) {
    const baseSheet = baseMeta.sheets[sheetId] ?? null;
    const currentSheet = currentMeta.sheets[sheetId] ?? null;
    const sheet = ensureSheet(context, sheetId);
    if (baseSheet === null && currentSheet !== null) {
      if (!sheet.categories.worksheet.some((item) => item.kind === "insert")) {
        sheet.categories.worksheet.push(
          createItem({
            category: "worksheet",
            kind: "insert",
            mode: "structure",
            sheetId,
            sheetName: currentSheet.name,
            title: `Sheet added: ${currentSheet.name}`,
          }),
        );
      }
      continue;
    }
    if (baseSheet !== null && currentSheet === null) {
      if (!sheet.categories.worksheet.some((item) => item.kind === "delete")) {
        sheet.categories.worksheet.push(
          createItem({
            category: "worksheet",
            kind: "delete",
            mode: "structure",
            sheetId,
            sheetName: baseSheet.name,
            title: `Sheet deleted: ${baseSheet.name}`,
          }),
        );
      }
      continue;
    }
    if (baseSheet === null || currentSheet === null) {
      continue;
    }
    if (baseSheet.name !== currentSheet.name) {
      sheet.categories.worksheet.push(
        createItem({
          category: "worksheet",
          detailLines: [
            { after: currentSheet.name, before: baseSheet.name, kind: "update", label: "Name" },
          ],
          kind: "update",
          mode: "structure",
          sheetId,
          sheetName: currentSheet.name,
          title: "Sheet renamed",
        }),
      );
    }
    compareDimensions(context, sheetId, sheet, "row");
    compareDimensions(context, sheetId, sheet, "column");
    compareCells(context, sheetId, sheet);
  }
}

function compareDimensions(
  context: BuildContext,
  sheetId: string,
  sheet: SheetBuildState,
  axis: "column" | "row",
): void {
  const baseSheet = getWorksheet(context.baseSnapshot, sheetId);
  const currentSheet = getWorksheet(context.currentSnapshot, sheetId);
  const baseCount = axis === "row" ? (baseSheet?.rowCount ?? 0) : (baseSheet?.columnCount ?? 0);
  const currentCount =
    axis === "row" ? (currentSheet?.rowCount ?? 0) : (currentSheet?.columnCount ?? 0);
  if (
    currentCount !== baseCount &&
    (axis === "row" ? sheet.rowOperations : sheet.columnOperations).length === 0
  ) {
    const inferred = inferSnapshotAxisOperation(context, sheetId, axis, baseCount, currentCount);
    const operation = inferred.operation;
    context.snapshotAlignmentDegraded ||= inferred.ambiguous;
    if (axis === "row") {
      sheet.rowOperations.push(operation);
    } else {
      sheet.columnOperations.push(operation);
    }
  }
  const operations = axis === "row" ? sheet.rowOperations : sheet.columnOperations;
  const pairs = alignAxisIndexes(baseCount, currentCount, operations);
  for (const { baseIndex, currentIndex } of pairs) {
    if (baseIndex === null || currentIndex === null) {
      continue;
    }
    const details = collectDimensionDetails(context, sheetId, axis, baseIndex, currentIndex);
    if (details.length === 0) {
      continue;
    }
    const change = { baseIndex, currentIndex, details, kind: "update" as const };
    const item = createDimensionItem(sheet, axis, change);
    if (axis === "row") {
      sheet.rowChanges.push(change);
    } else {
      sheet.columnChanges.push(change);
    }
    sheet.categories["row-column"].push(item);
  }
  for (const operation of operations) {
    sheet.categories["row-column"].push(
      createItem({
        category: "row-column",
        detailLines: [
          {
            after: String(operation.start + 1),
            before: null,
            kind: operation.kind,
            label: "Start",
          },
          { after: String(operation.count), before: null, kind: operation.kind, label: "Count" },
        ],
        kind: operation.kind,
        mode: "structure",
        range:
          axis === "row"
            ? {
                startRow: operation.start,
                endRow: operation.start + operation.count - 1,
                startColumn: 0,
                endColumn: 0,
              }
            : {
                startRow: 0,
                endRow: 0,
                startColumn: operation.start,
                endColumn: operation.start + operation.count - 1,
              },
        selection: {
          base:
            operation.kind === "delete"
              ? rangeToTarget(sheet.sheetId, {
                  startRow: axis === "row" ? operation.start : 0,
                  endRow: axis === "row" ? operation.start + operation.count - 1 : 0,
                  startColumn: axis === "column" ? operation.start : 0,
                  endColumn: axis === "column" ? operation.start + operation.count - 1 : 0,
                })
              : null,
          current:
            operation.kind === "insert"
              ? rangeToTarget(sheet.sheetId, {
                  startRow: axis === "row" ? operation.start : 0,
                  endRow: axis === "row" ? operation.start + operation.count - 1 : 0,
                  startColumn: axis === "column" ? operation.start : 0,
                  endColumn: axis === "column" ? operation.start + operation.count - 1 : 0,
                })
              : null,
        },
        sheetId,
        sheetName: sheet.sheetName,
        title: `${operation.kind === "insert" ? "Inserted" : "Deleted"} ${
          axis === "row" ? "rows" : "columns"
        }`,
      }),
    );
  }
}

function inferSnapshotAxisOperation(
  context: BuildContext,
  sheetId: string,
  axis: "column" | "row",
  baseCount: number,
  currentCount: number,
): { readonly ambiguous: boolean; readonly operation: WorkbookCompareAxisOperation } {
  const kind = currentCount > baseCount ? "insert" : "delete";
  const count = Math.abs(currentCount - baseCount);
  const smallerCount = Math.min(baseCount, currentCount);
  const base = buildAxisFingerprints(context.baseSnapshot, sheetId, axis, baseCount);
  const current = buildAxisFingerprints(context.currentSnapshot, sheetId, axis, currentCount);
  const prefixMismatches = new Uint32Array(smallerCount + 1);
  const suffixMismatches = new Uint32Array(smallerCount + 1);

  for (let index = 0; index < smallerCount; index += 1) {
    prefixMismatches[index + 1] =
      prefixMismatches[index]! + (base[index] === current[index] ? 0 : 1);
  }
  for (let index = smallerCount - 1; index >= 0; index -= 1) {
    const baseIndex = kind === "delete" ? index + count : index;
    const currentIndex = kind === "insert" ? index + count : index;
    suffixMismatches[index] =
      suffixMismatches[index + 1]! + (base[baseIndex] === current[currentIndex] ? 0 : 1);
  }

  let bestScore = Number.POSITIVE_INFINITY;
  const bestStarts: number[] = [];

  for (let start = 0; start <= smallerCount; start += 1) {
    const score = prefixMismatches[start]! + suffixMismatches[start]!;
    if (score < bestScore) {
      bestScore = score;
      bestStarts.splice(0, bestStarts.length, start);
    } else if (score === bestScore) {
      bestStarts.push(start);
    }
  }

  return {
    ambiguous: bestStarts.length !== 1 || bestScore > 0,
    operation: { count, kind, start: bestStarts[0] ?? 0 },
  };
}

function buildAxisFingerprints(
  snapshot: IWorkbookData | null,
  sheetId: string,
  axis: "column" | "row",
  count: number,
): string[] {
  const cellBuckets = new Map<number, Array<readonly [number, ICellData]>>();
  for (const [key, cell] of collectCells(snapshot, sheetId)) {
    const { column, row } = parsePositionKey(key);
    const axisIndex = axis === "row" ? row : column;
    const otherIndex = axis === "row" ? column : row;
    if (axisIndex < 0 || axisIndex >= count) continue;
    const cells = cellBuckets.get(axisIndex) ?? [];
    cells.push([otherIndex, cell]);
    cellBuckets.set(axisIndex, cells);
  }
  return Array.from({ length: count }, (_, index) =>
    stableStringify({
      cells: cellBuckets.get(index) ?? [],
      dimension:
        axis === "row"
          ? getRowData(snapshot, sheetId, index)
          : getColumnData(snapshot, sheetId, index),
    }),
  );
}

function compareCells(context: BuildContext, sheetId: string, sheet: SheetBuildState): void {
  const baseCells = collectCells(context.baseSnapshot, sheetId);
  const currentCells = collectCells(context.currentSnapshot, sheetId);
  const pairs = alignCells(baseCells, currentCells, sheet.rowOperations, sheet.columnOperations);
  for (const pair of pairs) {
    const baseCell = pair.base === null ? null : (baseCells.get(positionKey(pair.base)) ?? null);
    const currentCell =
      pair.current === null ? null : (currentCells.get(positionKey(pair.current)) ?? null);
    const valueBase = displayCellValue(baseCell);
    const valueCurrent = displayCellValue(currentCell);
    const formulaBase = toDisplayValue(baseCell?.f);
    const formulaCurrent = toDisplayValue(currentCell?.f);
    const styleDiffs = collectStyleDiffs(
      resolveStyle(context.baseSnapshot, baseCell?.s),
      resolveStyle(context.currentSnapshot, currentCell?.s),
    );
    const kind =
      inferDiffKind(formulaBase ?? valueBase, formulaCurrent ?? valueCurrent) ??
      (baseCell === null && currentCell !== null
        ? "insert"
        : baseCell !== null && currentCell === null
          ? "delete"
          : null);
    if (kind === null && styleDiffs.length === 0) {
      continue;
    }
    const addressPosition = pair.current ?? pair.base;
    if (addressPosition === null) {
      continue;
    }
    const { column, row } = addressPosition;
    const address = formatCellAddress(row, column);
    const detailLines: WorkbookCompareDetailLine[] = [];
    if (formulaBase !== formulaCurrent) {
      detailLines.push({
        after: formulaCurrent,
        before: formulaBase,
        kind: inferDiffKind(formulaBase, formulaCurrent),
        label: "Formula",
      });
    }
    if (valueBase !== valueCurrent) {
      detailLines.push({
        after: valueCurrent,
        before: valueBase,
        kind: inferDiffKind(valueBase, valueCurrent),
        label: "Value",
      });
    }
    detailLines.push(...styleDiffs);
    const selection = {
      base:
        pair.base === null
          ? null
          : rangeToTarget(sheetId, {
              startRow: pair.base.row,
              endRow: pair.base.row,
              startColumn: pair.base.column,
              endColumn: pair.base.column,
            }),
      current:
        pair.current === null
          ? null
          : rangeToTarget(sheetId, {
              startRow: pair.current.row,
              endRow: pair.current.row,
              startColumn: pair.current.column,
              endColumn: pair.current.column,
            }),
    };
    const item = createItem({
      address,
      category: "cell",
      detailLines,
      kind: kind ?? "update",
      mode: styleDiffs.length > 0 && kind === null ? "style" : "value",
      range: { startRow: row, endRow: row, startColumn: column, endColumn: column },
      selection,
      sheetId,
      sheetName: sheet.sheetName,
      subtitle: address,
      title: address,
    });
    sheet.cellChanges.push({
      address,
      formula: { base: formulaBase, current: formulaCurrent },
      kind,
      selection,
      styles: styleDiffs,
      value: { base: valueBase, current: valueCurrent },
    });
    sheet.categories.cell.push(item);
  }
}

interface CellPosition {
  readonly column: number;
  readonly row: number;
}

interface AlignedCellPair {
  readonly base: CellPosition | null;
  readonly current: CellPosition | null;
}

function alignCells(
  baseCells: ReadonlyMap<string, ICellData>,
  currentCells: ReadonlyMap<string, ICellData>,
  rowOperations: readonly WorkbookCompareAxisOperation[],
  columnOperations: readonly WorkbookCompareAxisOperation[],
): AlignedCellPair[] {
  const pairs: AlignedCellPair[] = [];
  const claimedCurrent = new Set<string>();

  for (const key of [...baseCells.keys()].sort(comparePositionKeys)) {
    const base = parsePositionKey(key);
    const currentRow = mapBaseIndexToCurrent(base.row, rowOperations);
    const currentColumn = mapBaseIndexToCurrent(base.column, columnOperations);
    const current =
      currentRow === null || currentColumn === null
        ? null
        : { column: currentColumn, row: currentRow };
    if (current !== null) {
      claimedCurrent.add(positionKey(current));
    }
    pairs.push({ base, current });
  }

  for (const key of [...currentCells.keys()].sort(comparePositionKeys)) {
    if (claimedCurrent.has(key)) {
      continue;
    }
    const current = parsePositionKey(key);
    const baseRow = mapCurrentIndexToBase(current.row, rowOperations);
    const baseColumn = mapCurrentIndexToBase(current.column, columnOperations);
    const base =
      baseRow === null || baseColumn === null ? null : { column: baseColumn, row: baseRow };
    pairs.push({ base: base !== null && baseCells.has(positionKey(base)) ? base : null, current });
  }

  return pairs.sort((left, right) => {
    const leftPosition = left.current ?? left.base ?? { column: 0, row: 0 };
    const rightPosition = right.current ?? right.base ?? { column: 0, row: 0 };
    return leftPosition.row - rightPosition.row || leftPosition.column - rightPosition.column;
  });
}

function parsePositionKey(key: string): CellPosition {
  const [row, column] = key.split(":").map(Number) as [number, number];
  return { column, row };
}

function positionKey(position: CellPosition): string {
  return `${position.row}:${position.column}`;
}

function recordResourceDiffs(context: BuildContext): void {
  const knownSheetIds = new Set([
    ...Object.keys(context.baseSnapshot?.sheets ?? {}),
    ...Object.keys(context.currentSnapshot?.sheets ?? {}),
  ]);
  for (const [category, pluginName] of Object.entries(RESOURCE_PLUGIN_NAMES) as Array<
    [keyof typeof RESOURCE_PLUGIN_NAMES, string]
  >) {
    const baseEntries = readSheetScopedEntries(
      getResource(context.baseSnapshot, pluginName),
      knownSheetIds,
    );
    const currentEntries = readSheetScopedEntries(
      getResource(context.currentSnapshot, pluginName),
      knownSheetIds,
    );
    const sheetIds = new Set([...Object.keys(baseEntries), ...Object.keys(currentEntries)]);
    for (const sheetId of sheetIds) {
      const sheet = ensureSheet(context, sheetId);
      const ids = new Set([
        ...Object.keys(baseEntries[sheetId] ?? {}),
        ...Object.keys(currentEntries[sheetId] ?? {}),
      ]);
      for (const id of [...ids].sort()) {
        const before = baseEntries[sheetId]?.[id];
        const after = currentEntries[sheetId]?.[id];
        if (stableStringify(before) === stableStringify(after)) {
          continue;
        }
        const kind =
          inferDiffKind(
            before === undefined ? null : "present",
            after === undefined ? null : "present",
          ) ?? "update";
        const baseRange = findFirstRange(before);
        const currentRange = findFirstRange(after);
        const range = currentRange ?? baseRange;
        sheet.categories[category].push(
          createItem({
            category,
            detailLines:
              before !== undefined && after !== undefined
                ? collectLeafDiffs(before, after).slice(0, 8)
                : [],
            kind,
            mode: "structure",
            ...(range === null ? {} : { range }),
            selection: {
              base: rangeToTarget(sheetId, baseRange),
              current: rangeToTarget(sheetId, currentRange),
            },
            sheetId,
            sheetName: sheet.sheetName,
            title: readResourceLabel(after ?? before, `${category} ${id}`),
          }),
        );
      }
    }
  }
}

function buildSelectionMapping(sheet: SheetBuildState): WorkbookCompareSelectionMapping {
  const rowState = buildAxisStateFromOperations(sheet.rowOperations);
  const columnState = buildAxisStateFromOperations(sheet.columnOperations);
  return {
    columnBaseIndexByCurrentIndex: columnState.baseIndexByCurrentIndex,
    columnCurrentIndexByBaseIndex: columnState.currentIndexByBaseIndex,
    columnOperations: sheet.columnOperations,
    rowBaseIndexByCurrentIndex: rowState.baseIndexByCurrentIndex,
    rowCurrentIndexByBaseIndex: rowState.currentIndexByBaseIndex,
    rowOperations: sheet.rowOperations,
  };
}

function buildSheetPresentation(
  sheet: SheetBuildState,
  baseSnapshot: IWorkbookData | null,
  currentSnapshot: IWorkbookData | null,
): WorkbookCompareSheetPresentation {
  const baseCellHighlights = sheet.cellChanges.flatMap((change) =>
    change.kind !== null && change.selection.base !== null
      ? [
          {
            column: change.selection.base.startColumn,
            kind: change.kind,
            row: change.selection.base.startRow,
          },
        ]
      : [],
  );
  const currentCellHighlights = sheet.cellChanges.flatMap((change) =>
    change.kind !== null && change.selection.current !== null
      ? [
          {
            column: change.selection.current.startColumn,
            kind: change.kind,
            row: change.selection.current.startRow,
          },
        ]
      : [],
  );
  const rowGaps = buildAxisGapConfigs({
    axis: "row",
    baseSnapshot,
    currentSnapshot,
    operations: sheet.rowOperations,
    sheetId: sheet.sheetId,
  });
  const columnGaps = buildAxisGapConfigs({
    axis: "column",
    baseSnapshot,
    currentSnapshot,
    operations: sheet.columnOperations,
    sheetId: sheet.sheetId,
  });
  return {
    baseCellHighlights,
    baseColumnHighlights: uniqueNumbers(
      sheet.columnChanges.flatMap((change) => change.baseIndex ?? []),
    ),
    baseGaps: mergeGapConfigs(rowGaps.base, columnGaps.base),
    baseOverlayConfig: null,
    baseRangeHighlights: [],
    baseRowHighlights: uniqueNumbers(sheet.rowChanges.flatMap((change) => change.baseIndex ?? [])),
    currentCellHighlights,
    currentColumnHighlights: uniqueNumbers(
      sheet.columnChanges.flatMap((change) => change.currentIndex ?? []),
    ),
    currentGaps: mergeGapConfigs(rowGaps.current, columnGaps.current),
    currentOverlayConfig: null,
    currentRangeHighlights: [],
    currentRowHighlights: uniqueNumbers(
      sheet.rowChanges.flatMap((change) => change.currentIndex ?? []),
    ),
  };
}

function applyPresentationToSnapshot(
  source: IWorkbookData | null,
  compareInfo: WorkbookCompareInfo,
  mode: Exclude<WorkbookCompareMode, "structure">,
  role: WorkbookComparePaneRole,
): IWorkbookData | null {
  if (source === null) {
    return null;
  }
  const snapshot = structuredClone(source);
  snapshot.styles = { ...(snapshot.styles ?? {}) };
  for (const [kind, style] of Object.entries(HIGHLIGHT_STYLES) as Array<
    [WorkbookCompareDiffKind, IStyleData]
  >) {
    snapshot.styles[HIGHLIGHT_STYLE_IDS[kind]] = style;
  }
  if (mode === "value") {
    snapshot.defaultStyle = null;
  }
  for (const sheet of Object.values(compareInfo.worksheets)) {
    for (const change of sheet.cellChanges) {
      const target = role === "base" ? change.selection.base : change.selection.current;
      if (target === null || change.kind === null) {
        continue;
      }
      if (
        (role === "base" && change.kind === "insert") ||
        (role === "current" && change.kind === "delete")
      ) {
        continue;
      }
      ensureCell(snapshot, target.sheetId, target.startRow, target.startColumn).s =
        HIGHLIGHT_STYLE_IDS[change.kind];
    }
  }
  return snapshot;
}

function groupItemsByCategory(): Record<WorkbookCompareCategory, WorkbookCompareItem[]> {
  return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, []])) as unknown as Record<
    WorkbookCompareCategory,
    WorkbookCompareItem[]
  >;
}

function groupItemsByCategoryFilled(
  items: readonly WorkbookCompareItem[],
): Record<WorkbookCompareCategory, WorkbookCompareItem[]> {
  const grouped = groupItemsByCategory();
  for (const item of items) {
    grouped[item.category].push(item);
  }
  return grouped;
}

function buildSummary(compareInfo: WorkbookCompareInfo): WorkbookCompareSummary {
  const items = [
    ...compareInfo.workbookItems,
    ...Object.values(compareInfo.worksheets).flatMap((sheet) => sheet.items),
  ];
  const grouped = groupItemsByCategoryFilled(items);
  const insertedRows = countAxisChanges(compareInfo, "row", "insert");
  const deletedRows = countAxisChanges(compareInfo, "row", "delete");
  const insertedColumns = countAxisChanges(compareInfo, "column", "insert");
  const deletedColumns = countAxisChanges(compareInfo, "column", "delete");
  const styleChanges = Object.values(compareInfo.worksheets).reduce(
    (total, sheet) => total + sheet.cellChanges.filter((change) => change.styles.length > 0).length,
    0,
  );
  const resourceChanges =
    grouped.chart.length +
    grouped["condition-format"].length +
    grouped["data-validation"].length +
    grouped.pivot.length +
    grouped.shape.length +
    grouped.sparkline.length +
    grouped.table.length;
  const semanticSummary = [
    `${items.length} changes`,
    grouped.cell.length > 0 ? `${grouped.cell.length} cells` : "",
    insertedRows + deletedRows + insertedColumns + deletedColumns > 0 ? "row/column structure" : "",
    resourceChanges > 0 ? `${resourceChanges} resources` : "",
  ].filter((entry) => entry.length > 0);
  return {
    changedCells: grouped.cell.length,
    changedSheets: Object.values(compareInfo.worksheets).filter((sheet) => sheet.items.length > 0)
      .length,
    deletedColumns,
    deletedRows,
    hasChanges: items.length > 0,
    insertedColumns,
    insertedRows,
    resourceChanges,
    semanticSummary,
    styleChanges,
  };
}

function countAxisChanges(
  compareInfo: WorkbookCompareInfo,
  axis: "column" | "row",
  kind: WorkbookCompareDiffKind,
): number {
  return Object.values(compareInfo.worksheets).reduce((total, sheet) => {
    const operations =
      axis === "row"
        ? sheet.selectionMapping.rowOperations
        : sheet.selectionMapping.columnOperations;
    return (
      total +
      operations
        .filter((operation) => operation.kind === kind)
        .reduce((sum, operation) => sum + operation.count, 0)
    );
  }, 0);
}

function createItem(
  input: Omit<
    WorkbookCompareItem,
    "detailLines" | "id" | "kind" | "mode" | "selection" | "title"
  > & {
    readonly detailLines?: readonly WorkbookCompareDetailLine[];
    readonly kind: WorkbookCompareDiffKind;
    readonly mode: WorkbookCompareMode;
    readonly selection?: WorkbookCompareSelectionTarget | null;
    readonly title: string;
  },
): WorkbookCompareItem {
  return {
    ...input,
    detailLines: input.detailLines ?? [],
    selection: input.selection ?? null,
    id: `${input.category}:${input.sheetId ?? "workbook"}:${slug(input.title)}:${slug(
      stableStringify({
        address: input.address,
        details: input.detailLines ?? [],
        range: input.range ?? null,
        selection: input.selection ?? null,
        subtitle: input.subtitle ?? null,
      }),
    ).slice(0, 96)}`,
  };
}

function createDimensionItem(
  sheet: SheetBuildState,
  axis: "column" | "row",
  change: WorkbookCompareDimensionChange,
): WorkbookCompareItem {
  const index = change.currentIndex ?? change.baseIndex ?? 0;
  return createItem({
    category: "row-column",
    detailLines: change.details,
    kind: "update",
    mode: "structure",
    range:
      axis === "row"
        ? { startRow: index, endRow: index, startColumn: 0, endColumn: 0 }
        : { startRow: 0, endRow: 0, startColumn: index, endColumn: index },
    sheetId: sheet.sheetId,
    sheetName: sheet.sheetName,
    title: `${axis === "row" ? "Row" : "Column"} ${index + 1} changed`,
  });
}

function collectDimensionDetails(
  context: BuildContext,
  sheetId: string,
  axis: "column" | "row",
  baseIndex: number | null,
  currentIndex: number | null,
): WorkbookCompareDetailLine[] {
  const before =
    axis === "row"
      ? getRowData(context.baseSnapshot, sheetId, baseIndex)
      : getColumnData(context.baseSnapshot, sheetId, baseIndex);
  const after =
    axis === "row"
      ? getRowData(context.currentSnapshot, sheetId, currentIndex)
      : getColumnData(context.currentSnapshot, sheetId, currentIndex);
  if (stableStringify(before) === stableStringify(after)) {
    return [];
  }
  return collectLeafDiffs(before, after).slice(0, 6);
}

function alignAxisIndexes(
  baseCount: number,
  currentCount: number,
  operations: readonly WorkbookCompareAxisOperation[],
): Array<{ readonly baseIndex: number | null; readonly currentIndex: number | null }> {
  const pairs: Array<{ readonly baseIndex: number | null; readonly currentIndex: number | null }> =
    [];
  const claimedCurrent = new Set<number>();
  for (let baseIndex = 0; baseIndex < baseCount; baseIndex += 1) {
    const mapped = mapBaseIndexToCurrent(baseIndex, operations);
    const currentIndex = mapped !== null && mapped < currentCount ? mapped : null;
    if (currentIndex !== null) {
      claimedCurrent.add(currentIndex);
    }
    pairs.push({ baseIndex, currentIndex });
  }
  for (let currentIndex = 0; currentIndex < currentCount; currentIndex += 1) {
    if (!claimedCurrent.has(currentIndex)) {
      const mapped = mapCurrentIndexToBase(currentIndex, operations);
      pairs.push({
        baseIndex: mapped !== null && mapped < baseCount ? mapped : null,
        currentIndex,
      });
    }
  }
  return pairs.sort((left, right) => {
    const leftIndex = left.currentIndex ?? left.baseIndex ?? 0;
    const rightIndex = right.currentIndex ?? right.baseIndex ?? 0;
    return leftIndex - rightIndex;
  });
}

function buildAxisGapConfigs(input: {
  readonly axis: "column" | "row";
  readonly baseSnapshot: IWorkbookData | null;
  readonly currentSnapshot: IWorkbookData | null;
  readonly operations: readonly WorkbookCompareAxisOperation[];
  readonly sheetId: string;
}): {
  readonly base: WorkbookCompareSheetGapConfig | null;
  readonly current: WorkbookCompareSheetGapConfig | null;
} {
  if (input.operations.length === 0) {
    return { base: null, current: null };
  }
  const baseSheet = getWorksheet(input.baseSnapshot, input.sheetId);
  const currentSheet = getWorksheet(input.currentSnapshot, input.sheetId);
  const baseCount =
    input.axis === "row" ? (baseSheet?.rowCount ?? 0) : (baseSheet?.columnCount ?? 0);
  const currentCount =
    input.axis === "row" ? (currentSheet?.rowCount ?? 0) : (currentSheet?.columnCount ?? 0);
  const pairs = alignAxisIndexes(baseCount, currentCount, input.operations);
  const baseMissing = pairs
    .filter(
      (pair): pair is { readonly baseIndex: null; readonly currentIndex: number } =>
        pair.baseIndex === null && pair.currentIndex !== null,
    )
    .map((pair) => pair.currentIndex);
  const currentMissing = pairs
    .filter(
      (pair): pair is { readonly baseIndex: number; readonly currentIndex: null } =>
        pair.baseIndex !== null && pair.currentIndex === null,
    )
    .map((pair) => pair.baseIndex);
  const baseGaps = buildMissingSideGaps({
    axis: input.axis,
    color: "#fee2e2",
    indexes: baseMissing,
    missingSnapshot: input.currentSnapshot,
    missingSnapshotCount: currentCount,
    pairedIndexes: pairs,
    sheetId: input.sheetId,
    stripeColor: "#fecaca",
    targetRole: "base",
  });
  const currentGaps = buildMissingSideGaps({
    axis: input.axis,
    color: "#dcfce7",
    indexes: currentMissing,
    missingSnapshot: input.baseSnapshot,
    missingSnapshotCount: baseCount,
    pairedIndexes: pairs,
    sheetId: input.sheetId,
    stripeColor: "#bbf7d0",
    targetRole: "current",
  });
  const key = input.axis === "row" ? "rowGaps" : "colGaps";
  return {
    base: Object.keys(baseGaps).length === 0 ? null : { [key]: baseGaps },
    current: Object.keys(currentGaps).length === 0 ? null : { [key]: currentGaps },
  };
}

function buildMissingSideGaps(input: {
  readonly axis: "column" | "row";
  readonly color: string;
  readonly indexes: readonly number[];
  readonly missingSnapshot: IWorkbookData | null;
  readonly missingSnapshotCount: number;
  readonly pairedIndexes: readonly {
    readonly baseIndex: number | null;
    readonly currentIndex: number | null;
  }[];
  readonly sheetId: string;
  readonly stripeColor: string;
  readonly targetRole: WorkbookComparePaneRole;
}): Record<number, WorkbookCompareGapItem> {
  const gaps: Record<number, WorkbookCompareGapItem> = {};
  for (const group of groupConsecutiveIndexes(input.indexes)) {
    const afterGroup = group[group.length - 1]! + 1;
    const nextPair = input.pairedIndexes.find((pair) => {
      const sourceIndex = input.targetRole === "base" ? pair.currentIndex : pair.baseIndex;
      const targetIndex = input.targetRole === "base" ? pair.baseIndex : pair.currentIndex;
      return sourceIndex !== null && sourceIndex >= afterGroup && targetIndex !== null;
    });
    const targetIndex =
      (input.targetRole === "base" ? nextPair?.baseIndex : nextPair?.currentIndex) ??
      input.missingSnapshotCount - group.length;
    const size = group.reduce(
      (sum, index) => sum + readAxisSize(input.missingSnapshot, input.sheetId, input.axis, index),
      0,
    );
    const existing = gaps[targetIndex];
    gaps[targetIndex] = {
      color: input.color,
      size: (existing?.size ?? 0) + size,
      stripeColor: input.stripeColor,
    };
  }
  return gaps;
}

function groupConsecutiveIndexes(indexes: readonly number[]): number[][] {
  const groups: number[][] = [];
  for (const index of [...indexes].sort((left, right) => left - right)) {
    const last = groups[groups.length - 1];
    if (last === undefined || last[last.length - 1] !== index - 1) {
      groups.push([index]);
    } else {
      last.push(index);
    }
  }
  return groups;
}

function readAxisSize(
  snapshot: IWorkbookData | null,
  sheetId: string,
  axis: "column" | "row",
  index: number,
): number {
  const sheet = getWorksheet(snapshot, sheetId);
  const dimension = asRecord(axis === "row" ? sheet?.rowData?.[index] : sheet?.columnData?.[index]);
  if (asNumber(dimension?.hd) === 1) {
    return 0;
  }
  return (
    asNumber(axis === "row" ? dimension?.h : dimension?.w) ??
    asNumber(axis === "row" ? sheet?.defaultRowHeight : sheet?.defaultColumnWidth) ??
    (axis === "row" ? 24 : 88)
  );
}

function mergeGapConfigs(
  first: WorkbookCompareSheetGapConfig | null,
  second: WorkbookCompareSheetGapConfig | null,
): WorkbookCompareSheetGapConfig | null {
  if (first === null && second === null) {
    return null;
  }
  return {
    ...(first?.rowGaps === undefined ? {} : { rowGaps: first.rowGaps }),
    ...(second?.colGaps === undefined ? {} : { colGaps: second.colGaps }),
  };
}

function buildAxisStateFromOperations(operations: readonly WorkbookCompareAxisOperation[]): {
  readonly baseIndexByCurrentIndex: readonly (number | null)[];
  readonly currentIndexByBaseIndex: readonly (number | null)[];
} {
  const max = operations.reduce(
    (value, operation) => Math.max(value, operation.start + operation.count + 64),
    128,
  );
  return {
    baseIndexByCurrentIndex: Array.from({ length: max }, (_, index) =>
      mapCurrentIndexToBase(index, operations),
    ),
    currentIndexByBaseIndex: Array.from({ length: max }, (_, index) =>
      mapBaseIndexToCurrent(index, operations),
    ),
  };
}

function mapRangeTargetAcrossAxes(
  mapping: WorkbookCompareSelectionMapping,
  sourceRole: WorkbookComparePaneRole,
  target: WorkbookCompareRangeTarget,
): WorkbookCompareRangeTarget | null {
  const mapRow =
    sourceRole === "current"
      ? (index: number) =>
          mapCurrentIndexToBase(index, mapping.rowOperations, mapping.rowBaseIndexByCurrentIndex)
      : (index: number) =>
          mapBaseIndexToCurrent(index, mapping.rowOperations, mapping.rowCurrentIndexByBaseIndex);
  const mapColumn =
    sourceRole === "current"
      ? (index: number) =>
          mapCurrentIndexToBase(
            index,
            mapping.columnOperations,
            mapping.columnBaseIndexByCurrentIndex,
          )
      : (index: number) =>
          mapBaseIndexToCurrent(
            index,
            mapping.columnOperations,
            mapping.columnCurrentIndexByBaseIndex,
          );
  const startRow = mapRow(target.startRow);
  const endRow = mapRow(target.endRow);
  const startColumn = mapColumn(target.startColumn);
  const endColumn = mapColumn(target.endColumn);
  if (startRow === null || endRow === null || startColumn === null || endColumn === null) {
    return null;
  }
  return { ...target, endColumn, endRow, startColumn, startRow };
}

function mapCurrentIndexToBase(
  index: number,
  operations: readonly WorkbookCompareAxisOperation[],
  baseIndexByCurrentIndex?: readonly (number | null)[],
): number | null {
  const mapped = baseIndexByCurrentIndex?.[index];
  if (mapped !== undefined) {
    return mapped;
  }
  let currentIndex = index;
  for (const operation of [...operations].reverse()) {
    if (operation.kind === "insert") {
      if (currentIndex >= operation.start && currentIndex < operation.start + operation.count) {
        return null;
      }
      if (currentIndex >= operation.start + operation.count) {
        currentIndex -= operation.count;
      }
    } else if (currentIndex >= operation.start) {
      currentIndex += operation.count;
    }
  }
  return currentIndex;
}

function mapBaseIndexToCurrent(
  index: number,
  operations: readonly WorkbookCompareAxisOperation[],
  currentIndexByBaseIndex?: readonly (number | null)[],
): number | null {
  const mapped = currentIndexByBaseIndex?.[index];
  if (mapped !== undefined) {
    return mapped;
  }
  let currentIndex: number | null = index;
  for (const operation of operations) {
    if (currentIndex === null) {
      return null;
    }
    if (operation.kind === "insert") {
      currentIndex =
        currentIndex >= operation.start ? currentIndex + operation.count : currentIndex;
    } else if (
      currentIndex >= operation.start &&
      currentIndex < operation.start + operation.count
    ) {
      currentIndex = null;
    } else if (currentIndex >= operation.start + operation.count) {
      currentIndex -= operation.count;
    }
  }
  return currentIndex;
}

function buildItemTreeNode(item: WorkbookCompareItem): WorkbookCompareSidebarTreeNode {
  if (item.category !== "cell" || item.detailLines.length <= 1) {
    return {
      details: item.detailLines,
      id: item.id,
      itemId: item.id,
      kind: item.kind,
      label: item.title,
      type: "item",
    };
  }
  return {
    children: item.detailLines.map((line, index) => ({
      details: [line],
      id: `${item.id}:detail:${index}`,
      itemId: item.id,
      kind: line.kind ?? item.kind,
      label: line.label,
      type: "detail",
    })),
    details: [],
    id: item.id,
    itemId: item.id,
    kind: item.kind,
    label: item.title,
    type: "item",
  };
}

function matchesSidebarSearch(item: WorkbookCompareItem, query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");
  const text = [
    item.title,
    item.subtitle,
    item.address,
    item.sheetName,
    ...item.detailLines.flatMap((line) => [line.label, line.before ?? "", line.after ?? ""]),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
  return text.includes(normalizedQuery);
}

function readWorkbookMeta(snapshot: IWorkbookData | null): {
  readonly name: string;
  readonly sheetIds: readonly string[];
  readonly sheets: Record<string, WorkbookSheetMeta>;
} {
  const sheets: Record<string, WorkbookSheetMeta> = {};
  const order: string[] = Array.isArray(snapshot?.sheetOrder) ? [...snapshot.sheetOrder] : [];
  for (const [sheetId, rawSheet] of Object.entries(snapshot?.sheets ?? {})) {
    const sheet = asRecord(rawSheet);
    if (sheet === null) {
      continue;
    }
    sheets[sheetId] = {
      hidden: asBoolean(sheet.hidden),
      name: asString(sheet.name) ?? sheetId,
      order: order.indexOf(sheetId) >= 0 ? order.indexOf(sheetId) : Object.keys(sheets).length,
      sheetId,
      tabColor: asString(sheet.tabColor) ?? "",
      zoomRatio: asNumber(sheet.zoomRatio) ?? 1,
    };
  }
  const ordered = order.filter((sheetId) => sheetId in sheets);
  return {
    name: asString(snapshot?.name) ?? "",
    sheetIds: [...ordered, ...Object.keys(sheets).filter((sheetId) => !ordered.includes(sheetId))],
    sheets,
  };
}

function getWorksheet(
  snapshot: IWorkbookData | null,
  sheetId: string,
): Partial<IWorksheetData> | null {
  return snapshot?.sheets?.[sheetId] ?? null;
}

function getSheetName(snapshot: IWorkbookData | null, sheetId: string): string | null {
  return readWorkbookMeta(snapshot).sheets[sheetId]?.name ?? null;
}

function collectCells(snapshot: IWorkbookData | null, sheetId: string): Map<string, ICellData> {
  const cells = new Map<string, ICellData>();
  const cellData = getWorksheet(snapshot, sheetId)?.cellData ?? {};
  for (const [rowKey, rowValue] of Object.entries(cellData)) {
    const row = Number(rowKey);
    const columns = asRecord(rowValue);
    if (!Number.isInteger(row) || columns === null) {
      continue;
    }
    for (const [columnKey, cellValue] of Object.entries(columns)) {
      const column = Number(columnKey);
      if (Number.isInteger(column) && asRecord(cellValue) !== null) {
        cells.set(`${row}:${column}`, cellValue as ICellData);
      }
    }
  }
  return cells;
}

function displayCellValue(cell: ICellData | null): string | null {
  return stringifyDisplay(cell?.v ?? cell?.p ?? cell?.f);
}

function resolveStyle(snapshot: IWorkbookData | null, style: unknown): IStyleData | null {
  if (typeof style === "string") {
    return (snapshot?.styles?.[style] as IStyleData | undefined) ?? null;
  }
  return asRecord(style) as IStyleData | null;
}

function collectStyleDiffs(
  baseStyle: IStyleData | null,
  currentStyle: IStyleData | null,
): WorkbookCompareDetailLine[] {
  const before = asRecord(baseStyle) ?? {};
  const after = asRecord(currentStyle) ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].sort().flatMap((key) => {
    const beforeText = stringifyDisplay(before[key]);
    const afterText = stringifyDisplay(after[key]);
    if (beforeText === afterText) {
      return [];
    }
    return [
      {
        after: afterText,
        before: beforeText,
        kind: inferDiffKind(beforeText, afterText),
        label: styleLabel(key),
      },
    ];
  });
}

function collectLeafDiffs(
  before: unknown,
  after: unknown,
  prefix = "",
): WorkbookCompareDetailLine[] {
  const beforeRecord = asRecord(before);
  const afterRecord = asRecord(after);
  if (beforeRecord === null && afterRecord === null) {
    const beforeText = stringifyDisplay(before);
    const afterText = stringifyDisplay(after);
    return beforeText === afterText
      ? []
      : [
          {
            after: afterText,
            before: beforeText,
            kind: inferDiffKind(beforeText, afterText),
            label: prefix || "Value",
          },
        ];
  }
  const keys = new Set([...Object.keys(beforeRecord ?? {}), ...Object.keys(afterRecord ?? {})]);
  return [...keys]
    .sort()
    .flatMap((key) =>
      collectLeafDiffs(beforeRecord?.[key], afterRecord?.[key], prefix ? `${prefix}.${key}` : key),
    );
}

function getResource(snapshot: IWorkbookData | null, name: string): unknown {
  const resources = snapshot?.resources;
  if (Array.isArray(resources)) {
    const resource = resources.find((entry) => {
      const record = asRecord(entry);
      return asString(record?.name) === name || asString(record?.id) === name;
    });
    return normalizeResourceData(asRecord(resource)?.data);
  }
  return normalizeResourceData(asRecord(resources)?.[name]);
}

function readSheetScopedEntries(
  resource: unknown,
  knownSheetIds: ReadonlySet<string>,
): Record<string, Record<string, unknown>> {
  const record = asRecord(resource);
  if (record === null) {
    return {};
  }
  const result: Record<string, Record<string, unknown>> = {};
  const visit = (value: unknown): void => {
    const candidate = asRecord(value);
    if (candidate === null) return;
    for (const [key, child] of Object.entries(candidate)) {
      if (knownSheetIds.has(key)) {
        const entries = Array.isArray(child)
          ? Object.fromEntries(child.map((entry, index) => [String(index), entry]))
          : (asRecord(child) ?? {});
        result[key] = { ...(result[key] ?? {}), ...entries };
      } else if (typeof child === "object" && child !== null) {
        visit(child);
      }
    }
  };
  visit(record);
  return result;
}

function normalizeResourceData(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function findFirstRange(value: unknown): IRange | null {
  const ranges = asRecord(value)?.ranges;
  const firstRange = Array.isArray(ranges) ? ranges[0] : null;
  const range = asRange(firstRange) ?? asRange(value);
  if (range !== null) {
    return range;
  }
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  for (const child of Object.values(record)) {
    const childRange = findFirstRange(child);
    if (childRange !== null) {
      return childRange;
    }
  }
  return null;
}

function readResourceLabel(value: unknown, fallback: string): string {
  const record = asRecord(value);
  return asString(record?.name) ?? asString(record?.title) ?? asString(record?.id) ?? fallback;
}

function ensureCell(
  snapshot: IWorkbookData,
  sheetId: string,
  row: number,
  column: number,
): ICellData {
  const sheet = snapshot.sheets[sheetId] as IWorksheetData | undefined;
  if (sheet === undefined) {
    throw new Error(`Cannot highlight missing sheet ${sheetId}`);
  }
  sheet.cellData ??= {};
  sheet.cellData[row] ??= {};
  const rowData = sheet.cellData[row] as Record<number, ICellData>;
  rowData[column] ??= {};
  return rowData[column]!;
}

function getRowData(snapshot: IWorkbookData | null, sheetId: string, row: number | null): unknown {
  return row === null ? null : (getWorksheet(snapshot, sheetId)?.rowData?.[row] ?? null);
}

function getColumnData(
  snapshot: IWorkbookData | null,
  sheetId: string,
  column: number | null,
): unknown {
  return column === null ? null : (getWorksheet(snapshot, sheetId)?.columnData?.[column] ?? null);
}

function asRange(value: unknown): IRange | null {
  const record = asRecord(value);
  const startRow = asNumber(record?.startRow);
  const endRow = asNumber(record?.endRow);
  const startColumn = asNumber(record?.startColumn);
  const endColumn = asNumber(record?.endColumn);
  return startRow === null || endRow === null || startColumn === null || endColumn === null
    ? null
    : { endColumn, endRow, startColumn, startRow };
}

function rangeToTarget(sheetId: string, range: IRange | null): WorkbookCompareRangeTarget | null {
  return range === null ? null : { ...range, sheetId };
}

function inferDiffKind(
  before: string | null,
  after: string | null,
): WorkbookCompareDiffKind | null {
  if (before === after) {
    return null;
  }
  if ((before === null || before === "") && after !== null && after !== "") {
    return "insert";
  }
  if (before !== null && before !== "" && (after === null || after === "")) {
    return "delete";
  }
  return "update";
}

function mergeSheetStatus(
  current: WorkbookCompareSheetTabStatus | undefined,
  next: WorkbookCompareSheetTabStatus,
): WorkbookCompareSheetTabStatus {
  const priority: Record<WorkbookCompareSheetTabStatus, number> = {
    default: 0,
    delete: 3,
    insert: 3,
    update: 2,
  };
  return current === undefined || priority[next] >= priority[current] ? next : current;
}

function collectUnsupportedMutationIds(
  mutations: readonly FlattenedWorkbookCompareMutation[],
): string[] {
  const supported = new Set<string>(Object.values(MUTATION_IDS));
  return [
    ...new Set(
      mutations
        .map((entry) => entry.mutation.mutationId)
        .filter((id) => !supported.has(id) && STRUCTURAL_MUTATION_NAME.test(id)),
    ),
  ].sort();
}

function formatCellAddress(row: number, column: number): string {
  let columnIndex = column + 1;
  let label = "";
  while (columnIndex > 0) {
    const remainder = (columnIndex - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    columnIndex = Math.floor((columnIndex - 1) / 26);
  }
  return `${label}${row + 1}`;
}

function styleLabel(key: string): string {
  const labels: Record<string, string> = {
    bg: "Background",
    bl: "Bold",
    cl: "Text color",
    fs: "Font size",
    it: "Italic",
    n: "Number format",
  };
  return labels[key] ?? key;
}

function toDisplayValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return typeof value === "string" ? value : String(value);
}

function stringifyDisplay(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return typeof value === "object" ? stableStringify(value) : String(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  const record = asRecord(value);
  if (record === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableNormalize(entry)]),
  );
}

function mergeOrderedIds(left: readonly string[], right: readonly string[]): string[] {
  return [...left, ...right.filter((entry) => !left.includes(entry))];
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function comparePositionKeys(left: string, right: string): number {
  const [leftRow, leftColumn] = left.split(":").map(Number) as [number, number];
  const [rightRow, rightColumn] = right.split(":").map(Number) as [number, number];
  return leftRow === rightRow ? leftColumn - rightColumn : leftRow - rightRow;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1;
}
