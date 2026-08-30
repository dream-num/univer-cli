import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitComparisonContext,
  type UnitComparisonContextChange,
  type UnitComparisonContextDetail,
  type UnitComparisonContextDetailLevel,
  type UnitComparisonContextItem,
  type UnitComparisonProductContext,
  type UnitComparisonContextQuery,
  type UnitComparisonSummary,
  type UnitType,
} from "@univer/collab-gateway-contract";
import type { IWorkbookData } from "@univerjs/core";
import {
  buildSymmetricWorkbookCompareChangesets,
  collectUnsupportedStructuralMutationIds,
  type ProtocolWorkbookCompareChangeset,
} from "@univer/workbook-compare/branch-reconcile";
import {
  buildWorkbookCompareAgentReport,
  buildWorkbookCompareModel,
  type WorkbookCompareItem,
} from "@univer/workbook-compare";

export { decodeComparisonUnitData, decodeComparisonWorkbookData } from "./comparison-unit-data.js";

export type UnitStructuralDiffKind = "delete" | "insert" | "update";

export interface UnitStructuralDiffItem {
  readonly id: string;
  readonly stableId: string;
  readonly category: string;
  /** Stable entity kind without the parent ID suffix carried by legacy category values. */
  readonly entityType: string;
  /** Stable parent object ID, for example the Slide page or Base table containing this item. */
  readonly parentStableId?: string;
  /** Machine-readable path from the Unit root to the changed object. */
  readonly path: readonly string[];
  readonly label: string;
  readonly kind: UnitStructuralDiffKind;
  readonly moved: boolean;
  /** Normalized leaf changes shared by native highlights, detail UI, and agent context. */
  readonly changes: readonly UnitComparisonContextChange[];
  /** Side-specific runtime identity when semantic alignment uses a different stable ID. */
  readonly nativeStableIds?: {
    readonly left?: string;
    readonly right?: string;
  };
  readonly position: {
    readonly left: number | null;
    readonly right: number | null;
  };
  /** Projected values used for comparison. Kept opaque so agents can inspect product-specific data. */
  readonly values: {
    readonly left?: unknown;
    readonly right?: unknown;
  };
}

export interface UnitStructuralDiffSummary {
  readonly total: number;
  readonly insert: number;
  readonly delete: number;
  readonly update: number;
  readonly moved: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

/** Serializable, UI-independent projection intended for SDK and agent consumers. */
export interface UnitStructuralDiffModel {
  readonly schemaVersion: 1;
  readonly unitType: UnitType;
  readonly summary: UnitStructuralDiffSummary;
  readonly items: readonly UnitStructuralDiffItem[];
  readonly itemById: Readonly<Record<string, UnitStructuralDiffItem>>;
}

export interface BuildUnitComparisonContextInput {
  readonly comparisonId: string;
  readonly unit: UnitComparisonSummary;
  readonly fidelity: "history" | "snapshot";
  readonly commonBaseRevision?: number;
  readonly stale: boolean;
  readonly leftData?: unknown;
  readonly rightData?: unknown;
  readonly leftChangesets?: readonly ProtocolWorkbookCompareChangeset[];
  readonly rightChangesets?: readonly ProtocolWorkbookCompareChangeset[];
  readonly query?: UnitComparisonContextQuery;
}

export interface PreparedUnitComparisonContext {
  readonly schemaVersion: 1;
  readonly comparisonId: string;
  readonly unit: UnitComparisonSummary;
  readonly fidelity: "history" | "snapshot";
  readonly commonBaseRevision?: number;
  readonly stale: boolean;
  readonly summary: UnitComparisonContext["summary"];
  readonly coverage: UnitComparisonContext["coverage"];
  readonly items: readonly UnitComparisonContextItem[];
  readonly diagnostics: UnitComparisonContext["diagnostics"];
  readonly productContext: PreparedProductContext;
}

type PreparedProductContext =
  | Extract<UnitComparisonProductContext, { readonly kind: "sheet" }>
  | {
      readonly kind: "doc";
      readonly paragraphAlignment: readonly {
        readonly id: string;
        readonly stableId: string;
        readonly kind: "delete" | "equal" | "insert" | "update";
        readonly moved: boolean;
        readonly leftIndex: number | null;
        readonly rightIndex: number | null;
      }[];
    }
  | Extract<UnitComparisonProductContext, { readonly kind: "slide" | "base" | "board" }>;

export const UNIT_COMPARISON_ENTITY_TYPES: Readonly<Record<UnitType, readonly string[]>> = {
  [UNIT_TYPE_DOC]: [
    "paragraph",
    "text-style",
    "section",
    "block-range",
    "custom-range",
    "table-range",
    "custom-block",
    "column-group",
    "table",
    "drawing",
    "header",
    "footer",
    "document-style",
    "document-setting",
    "custom-decoration",
    "doc-hyperlink",
    "doc-callout",
    "doc-chart",
    "doc-chart-data",
    "doc-code",
    "doc-latex",
    "doc-shape-resource",
    "doc-table-resource",
  ],
  [UNIT_TYPE_SHEET]: [
    "workbook",
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
  ],
  [UNIT_TYPE_SLIDE]: [
    "slide",
    "slide-element",
    "slide-transition",
    "slide-transition-ref",
    "slide-master",
    "slide-layout",
    "slide-theme",
    "slide-chart",
    "slide-chart-data",
    "slide-table",
  ],
  [UNIT_TYPE_BASE]: ["base", "table", "field", "record", "view", "cell"],
  [UNIT_TYPE_BOARD]: [
    "board-page",
    "board-element",
    "board-theme",
    "board-chart",
    "board-chart-data",
    "board-table",
  ],
};

export interface UnitDiffPageOption {
  readonly id: string;
  readonly label: string;
  readonly status: UnitStructuralDiffKind;
}

export type DocumentComparisonRowKind = "delete" | "equal" | "insert" | "update";

export interface DocumentComparisonParagraph {
  /** Comparison identity. Nested paragraphs use a stable table/column slot. */
  readonly stableId: string;
  /** Native paragraph identity used to address the rendered Doc side. */
  readonly paragraphId: string;
  /** Stable containing table/column-group slot, when the paragraph is nested. */
  readonly structureId?: string;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly value: unknown;
}

/**
 * One visual row in a stable-ID Doc comparison. Missing sides are intentional placeholders.
 * A moved paragraph is represented by a delete row and an insert row with the same stable ID.
 */
export interface DocumentComparisonRow {
  readonly id: string;
  readonly stableId: string;
  readonly kind: DocumentComparisonRowKind;
  readonly moved: boolean;
  readonly left: DocumentComparisonParagraph | null;
  readonly right: DocumentComparisonParagraph | null;
}

/** Serializable paragraph alignment shared by the UI, SDK, and future agent entry points. */
export interface DocumentComparisonModel {
  readonly schemaVersion: 1;
  readonly rows: readonly DocumentComparisonRow[];
}

export function buildDocumentComparisonModel(input: {
  readonly left: unknown;
  readonly right: unknown;
}): DocumentComparisonModel {
  const leftBody = asRecord(asRecord(input.left)?.body);
  const rightBody = asRecord(asRecord(input.right)?.body);
  const left = documentParagraphs(leftBody);
  const right = documentParagraphs(rightBody);
  const leftIds = new Set(left.map((paragraph) => paragraph.stableId));
  const rightIds = new Set(right.map((paragraph) => paragraph.stableId));
  const rows = alignSequences(left, right, (paragraph) => paragraph.stableId).map(
    ({ left: before, right: after }, index): DocumentComparisonRow => {
      const stableId = before?.stableId ?? after?.stableId ?? `paragraph-${index}`;
      const moved =
        (before === null && leftIds.has(stableId)) || (after === null && rightIds.has(stableId));
      const kind =
        before === null
          ? "insert"
          : after === null
            ? "delete"
            : stableJson(before.value) === stableJson(after.value)
              ? "equal"
              : "update";
      return {
        id: `${stableId}:${kind}:${index}`,
        stableId,
        kind,
        moved,
        left: before,
        right: after,
      };
    },
  );
  return { schemaVersion: 1, rows };
}

export function buildUnitStructuralDiff(input: {
  readonly type: UnitType;
  readonly left: unknown;
  readonly right: unknown;
}): UnitStructuralDiffItem[] {
  if (input.type === UNIT_TYPE_DOC) return diffDocument(input.left, input.right);
  if (input.type === UNIT_TYPE_SLIDE) return diffSlides(input.left, input.right);
  if (input.type === UNIT_TYPE_BASE) return diffBase(input.left, input.right);
  if (input.type === UNIT_TYPE_BOARD) return diffBoard(input.left, input.right);
  return [];
}

export function buildUnitStructuralDiffModel(input: {
  readonly type: UnitType;
  readonly left: unknown;
  readonly right: unknown;
}): UnitStructuralDiffModel {
  const items = buildUnitStructuralDiff(input);
  const byCategory: Record<string, number> = {};
  const summary = items.reduce(
    (counts, item) => {
      counts[item.kind] += 1;
      if (item.moved) counts.moved += 1;
      byCategory[item.entityType] = (byCategory[item.entityType] ?? 0) + 1;
      return counts;
    },
    { delete: 0, insert: 0, moved: 0, update: 0 },
  );
  return {
    schemaVersion: 1,
    unitType: input.type,
    summary: { ...summary, byCategory, total: items.length },
    items,
    itemById: Object.fromEntries(items.map((item) => [item.id, item])),
  };
}

export function buildChangedSlidePages(input: {
  readonly left: unknown;
  readonly right: unknown;
  readonly items: readonly UnitStructuralDiffItem[];
}): UnitDiffPageOption[] {
  const leftRecord = asRecord(input.left);
  const rightRecord = asRecord(input.right);
  const leftPages = asRecord(leftRecord?.slides) ?? {};
  const rightPages = asRecord(rightRecord?.slides) ?? {};
  const leftOrder = orderedRecordIds(leftPages, leftRecord?.slideOrder);
  const rightOrder = orderedRecordIds(rightPages, rightRecord?.slideOrder);
  const orderedPageIds = alignStableOrder(leftOrder, rightOrder);
  const changedPageIds = new Set(
    input.items.flatMap((item) => {
      if (item.category === "slide") return [item.stableId];
      return item.category.startsWith("slide-element:")
        ? [item.category.slice("slide-element:".length)]
        : [];
    }),
  );
  return orderedPageIds.flatMap((pageId, index) => {
    if (!changedPageIds.has(pageId)) return [];
    const leftPage = asRecord(leftPages[pageId]);
    const rightPage = asRecord(rightPages[pageId]);
    const status =
      leftPage === undefined ? "insert" : rightPage === undefined ? "delete" : "update";
    return [
      {
        id: pageId,
        label: pageDisplayName(rightPage) ?? pageDisplayName(leftPage) ?? `Slide ${index + 1}`,
        status,
      },
    ];
  });
}

/** Build one versioned, product-neutral context for SDK and agent consumers. */
export function buildUnitComparisonContext(
  input: BuildUnitComparisonContextInput,
): UnitComparisonContext {
  return queryPreparedUnitComparisonContext(prepareUnitComparisonContext(input), input.query);
}

/** Perform the expensive product diff once so a pinned comparison can serve many cheap queries. */
export function prepareUnitComparisonContext(
  input: Omit<BuildUnitComparisonContextInput, "query">,
): PreparedUnitComparisonContext {
  const notes: string[] = [];
  let unsupportedMutationIds: readonly string[] = [];
  let readiness: "ready" | "degraded" = "ready";
  let productContext: PreparedProductContext = emptyProductContext(input.unit.type);
  let items: UnitComparisonContextItem[];

  if (input.leftData === undefined || input.rightData === undefined) {
    items = [buildUnitPresenceContextItem(input)];
    readiness = "degraded";
    notes.push("One comparison side does not contain this Unit; reporting a Unit-level gap.");
  } else if (input.unit.type === UNIT_TYPE_SHEET) {
    const comparisonHistory = {
      fidelity: input.fidelity,
      leftChangesets: input.leftChangesets ?? [],
      rightChangesets: input.rightChangesets ?? [],
    } as const;
    const model = buildWorkbookCompareModel({
      baseSnapshot: input.leftData as IWorkbookData,
      targetSnapshot: input.rightData as IWorkbookData,
      orderedChangesetStream: buildSymmetricWorkbookCompareChangesets(comparisonHistory),
    });
    const report = buildWorkbookCompareAgentReport(model);
    items = report.items.map(mapWorkbookContextItem);
    readiness = report.readiness;
    unsupportedMutationIds = [
      ...new Set([
        ...report.unsupportedMutationIds,
        ...collectUnsupportedStructuralMutationIds(comparisonHistory),
      ]),
    ].sort();
    if (unsupportedMutationIds.length > 0) readiness = "degraded";
    productContext = {
      kind: "sheet",
      sheets: report.sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        status: sheet.status === "default" ? "unchanged" : sheet.status,
        changeCount: sheet.itemIds.length,
      })),
    };
    if (unsupportedMutationIds.length > 0) {
      notes.push("Some Sheet mutations were not recognized as structural coordinate hints.");
    } else if (report.readiness === "degraded") {
      notes.push(
        "Sheet snapshot axis alignment was ambiguous; row and column coordinates are best effort.",
      );
    }
  } else {
    const model = buildUnitStructuralDiffModel({
      type: input.unit.type,
      left: input.leftData,
      right: input.rightData,
    });
    items = model.items.map(mapStructuralContextItem);
    if (input.unit.type === UNIT_TYPE_BASE) {
      items = [
        ...items.filter((item) => !isValuesOnlyBaseRecordUpdate(item)),
        ...buildBaseCellContextItems(input.leftData, input.rightData),
      ];
      productContext = { kind: "base", visualProjection: "raw-table-data" };
    } else if (input.unit.type === UNIT_TYPE_DOC) {
      const alignment = buildDocumentComparisonModel({
        left: input.leftData,
        right: input.rightData,
      });
      productContext = {
        kind: "doc",
        paragraphAlignment: alignment.rows.map((row) => ({
          id: row.id,
          stableId: row.stableId,
          kind: row.kind,
          moved: row.moved,
          leftIndex: row.left?.index ?? null,
          rightIndex: row.right?.index ?? null,
        })),
      };
    }
  }

  const summary = summarizeContextItems(items);
  return {
    schemaVersion: 1,
    comparisonId: input.comparisonId,
    unit: input.unit,
    fidelity: input.fidelity,
    ...(input.commonBaseRevision === undefined
      ? {}
      : { commonBaseRevision: input.commonBaseRevision }),
    stale: input.stale,
    summary,
    coverage: { supportedEntityTypes: UNIT_COMPARISON_ENTITY_TYPES[input.unit.type] },
    items,
    diagnostics: { readiness, unsupportedMutationIds, notes },
    productContext,
  };
}

/** Filter and page a prepared pinned comparison without repeating snapshot materialization/diffing. */
export function queryPreparedUnitComparisonContext(
  prepared: PreparedUnitComparisonContext,
  query: UnitComparisonContextQuery = {},
): UnitComparisonContext {
  const filtered = filterContextItems(prepared.items, query);
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = Math.min(500, Math.max(1, Math.floor(query.limit ?? 100)));
  const detail = resolveContextDetailLevel(query);
  const selectedItems = filtered.slice(offset, offset + limit);
  const pageItems = selectedItems.map((item) => projectContextItemDetail(item, detail));

  return {
    schemaVersion: prepared.schemaVersion,
    comparisonId: prepared.comparisonId,
    unit: prepared.unit,
    fidelity: prepared.fidelity,
    ...(prepared.commonBaseRevision === undefined
      ? {}
      : { commonBaseRevision: prepared.commonBaseRevision }),
    stale: prepared.stale,
    detail,
    summary: prepared.summary,
    coverage: prepared.coverage,
    page: {
      offset,
      limit,
      matched: filtered.length,
      hasMore: offset + pageItems.length < filtered.length,
    },
    items: pageItems,
    diagnostics: prepared.diagnostics,
    productContext: pageProductContext(prepared.productContext, selectedItems),
  };
}

function emptyProductContext(type: UnitType): PreparedProductContext {
  if (type === UNIT_TYPE_SHEET) return { kind: "sheet", sheets: [] };
  if (type === UNIT_TYPE_DOC) return { kind: "doc", paragraphAlignment: [] };
  if (type === UNIT_TYPE_SLIDE) return { kind: "slide" };
  if (type === UNIT_TYPE_BASE) return { kind: "base", visualProjection: "raw-table-data" };
  return { kind: "board" };
}

function pageProductContext(
  context: PreparedProductContext,
  items: readonly UnitComparisonContextItem[],
): UnitComparisonProductContext {
  if (context.kind !== "doc") return context;
  const paragraphIds = new Set(
    items
      .filter((item) => item.entityType === "paragraph" || item.entityType === "text-style")
      .map((item) => item.stableId),
  );
  return {
    kind: "doc",
    paragraphAlignment: {
      total: context.paragraphAlignment.length,
      rows: context.paragraphAlignment.filter((row) => paragraphIds.has(row.stableId)),
    },
  };
}

function buildUnitPresenceContextItem(
  input: BuildUnitComparisonContextInput,
): UnitComparisonContextItem {
  const leftPresent = input.leftData !== undefined;
  const kind = leftPresent ? "delete" : "insert";
  const path = ["unit", input.unit.unitId];
  const location = {
    path,
    stableId: input.unit.unitId,
    target: { unitId: input.unit.unitId },
  };
  return {
    id: `unit:${kind}:${input.unit.unitId}`,
    stableId: input.unit.unitId,
    kind,
    entityType: "unit",
    path,
    title: input.unit.name,
    moved: false,
    changes: [
      {
        path: [],
        kind,
        valueType: "object",
        ...(input.leftData === undefined ? {} : { before: input.leftData }),
        ...(input.rightData === undefined ? {} : { after: input.rightData }),
      },
    ],
    details: [],
    locations: { left: leftPresent ? location : null, right: leftPresent ? null : location },
    values: {
      ...(input.leftData === undefined ? {} : { left: input.leftData }),
      ...(input.rightData === undefined ? {} : { right: input.rightData }),
    },
  };
}

function mapWorkbookContextItem(item: WorkbookCompareItem): UnitComparisonContextItem {
  const stableId = workbookContextStableId(item);
  const parentStableId = item.sheetId;
  const sheetPath = parentStableId === undefined ? [] : ["sheet", parentStableId];
  const path = [...sheetPath, item.category, stableId];
  const location = (side: "base" | "current"): UnitComparisonContextItem["locations"]["left"] => {
    const target = item.selection?.[side] ?? null;
    if (target === null && item.sheetId === undefined) {
      return { path, stableId };
    }
    if (target === null) return null;
    const locationStableId = workbookTargetStableId(item, target);
    const locationPath = [...sheetPath, item.category, locationStableId];
    return {
      path: locationPath,
      stableId: locationStableId,
      ...(parentStableId === undefined ? {} : { parentStableId }),
      target,
    };
  };
  return {
    id: `sheet:${parentStableId ?? "workbook"}:${item.category}:${stableId}:${item.kind}`,
    stableId,
    ...(parentStableId === undefined ? {} : { parentStableId }),
    kind: item.kind,
    entityType: item.category,
    path,
    title: item.title,
    moved: item.category === "move",
    changes: buildWorkbookItemSemanticChanges(item),
    details: item.detailLines,
    locations: { left: location("base"), right: location("current") },
  };
}

function mapStructuralContextItem(item: UnitStructuralDiffItem): UnitComparisonContextItem {
  const location = (side: "left" | "right"): UnitComparisonContextItem["locations"]["left"] => {
    if (!(side in item.values)) return null;
    const locationStableId = item.nativeStableIds?.[side] ?? item.stableId;
    const locationPath =
      locationStableId === item.stableId
        ? item.path
        : [...item.path.slice(0, -1), locationStableId];
    return {
      path: locationPath,
      stableId: locationStableId,
      ...(item.parentStableId === undefined ? {} : { parentStableId: item.parentStableId }),
      position: item.position[side],
      target: {
        category: item.category,
        stableId: locationStableId,
        comparisonStableId: item.stableId,
        ...(item.parentStableId === undefined ? {} : { parentStableId: item.parentStableId }),
      },
    };
  };
  return {
    id: item.id,
    stableId: item.stableId,
    ...(item.parentStableId === undefined ? {} : { parentStableId: item.parentStableId }),
    kind: item.kind,
    entityType: item.entityType,
    path: item.path,
    title: structuralContextTitle(item),
    moved: item.moved,
    changes: item.changes,
    details: [],
    locations: { left: location("left"), right: location("right") },
    values: item.values,
  };
}

function structuralContextTitle(item: UnitStructuralDiffItem): string {
  if (item.label !== item.stableId) return item.label;
  const entity = item.entityType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `${entity} ${(item.position.right ?? item.position.left ?? 0) + 1}`;
}

function buildBaseCellContextItems(left: unknown, right: unknown): UnitComparisonContextItem[] {
  const leftTables = asRecord(asRecord(left)?.tables) ?? {};
  const rightTables = asRecord(asRecord(right)?.tables) ?? {};
  const tableIds = Object.keys(leftTables)
    .filter((tableId) => tableId in rightTables)
    .sort();
  return tableIds.flatMap((tableId) => {
    const leftTable = asRecord(leftTables[tableId]);
    const rightTable = asRecord(rightTables[tableId]);
    const leftFields = asRecord(leftTable?.fields) ?? {};
    const rightFields = asRecord(rightTable?.fields) ?? {};
    const leftRecords = asRecord(leftTable?.records) ?? {};
    const rightRecords = asRecord(rightTable?.records) ?? {};
    const fieldIds = Object.keys(leftFields)
      .filter((fieldId) => fieldId in rightFields)
      .sort();
    const recordIds = Object.keys(leftRecords)
      .filter((recordId) => recordId in rightRecords)
      .sort();
    return recordIds.flatMap((recordId) =>
      fieldIds.flatMap((fieldId) => {
        const leftRecord = asRecord(leftRecords[recordId]);
        const rightRecord = asRecord(rightRecords[recordId]);
        const leftValues = asRecord(leftRecord?.values);
        const rightValues = asRecord(rightRecord?.values);
        const leftValue = leftValues?.[fieldId];
        const rightValue = rightValues?.[fieldId];
        if (stableJson(leftValue) === stableJson(rightValue)) return [];
        const path = ["cell", tableId, recordId, fieldId];
        const leftField = asRecord(leftFields[fieldId]);
        const rightField = asRecord(rightFields[fieldId]);
        const label =
          (typeof rightField?.name === "string" ? rightField.name : undefined) ??
          (typeof leftField?.name === "string" ? leftField.name : undefined) ??
          fieldId;
        const primaryFieldId =
          (typeof rightTable?.primaryFieldId === "string"
            ? rightTable.primaryFieldId
            : undefined) ??
          (typeof leftTable?.primaryFieldId === "string" ? leftTable.primaryFieldId : undefined) ??
          fieldIds[0];
        const recordPosition = recordIds.indexOf(recordId) + 1;
        const recordLabel =
          (primaryFieldId === undefined
            ? undefined
            : entityContentLabel(rightValues?.[primaryFieldId] ?? leftValues?.[primaryFieldId])) ??
          entityContentLabel(rightRecord ?? leftRecord) ??
          `Record ${recordPosition}`;
        const target = { tableId, recordId, fieldId };
        const details: UnitComparisonContextDetail[] = [
          {
            label: "Value",
            before: formatContextValue(leftValue),
            after: formatContextValue(rightValue),
            kind: "update",
          },
        ];
        return [
          {
            id: `cell:${tableId}:${recordId}:${fieldId}`,
            stableId: `${recordId}:${fieldId}`,
            parentStableId: tableId,
            kind: "update" as const,
            entityType: "cell",
            path,
            title: `${recordLabel} · ${label}`,
            moved: false,
            changes: buildSemanticChanges(leftValue, rightValue, "update"),
            details,
            locations: {
              left: { path, stableId: fieldId, parentStableId: recordId, target },
              right: { path, stableId: fieldId, parentStableId: recordId, target },
            },
            values: { left: leftValue, right: rightValue },
          },
        ];
      }),
    );
  });
}

function workbookContextStableId(item: WorkbookCompareItem): string {
  if (item.category === "workbook") return item.sheetId ?? "workbook";
  if (item.category === "worksheet") return item.sheetId ?? "workbook";
  if (item.category === "cell" && item.address !== undefined) return item.address;
  const target = item.selection?.current ?? item.selection?.base ?? null;
  if (target !== null) return workbookTargetStableId(item, target);
  return `${item.category}-${shortStableHash(item.id)}`;
}

function workbookTargetStableId(
  item: WorkbookCompareItem,
  target: NonNullable<WorkbookCompareItem["selection"]>["base"] & object,
): string {
  const record = target as unknown as Record<string, unknown>;
  const startRow = typeof record.startRow === "number" ? record.startRow : null;
  const endRow = typeof record.endRow === "number" ? record.endRow : startRow;
  const startColumn = typeof record.startColumn === "number" ? record.startColumn : null;
  const endColumn = typeof record.endColumn === "number" ? record.endColumn : startColumn;
  if (startRow === null || startColumn === null)
    return `${item.category}-${shortStableHash(item.id)}`;
  const start = formatSheetAddress(startRow, startColumn);
  const end = formatSheetAddress(endRow ?? startRow, endColumn ?? startColumn);
  return start === end ? start : `${start}:${end}`;
}

function formatSheetAddress(row: number, column: number): string {
  let current = Math.max(0, Math.floor(column));
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (current % 26)) + letters;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return `${letters}${Math.max(0, Math.floor(row)) + 1}`;
}

function shortStableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function isValuesOnlyBaseRecordUpdate(item: UnitComparisonContextItem): boolean {
  if (item.entityType !== "record" || item.kind !== "update") return false;
  const left = asRecord(item.values?.left);
  const right = asRecord(item.values?.right);
  if (left === undefined || right === undefined) return false;
  return (
    stableJson(withoutRecordValueFields(left)) === stableJson(withoutRecordValueFields(right)) &&
    stableJson(left.values) !== stableJson(right.values)
  );
}

function withoutRecordValueFields(value: Record<string, unknown>): unknown {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !["values", "orderKey", "createdAt", "updatedAt"].includes(key),
    ),
  );
}

function summarizeContextItems(items: readonly UnitComparisonContextItem[]) {
  const byEntityType: Record<string, number> = {};
  const summary = { total: items.length, insert: 0, delete: 0, update: 0, moved: 0 };
  for (const item of items) {
    summary[item.kind] += 1;
    if (item.moved) summary.moved += 1;
    byEntityType[item.entityType] = (byEntityType[item.entityType] ?? 0) + 1;
  }
  return { ...summary, byEntityType };
}

function filterContextItems(
  items: readonly UnitComparisonContextItem[],
  query: UnitComparisonContextQuery | undefined,
): UnitComparisonContextItem[] {
  const kinds = query?.kinds === undefined ? null : new Set(query.kinds);
  const entityTypes =
    query?.entityTypes === undefined
      ? null
      : new Set(query.entityTypes.map((value) => value.trim()));
  const search = query?.search?.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (kinds !== null && !kinds.has(item.kind)) return false;
    if (entityTypes !== null && !entityTypes.has(item.entityType)) return false;
    if (
      query?.parentStableId !== undefined &&
      item.parentStableId !== query.parentStableId &&
      item.locations.left?.parentStableId !== query.parentStableId &&
      item.locations.right?.parentStableId !== query.parentStableId
    ) {
      return false;
    }
    if (search === undefined || search.length === 0) return true;
    return [
      item.id,
      item.title,
      ...item.path,
      ...item.changes.flatMap((change) => [
        ...change.path,
        formatContextValue(change.before),
        formatContextValue(change.after),
      ]),
      ...item.details.flatMap((detail) => [detail.label, detail.before, detail.after]),
    ]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLocaleLowerCase().includes(search));
  });
}

function resolveContextDetailLevel(
  query: UnitComparisonContextQuery,
): UnitComparisonContextDetailLevel {
  if (query.detail !== undefined) return query.detail;
  return query.includeValues === false ? "summary" : "full";
}

function projectContextItemDetail(
  item: UnitComparisonContextItem,
  detail: UnitComparisonContextDetailLevel,
): UnitComparisonContextItem {
  if (detail === "full") return item;
  const { values: _values, ...rest } = item;
  return {
    ...rest,
    title: detail === "summary" ? contextOrdinalTitle(item) : item.title,
    changes:
      detail === "changes"
        ? item.changes
        : item.changes.map(
            ({ before: _before, after: _after, segments: _segments, ...change }) => change,
          ),
    details:
      detail === "changes"
        ? item.details
        : item.details.map(({ before: _before, after: _after, ...line }) => line),
  };
}

function contextOrdinalTitle(item: UnitComparisonContextItem): string {
  const entity = item.entityType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const position = item.locations.right?.position ?? item.locations.left?.position;
  return position === undefined || position === null ? entity : `${entity} ${position + 1}`;
}

function formatContextValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = stableJson(value);
  return text.length <= 240 ? text : `${text.slice(0, 237)}...`;
}

const GEOMETRY_KEYS = new Set([
  "angle",
  "height",
  "left",
  "rotation",
  "top",
  "transform",
  "width",
  "x",
  "y",
]);
const POSITION_KEYS = new Set(["index", "order", "orderKey", "position", "zIndex"]);
const STYLE_KEYS = new Set([
  "background",
  "backgroundColor",
  "bold",
  "border",
  "fill",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "italic",
  "lineHeight",
  "opacity",
  "shadow",
  "stroke",
  "style",
  "textColor",
  "underline",
]);
const REFERENCE_KEYS = new Set([
  "dataSourceId",
  "endId",
  "layoutId",
  "masterId",
  "parentId",
  "refId",
  "sourceId",
  "startId",
  "targetId",
]);
const SHEET_DETAIL_PATHS: Readonly<Record<string, readonly string[]>> = {
  background: ["style", "background"],
  bold: ["style", "bold"],
  count: ["count"],
  formula: ["formula"],
  "font size": ["style", "fontSize"],
  italic: ["style", "italic"],
  name: ["name"],
  "number format": ["style", "numberFormat"],
  position: ["position"],
  start: ["start"],
  "text color": ["style", "textColor"],
  value: ["value"],
};
const MAX_INLINE_DIFF_TOKENS = 800;

/**
 * Compare two product projections as a compact list of stable property paths. Objects are walked
 * recursively, while arrays remain one value so insertion at index zero does not create a cascade
 * of misleading positional changes. Text and formulas receive bounded inline hunks.
 */
export function buildSemanticChanges(
  before: unknown,
  after: unknown,
  kind: UnitStructuralDiffKind = "update",
): UnitComparisonContextChange[] {
  if (kind !== "update") {
    return [
      {
        path: [],
        kind,
        valueType: inferComparisonValueType([], kind === "delete" ? before : after),
        ...(kind === "delete" ? { before } : { after }),
      },
    ];
  }
  const changes: UnitComparisonContextChange[] = [];
  collectSemanticChanges(before, after, [], changes);
  return normalizeSemanticChanges(changes);
}

function collectSemanticChanges(
  before: unknown,
  after: unknown,
  path: readonly string[],
  output: UnitComparisonContextChange[],
): void {
  if (stableJson(before) === stableJson(after)) return;
  const beforeRecord = asRecord(before);
  const afterRecord = asRecord(after);
  if (beforeRecord !== undefined && afterRecord !== undefined) {
    const keys = [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])].sort();
    for (const key of keys) {
      const beforeHasKey = Object.prototype.hasOwnProperty.call(beforeRecord, key);
      const afterHasKey = Object.prototype.hasOwnProperty.call(afterRecord, key);
      if (!beforeHasKey || !afterHasKey) {
        const rawPath = [...path, key];
        const semanticPath = semanticPropertyPath(rawPath);
        output.push({
          path: semanticPath,
          kind: beforeHasKey ? "delete" : "insert",
          valueType: inferComparisonValueType(
            semanticPath,
            beforeHasKey ? beforeRecord[key] : afterRecord[key],
          ),
          ...(beforeHasKey ? { before: beforeRecord[key] } : { after: afterRecord[key] }),
        });
        continue;
      }
      collectSemanticChanges(beforeRecord[key], afterRecord[key], [...path, key], output);
    }
    return;
  }

  const semanticPath = semanticPropertyPath(path);
  const valueType = inferComparisonValueType(semanticPath, after === undefined ? before : after);
  output.push({
    path: semanticPath,
    kind: "update",
    valueType,
    before,
    after,
    ...buildInlineSegments(before, after, valueType),
  });
}

function semanticPropertyPath(path: readonly string[]): readonly string[] {
  const first = path[0];
  if (first === undefined) return path;
  if (path.at(-1) === "dataStream" && path.some((part) => part === "body")) return ["text"];
  if (first === "values" && path.length === 2) return ["field", path[1]!];
  const geometryIndex = path.findIndex((part) => GEOMETRY_KEYS.has(part));
  if (geometryIndex >= 0) {
    const geometryKey = path[geometryIndex]!;
    return geometryKey === "transform"
      ? ["geometry", ...path.slice(geometryIndex + 1)]
      : ["geometry", geometryKey, ...path.slice(geometryIndex + 1)];
  }
  const styleIndex = path.findIndex((part) => STYLE_KEYS.has(part));
  if (styleIndex >= 0) {
    const styleKey = path[styleIndex]!;
    return styleKey === "style"
      ? ["style", ...path.slice(styleIndex + 1)]
      : ["style", styleKey, ...path.slice(styleIndex + 1)];
  }
  return path;
}

function normalizeSemanticChanges(
  changes: readonly UnitComparisonContextChange[],
): UnitComparisonContextChange[] {
  const seen = new Set<string>();
  return changes
    .filter((change) => {
      const key = stableJson([
        change.path,
        change.kind,
        comparisonChangeIdentityValue(change.before, change.valueType),
        comparisonChangeIdentityValue(change.after, change.valueType),
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const priority = comparisonChangePriority(left) - comparisonChangePriority(right);
      return priority !== 0
        ? priority
        : stableJson(left.path).localeCompare(stableJson(right.path));
    });
}

function comparisonChangeIdentityValue(
  value: unknown,
  valueType: UnitComparisonContextChange["valueType"],
): unknown {
  return valueType === "text" && typeof value === "string"
    ? value.replace(/[\r\n\0]+$/gu, "")
    : value;
}

function comparisonChangePriority(change: UnitComparisonContextChange): number {
  const key = change.path.at(-1)?.toLocaleLowerCase() ?? "";
  if (["createdat", "createdby", "updatedat", "updatedby"].includes(key)) return 9;
  if (change.path[0] === "text" || change.path[0] === "formula") return 0;
  if (change.path[0] === "field") return 1;
  if (change.valueType === "text" || change.valueType === "formula") return 2;
  if (["boolean", "color", "number", "style"].includes(change.valueType)) return 3;
  if (change.valueType === "geometry" || change.valueType === "position") return 4;
  if (change.valueType === "reference") return 5;
  return 6;
}

function inferComparisonValueType(
  path: readonly string[],
  value: unknown,
): UnitComparisonContextChange["valueType"] {
  const key = path.at(-1)?.toLocaleLowerCase() ?? "";
  if (key.includes("formula") || key === "f") return "formula";
  if (path.some((part) => part === "geometry" || GEOMETRY_KEYS.has(part))) return "geometry";
  if (path.some((part) => part === "position" || POSITION_KEYS.has(part))) return "position";
  if (
    path.some(
      (part) =>
        part.toLocaleLowerCase().includes("color") ||
        ["background", "fill", "stroke"].includes(part),
    )
  ) {
    return "color";
  }
  if (path.some((part) => part === "style" || STYLE_KEYS.has(part))) return "style";
  if (path.some((part) => REFERENCE_KEYS.has(part) || /(?:Id|Ref)$/u.test(part))) {
    return "reference";
  }
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "text";
  if (asRecord(value) !== undefined) return "object";
  return "unknown";
}

function buildInlineSegments(
  before: unknown,
  after: unknown,
  valueType: UnitComparisonContextChange["valueType"],
): Pick<UnitComparisonContextChange, "segments"> | Record<string, never> {
  if (
    typeof before !== "string" ||
    typeof after !== "string" ||
    (valueType !== "text" && valueType !== "formula")
  ) {
    return {};
  }
  const leftTokens = tokenizeInlineValue(before, valueType);
  const rightTokens = tokenizeInlineValue(after, valueType);
  if (leftTokens.length + rightTokens.length > MAX_INLINE_DIFF_TOKENS) return {};
  return { segments: buildInlineDiff(leftTokens, rightTokens) };
}

function tokenizeInlineValue(
  value: string,
  valueType: UnitComparisonContextChange["valueType"],
): string[] {
  if (valueType === "text") return Array.from(value);
  return (
    value.match(
      /(\r?\n|\s+|\$?[A-Za-z]+\$?\d+|[A-Za-z_]+[A-Za-z0-9_]*|[0-9]+(?:\.\d+)?|[\u3400-\u9fff]|.)/gu,
    ) ?? []
  );
}

function buildInlineDiff(
  leftTokens: readonly string[],
  rightTokens: readonly string[],
): NonNullable<UnitComparisonContextChange["segments"]> {
  const rows = Array.from(
    { length: leftTokens.length + 1 },
    () => new Uint16Array(rightTokens.length + 1),
  );
  for (let leftIndex = 1; leftIndex <= leftTokens.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= rightTokens.length; rightIndex += 1) {
      rows[leftIndex]![rightIndex] =
        leftTokens[leftIndex - 1] === rightTokens[rightIndex - 1]
          ? rows[leftIndex - 1]![rightIndex - 1]! + 1
          : Math.max(rows[leftIndex - 1]![rightIndex]!, rows[leftIndex]![rightIndex - 1]!);
    }
  }
  const operations: Array<{ readonly kind: "delete" | "equal" | "insert"; readonly text: string }> =
    [];
  let leftIndex = leftTokens.length;
  let rightIndex = rightTokens.length;
  while (leftIndex > 0 || rightIndex > 0) {
    if (
      leftIndex > 0 &&
      rightIndex > 0 &&
      leftTokens[leftIndex - 1] === rightTokens[rightIndex - 1]
    ) {
      operations.push({ kind: "equal", text: leftTokens[leftIndex - 1]! });
      leftIndex -= 1;
      rightIndex -= 1;
    } else if (
      leftIndex > 0 &&
      shouldDeleteInlineToken(rows, leftTokens, rightTokens, leftIndex, rightIndex)
    ) {
      operations.push({ kind: "delete", text: leftTokens[leftIndex - 1]! });
      leftIndex -= 1;
    } else {
      operations.push({ kind: "insert", text: rightTokens[rightIndex - 1]! });
      rightIndex -= 1;
    }
  }
  const left: Array<{ kind: "delete" | "equal" | "insert"; text: string }> = [];
  const right: Array<{ kind: "delete" | "equal" | "insert"; text: string }> = [];
  for (const operation of operations.reverse()) {
    if (operation.kind !== "insert") pushInlineSegment(left, operation.kind, operation.text);
    if (operation.kind !== "delete") pushInlineSegment(right, operation.kind, operation.text);
  }
  return { left, right };
}

/** Pick the same LCS anchor after swapping sides by breaking equal-score ties on token order. */
function shouldDeleteInlineToken(
  rows: readonly Uint16Array[],
  leftTokens: readonly string[],
  rightTokens: readonly string[],
  leftIndex: number,
  rightIndex: number,
): boolean {
  if (rightIndex === 0) return true;
  const deleteScore = rows[leftIndex - 1]![rightIndex]!;
  const insertScore = rows[leftIndex]![rightIndex - 1]!;
  if (deleteScore !== insertScore) return deleteScore > insertScore;
  return leftTokens[leftIndex - 1]! < rightTokens[rightIndex - 1]!;
}

function pushInlineSegment(
  segments: Array<{ kind: "delete" | "equal" | "insert"; text: string }>,
  kind: "delete" | "equal" | "insert",
  text: string,
): void {
  const previous = segments.at(-1);
  if (previous?.kind === kind) previous.text += text;
  else segments.push({ kind, text });
}

/** Build the same normalized Sheet leaf changes used by the Agent context and Compare UI. */
export function buildWorkbookItemSemanticChanges(
  item: WorkbookCompareItem,
): UnitComparisonContextChange[] {
  const changes = item.detailLines.map((detail) => {
    const label = detail.label.toLocaleLowerCase();
    const path = SHEET_DETAIL_PATHS[label] ?? [toSemanticKey(detail.label)];
    const value = detail.after ?? detail.before;
    const valueType = inferComparisonValueType(path, value);
    return {
      path,
      kind: detail.kind ?? item.kind,
      valueType,
      ...(detail.before === undefined ? {} : { before: detail.before }),
      ...(detail.after === undefined ? {} : { after: detail.after }),
      ...buildInlineSegments(detail.before, detail.after, valueType),
    } satisfies UnitComparisonContextChange;
  });
  if (item.category === "move" && !changes.some((change) => change.valueType === "position")) {
    changes.push({ path: ["position"], kind: "update", valueType: "position" });
  }
  return changes;
}

function toSemanticKey(label: string): string {
  const words = label
    .trim()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words
    .map((word, index) =>
      index === 0
        ? word.toLocaleLowerCase()
        : `${word[0]?.toLocaleUpperCase() ?? ""}${word.slice(1)}`,
    )
    .join("");
}

function diffDocument(left: unknown, right: unknown): UnitStructuralDiffItem[] {
  const leftRecord = asRecord(left);
  const rightRecord = asRecord(right);
  const leftBody = asRecord(leftRecord?.body);
  const rightBody = asRecord(rightRecord?.body);
  return [
    ...diffEntries(
      "paragraph",
      documentParagraphEntries(leftBody),
      documentParagraphEntries(rightBody),
    ),
    ...diffEntries(
      "text-style",
      documentParagraphTextStyleEntries(leftBody),
      documentParagraphTextStyleEntries(rightBody),
    ),
    ...diffArray(
      "section",
      leftBody?.sectionBreaks,
      rightBody?.sectionBreaks,
      "sectionId",
      withoutKeys("startIndex"),
    ),
    ...diffDocumentRangeArray(
      "block-range",
      leftBody,
      rightBody,
      "blockRanges",
      "blockId",
      withoutKeys("startIndex", "endIndex"),
    ),
    ...diffDocumentRangeArray(
      "custom-range",
      leftBody,
      rightBody,
      "customRanges",
      "rangeId",
      withoutKeys("startIndex", "endIndex"),
    ),
    ...diffDocumentRangeArray(
      "table-range",
      leftBody,
      rightBody,
      "tables",
      "tableId",
      withoutKeys("startIndex", "endIndex"),
    ),
    ...diffArray(
      "custom-block",
      leftBody?.customBlocks,
      rightBody?.customBlocks,
      "blockId",
      withoutKeys("startIndex"),
    ),
    ...diffDocumentRangeArray(
      "column-group",
      leftBody,
      rightBody,
      "columnGroups",
      "columnGroupId",
      withoutKeys("startIndex", "endIndex"),
    ),
    ...diffRecord("table", leftRecord?.tableSource, rightRecord?.tableSource),
    ...diffRecord("drawing", leftRecord?.drawings, rightRecord?.drawings),
    ...diffRecord("header", leftRecord?.headers, rightRecord?.headers),
    ...diffRecord("footer", leftRecord?.footers, rightRecord?.footers),
    ...diffSingleton(
      "document-style",
      "document",
      leftRecord?.documentStyle,
      rightRecord?.documentStyle,
    ),
    ...diffSingleton("document-setting", "document", leftRecord?.settings, rightRecord?.settings),
    ...diffSingleton(
      "custom-decoration",
      "body",
      leftBody?.customDecorations,
      rightBody?.customDecorations,
    ),
    ...diffResourceCollection(
      "doc-hyperlink",
      leftRecord,
      rightRecord,
      "DOC_HYPER_LINK_PLUGIN",
      "links",
    ),
    ...diffResourceCollection(
      "doc-callout",
      leftRecord,
      rightRecord,
      "DOC_CALLOUT_PLUGIN",
      "callouts",
    ),
    ...diffResourceCollection("doc-chart", leftRecord, rightRecord, "DOC_CHART_PLUGIN", "charts"),
    ...diffResourceCollection(
      "doc-chart-data",
      leftRecord,
      rightRecord,
      "DOC_CHART_PLUGIN",
      "dataSources",
    ),
    ...diffResourceCollection("doc-code", leftRecord, rightRecord, "DOC_CODE_PLUGIN", "codes"),
    ...diffResourceCollection("doc-latex", leftRecord, rightRecord, "DOC_LATEX_PLUGIN", "formulas"),
    ...diffResourceCollection("doc-shape-resource", leftRecord, rightRecord, "DOC_SHAPE_PLUGIN"),
    ...diffResourceCollection(
      "doc-table-resource",
      leftRecord,
      rightRecord,
      "DOC_TABLE_PLUGIN",
      "tables",
    ),
  ];
}

function documentParagraphTextStyleEntries(body: Record<string, unknown> | undefined): {
  readonly id: string;
  readonly index: number;
  readonly label?: string | undefined;
  readonly nativeStableId: string;
  readonly value: unknown;
}[] {
  const runs = (Array.isArray(body?.textRuns) ? body.textRuns : [])
    .flatMap((value) => {
      const run = asRecord(value);
      const start = typeof run?.st === "number" ? run.st : null;
      const end = typeof run?.ed === "number" ? run.ed : null;
      return start === null || end === null ? [] : [{ end, run, start }];
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let firstCandidate = 0;
  return documentParagraphs(body).map((paragraph) => {
    while (
      runs[firstCandidate]?.end !== undefined &&
      runs[firstCandidate]!.end <= paragraph.start
    ) {
      firstCandidate += 1;
    }
    const styles: unknown[] = [];
    for (let index = firstCandidate; index < runs.length; index += 1) {
      const candidate = runs[index]!;
      if (candidate.start >= paragraph.end) break;
      if (candidate.end <= paragraph.start) continue;
      styles.push({
        ...candidate.run,
        st: Math.max(candidate.start, paragraph.start) - paragraph.start,
        ed: Math.min(candidate.end, paragraph.end) - paragraph.start,
      });
    }
    return {
      id: paragraph.stableId,
      index: paragraph.index,
      ...(compactEntityLabel(paragraph.text) === undefined
        ? {}
        : { label: compactEntityLabel(paragraph.text) }),
      nativeStableId: paragraph.paragraphId,
      value: styles,
    };
  });
}

function documentParagraphEntries(body: Record<string, unknown> | undefined): {
  readonly id: string;
  readonly index: number;
  readonly label?: string | undefined;
  readonly nativeStableId: string;
  readonly value: unknown;
}[] {
  return documentParagraphRecords(body).map((entry) => ({
    id: entry.stableId,
    index: entry.index,
    ...(compactEntityLabel(entry.text) === undefined
      ? {}
      : { label: compactEntityLabel(entry.text) }),
    nativeStableId: entry.paragraphId,
    value: entry.value,
  }));
}

interface DocumentParagraphRecord {
  readonly stableId: string;
  readonly paragraphId: string;
  readonly structureId?: string;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly value: unknown;
}

function documentParagraphRecords(
  body: Record<string, unknown> | undefined,
): DocumentParagraphRecord[] {
  const paragraphs = Array.isArray(body?.paragraphs) ? body.paragraphs : [];
  const dataStream = typeof body?.dataStream === "string" ? body.dataStream : "";
  const records: Array<{
    paragraph: Record<string, unknown> & { paragraphId: string; startIndex: number };
    index: number;
  }> = [];
  paragraphs.forEach((value, index) => {
    const paragraph = asRecord(value);
    if (typeof paragraph?.paragraphId === "string" && typeof paragraph.startIndex === "number") {
      records.push({
        paragraph: paragraph as Record<string, unknown> & {
          paragraphId: string;
          startIndex: number;
        },
        index,
      });
    }
  });
  const orderedRecords = [...records].sort(
    (left, right) => left.paragraph.startIndex - right.paragraph.startIndex,
  );
  return orderedRecords.flatMap(({ paragraph, index }, orderedIndex) => {
    const previousEnd = orderedRecords[orderedIndex - 1]?.paragraph.startIndex ?? -1;
    if (dataStream[paragraph.startIndex] === "\0") return [];
    const rawStart = previousEnd + 1;
    const start = visibleDocumentParagraphStart(dataStream, rawStart, paragraph.startIndex);
    const text = dataStream.slice(start, paragraph.startIndex);
    const structureId = documentParagraphStructureId(body, dataStream, paragraph.startIndex);
    const metadata = withoutKeys("startIndex")(paragraph);
    return [
      {
        stableId: structureId ?? paragraph.paragraphId,
        paragraphId: paragraph.paragraphId,
        ...(structureId === undefined ? {} : { structureId }),
        index,
        start,
        end: paragraph.startIndex,
        text,
        value: {
          ...asRecord(metadata),
          text,
        },
      },
    ];
  });
}

function documentParagraphs(
  body: Record<string, unknown> | undefined,
): DocumentComparisonParagraph[] {
  return documentParagraphRecords(body).map((entry) => ({
    stableId: entry.stableId,
    paragraphId: entry.paragraphId,
    ...(entry.structureId === undefined ? {} : { structureId: entry.structureId }),
    index: entry.index,
    start: entry.start,
    end: entry.end,
    text: entry.text,
    value: entry.value,
  }));
}

const DOCUMENT_STRUCTURE_TOKENS = new Set([
  "\b",
  "\n",
  "\v",
  "\x0e",
  "\x0f",
  "\x10",
  "\x11",
  "\x12",
  "\x13",
  "\x14",
  "\x15",
  "\x1a",
  "\x1b",
  "\x1c",
  "\x1d",
  "\x1e",
  "\x1f",
]);

function visibleDocumentParagraphStart(dataStream: string, start: number, end: number): number {
  let offset = start;
  while (offset < end && DOCUMENT_STRUCTURE_TOKENS.has(dataStream[offset] ?? "")) offset += 1;
  return offset;
}

function documentParagraphStructureId(
  body: Record<string, unknown> | undefined,
  dataStream: string,
  paragraphEnd: number,
): string | undefined {
  for (const [index, value] of (Array.isArray(body?.tables) ? body.tables : []).entries()) {
    const range = asRecord(value);
    if (!containsNestedParagraph(range, paragraphEnd)) continue;
    const tableId = typeof range?.tableId === "string" ? range.tableId : `table-${index}`;
    const slot = tableParagraphSlot(dataStream, range!.startIndex as number, paragraphEnd);
    if (slot !== undefined) return `table:${tableId}:${slot}`;
  }
  for (const [index, value] of (Array.isArray(body?.columnGroups)
    ? body.columnGroups
    : []
  ).entries()) {
    const range = asRecord(value);
    if (!containsNestedParagraph(range, paragraphEnd)) continue;
    const groupId =
      typeof range?.columnGroupId === "string" ? range.columnGroupId : `column-group-${index}`;
    const slot = columnParagraphSlot(dataStream, range!.startIndex as number, paragraphEnd);
    if (slot !== undefined) return `column-group:${groupId}:${slot}`;
  }
  return undefined;
}

function containsNestedParagraph(
  range: Record<string, unknown> | undefined,
  paragraphEnd: number,
): range is Record<string, unknown> & { readonly startIndex: number; readonly endIndex: number } {
  return (
    typeof range?.startIndex === "number" &&
    typeof range.endIndex === "number" &&
    paragraphEnd > range.startIndex &&
    paragraphEnd < range.endIndex
  );
}

function tableParagraphSlot(
  dataStream: string,
  rangeStart: number,
  paragraphEnd: number,
): string | undefined {
  let row = -1;
  let cell = -1;
  let paragraph = 0;
  for (let offset = rangeStart; offset < paragraphEnd; offset += 1) {
    const token = dataStream[offset];
    if (token === "\x1b") {
      row += 1;
      cell = -1;
    } else if (token === "\x1c") {
      cell += 1;
      paragraph = 0;
    } else if (token === "\r") {
      paragraph += 1;
    }
  }
  return row < 0 || cell < 0 ? undefined : `row:${row}:cell:${cell}:paragraph:${paragraph}`;
}

function columnParagraphSlot(
  dataStream: string,
  rangeStart: number,
  paragraphEnd: number,
): string | undefined {
  let column = -1;
  let paragraph = 0;
  for (let offset = rangeStart; offset < paragraphEnd; offset += 1) {
    const token = dataStream[offset];
    if (token === "\x13") {
      column += 1;
      paragraph = 0;
    } else if (token === "\r") {
      paragraph += 1;
    }
  }
  return column < 0 ? undefined : `column:${column}:paragraph:${paragraph}`;
}

function alignSequences<T>(
  left: readonly T[],
  right: readonly T[],
  key: (value: T) => string,
): Array<{ readonly left: T | null; readonly right: T | null }> {
  const leftTokens = occurrenceTokens(left, key);
  const rightTokens = occurrenceTokens(right, key);
  const rightIndexByToken = new Map(rightTokens.map((token, index) => [token, index]));
  const candidates = leftTokens.flatMap((token, leftIndex) => {
    const rightIndex = rightIndexByToken.get(token);
    return rightIndex === undefined ? [] : [{ leftIndex, rightIndex }];
  });
  const anchors = longestIncreasingRightIndices(candidates);
  const rows: Array<{ left: T | null; right: T | null }> = [];
  let leftCursor = 0;
  let rightCursor = 0;
  for (const anchor of anchors) {
    while (leftCursor < anchor.leftIndex) {
      rows.push({ left: left[leftCursor] ?? null, right: null });
      leftCursor += 1;
    }
    while (rightCursor < anchor.rightIndex) {
      rows.push({ left: null, right: right[rightCursor] ?? null });
      rightCursor += 1;
    }
    rows.push({ left: left[anchor.leftIndex] ?? null, right: right[anchor.rightIndex] ?? null });
    leftCursor = anchor.leftIndex + 1;
    rightCursor = anchor.rightIndex + 1;
  }
  while (leftCursor < left.length) {
    rows.push({ left: left[leftCursor] ?? null, right: null });
    leftCursor += 1;
  }
  while (rightCursor < right.length) {
    rows.push({ left: null, right: right[rightCursor] ?? null });
    rightCursor += 1;
  }
  return rows;
}

function occurrenceTokens<T>(values: readonly T[], key: (value: T) => string): string[] {
  const counts = new Map<string, number>();
  return values.map((value) => {
    const stableId = key(value);
    const occurrence = counts.get(stableId) ?? 0;
    counts.set(stableId, occurrence + 1);
    return `${stableId}\u0000${occurrence}`;
  });
}

function longestIncreasingRightIndices<T extends { readonly rightIndex: number }>(
  values: readonly T[],
): T[] {
  if (values.length === 0) return [];
  const tails: number[] = [];
  const previous = Array<number>(values.length).fill(-1);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!.rightIndex;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (values[tails[middle]!]!.rightIndex < value) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tails[low - 1] ?? -1;
    tails[low] = index;
  }
  const result: T[] = [];
  let cursor = tails.at(-1) ?? -1;
  while (cursor >= 0) {
    result.push(values[cursor]!);
    cursor = previous[cursor] ?? -1;
  }
  return result.reverse();
}

function diffSlides(left: unknown, right: unknown): UnitStructuralDiffItem[] {
  const leftRecord = asRecord(left);
  const rightRecord = asRecord(right);
  const pages = diffRecord(
    "slide",
    leftRecord?.slides,
    rightRecord?.slides,
    leftRecord?.slideOrder,
    rightRecord?.slideOrder,
    withoutKeys("elements", "elementOrder"),
  );
  const ids = new Set([
    ...Object.keys(asRecord(leftRecord?.slides) ?? {}),
    ...Object.keys(asRecord(rightRecord?.slides) ?? {}),
  ]);
  const elements = [...ids].flatMap((pageId) =>
    diffRecord(
      `slide-element:${pageId}`,
      asRecord(asRecord(asRecord(leftRecord?.slides)?.[pageId])?.elements),
      asRecord(asRecord(asRecord(rightRecord?.slides)?.[pageId])?.elements),
      asRecord(asRecord(leftRecord?.slides)?.[pageId])?.elementOrder,
      asRecord(asRecord(rightRecord?.slides)?.[pageId])?.elementOrder,
    ),
  );
  return [
    ...pages,
    ...elements,
    ...diffRecord(
      "slide-transition",
      leftRecord?.transitionRecords,
      rightRecord?.transitionRecords,
    ),
    ...diffRecord(
      "slide-transition-ref",
      leftRecord?.slideTransitionRefs,
      rightRecord?.slideTransitionRefs,
    ),
    ...diffRecord("slide-master", leftRecord?.masterPages, rightRecord?.masterPages),
    ...diffRecord("slide-layout", leftRecord?.layoutPages, rightRecord?.layoutPages),
    ...diffSingleton("slide-theme", "theme", leftRecord?.theme, rightRecord?.theme),
    ...diffResourceCollection(
      "slide-chart",
      leftRecord,
      rightRecord,
      "SLIDE_CHART_PLUGIN",
      "charts",
    ),
    ...diffResourceCollection(
      "slide-chart-data",
      leftRecord,
      rightRecord,
      "SLIDE_CHART_PLUGIN",
      "dataSources",
    ),
    ...diffResourceCollection(
      "slide-table",
      leftRecord,
      rightRecord,
      "SLIDE_TABLE_PLUGIN",
      "tables",
    ),
  ];
}

function diffBase(left: unknown, right: unknown): UnitStructuralDiffItem[] {
  const leftRecord = asRecord(left);
  const rightRecord = asRecord(right);
  const leftTables = asRecord(leftRecord?.tables);
  const rightTables = asRecord(rightRecord?.tables);
  const tables = diffRecord(
    "table",
    leftTables,
    rightTables,
    asRecord(left)?.tableOrder,
    asRecord(right)?.tableOrder,
    withoutKeys(
      "fields",
      "fieldOrder",
      "records",
      "recordOrder",
      "views",
      "viewOrder",
      "cellData",
      "rev",
      "createdAt",
      "updatedAt",
    ),
  );
  const tableIds = new Set([...Object.keys(leftTables ?? {}), ...Object.keys(rightTables ?? {})]);
  return [
    ...diffSingleton(
      "base",
      "base",
      withoutKeys("tables", "tableOrder", "resources", "rev", "createdAt", "updatedAt")(leftRecord),
      withoutKeys(
        "tables",
        "tableOrder",
        "resources",
        "rev",
        "createdAt",
        "updatedAt",
      )(rightRecord),
    ),
    ...tables,
    ...[...tableIds].flatMap((tableId) => {
      const leftTable = asRecord(leftTables?.[tableId]);
      const rightTable = asRecord(rightTables?.[tableId]);
      return [
        ...diffRecord(
          `field:${tableId}`,
          leftTable?.fields,
          rightTable?.fields,
          leftTable?.fieldOrder,
          rightTable?.fieldOrder,
          withoutKeys("rev", "createdAt", "updatedAt"),
        ),
        ...diffRecord(
          `record:${tableId}`,
          leftTable?.records,
          rightTable?.records,
          leftTable?.recordOrder,
          rightTable?.recordOrder,
          withoutKeys("orderKey", "rev", "createdAt", "updatedAt"),
        ),
        ...diffRecord(
          `view:${tableId}`,
          leftTable?.views,
          rightTable?.views,
          leftTable?.viewOrder,
          rightTable?.viewOrder,
          withoutKeys("orderKey", "rev", "createdAt", "updatedAt"),
        ),
      ];
    }),
  ];
}

function diffBoard(left: unknown, right: unknown): UnitStructuralDiffItem[] {
  const leftRecord = asRecord(left);
  const rightRecord = asRecord(right);
  const leftPages = asRecord(leftRecord?.pages);
  const rightPages = asRecord(rightRecord?.pages);
  const pages = diffRecord(
    "board-page",
    leftPages,
    rightPages,
    leftRecord?.pageOrder,
    rightRecord?.pageOrder,
    withoutKeys("elements", "elementOrder"),
  );
  const pageIds = new Set([...Object.keys(leftPages ?? {}), ...Object.keys(rightPages ?? {})]);
  const pageElements = [...pageIds].flatMap((pageId) =>
    diffRecord(
      `board-element:${pageId}`,
      asRecord(asRecord(leftPages?.[pageId])?.elements),
      asRecord(asRecord(rightPages?.[pageId])?.elements),
      asRecord(leftPages?.[pageId])?.elementOrder,
      asRecord(rightPages?.[pageId])?.elementOrder,
    ),
  );
  // Older Board snapshots expose the active page's elements at the root.
  return [
    ...pages,
    ...pageElements,
    ...diffRecord("board-element", leftRecord?.elements, rightRecord?.elements),
    ...diffSingleton("board-theme", "theme", leftRecord?.theme, rightRecord?.theme),
    ...diffResourceCollection(
      "board-chart",
      leftRecord,
      rightRecord,
      "BOARD_CHART_PLUGIN",
      "charts",
    ),
    ...diffResourceCollection(
      "board-chart-data",
      leftRecord,
      rightRecord,
      "BOARD_CHART_PLUGIN",
      "dataSources",
    ),
    ...diffResourceCollection(
      "board-table",
      leftRecord,
      rightRecord,
      "BOARD_TABLE_PLUGIN",
      "tables",
    ),
  ];
}

function diffSingleton(
  category: string,
  stableId: string,
  left: unknown,
  right: unknown,
): UnitStructuralDiffItem[] {
  return diffEntries(
    category,
    left === undefined
      ? []
      : [{ id: stableId, index: 0, value: left, label: entityContentLabel(left) }],
    right === undefined
      ? []
      : [{ id: stableId, index: 0, value: right, label: entityContentLabel(right) }],
  );
}

function diffResourceCollection(
  category: string,
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
  pluginName: string,
  collectionKey?: string,
): UnitStructuralDiffItem[] {
  const leftValue = readResourceCollection(left, pluginName, collectionKey);
  const rightValue = readResourceCollection(right, pluginName, collectionKey);
  return diffEntries(category, collectionEntries(leftValue), collectionEntries(rightValue));
}

function readResourceCollection(
  snapshot: Record<string, unknown> | undefined,
  pluginName: string,
  collectionKey: string | undefined,
): unknown {
  const resources = Array.isArray(snapshot?.resources) ? snapshot.resources : [];
  const resource = resources.map(asRecord).find((entry) => entry?.name === pluginName);
  if (resource === undefined) return undefined;
  let data = resource.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return data;
    }
  }
  return collectionKey === undefined ? data : asRecord(data)?.[collectionKey];
}

function collectionEntries(value: unknown): DiffEntry[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      id: collectionEntryId(entry, index),
      index,
      label: entityContentLabel(entry),
      value: entry,
    }));
  }
  const record = asRecord(value);
  if (record === undefined) return [];
  return Object.entries(record).map(([id, entry], index) => ({
    id,
    index,
    label: entityContentLabel(entry),
    value: entry,
  }));
}

function collectionEntryId(value: unknown, index: number): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  const id = [
    record?.id,
    record?.chartId,
    record?.tableId,
    record?.formulaId,
    record?.rangeId,
    record?.blockId,
    record?.linkId,
    record?.drawingId,
  ].find((candidate): candidate is string => typeof candidate === "string");
  return id ?? `entry-${index}`;
}

function diffDocumentRangeArray(
  category: string,
  leftBody: Record<string, unknown> | undefined,
  rightBody: Record<string, unknown> | undefined,
  collectionKey: string,
  idKey: string,
  project: (value: unknown) => unknown,
): UnitStructuralDiffItem[] {
  const entries = (body: Record<string, unknown> | undefined): DiffEntry[] => {
    const values = Array.isArray(body?.[collectionKey]) ? body[collectionKey] : [];
    return values.flatMap((value, index) => {
      const record = asRecord(value);
      const id = record?.[idKey];
      if (typeof id !== "string") return [];
      return [
        {
          id,
          index,
          label: documentRangeContentLabel(body, record) ?? entityContentLabel(record),
          value: project(record),
        },
      ];
    });
  };
  return diffEntries(category, entries(leftBody), entries(rightBody));
}

function documentRangeContentLabel(
  body: Record<string, unknown> | undefined,
  range: Record<string, unknown> | undefined,
): string | undefined {
  const dataStream = body?.dataStream;
  const start = range?.startIndex;
  const end = range?.endIndex;
  if (typeof dataStream !== "string" || typeof start !== "number" || typeof end !== "number") {
    return undefined;
  }
  return compactEntityLabel(dataStream.slice(start, end + 1));
}

function diffArray(
  category: string,
  leftValue: unknown,
  rightValue: unknown,
  idKey: string,
  project: (value: unknown) => unknown = (value) => value,
): UnitStructuralDiffItem[] {
  const left = Array.isArray(leftValue) ? leftValue : [];
  const right = Array.isArray(rightValue) ? rightValue : [];
  const leftEntries = left.flatMap((value, index) => {
    const record = asRecord(value);
    const id = record?.[idKey];
    return typeof id === "string"
      ? [{ id, index, label: entityContentLabel(record), value: project(record) }]
      : [];
  });
  const rightEntries = right.flatMap((value, index) => {
    const record = asRecord(value);
    const id = record?.[idKey];
    return typeof id === "string"
      ? [{ id, index, label: entityContentLabel(record), value: project(record) }]
      : [];
  });
  return diffEntries(category, leftEntries, rightEntries);
}

function diffRecord(
  category: string,
  leftValue: unknown,
  rightValue: unknown,
  leftOrderValue?: unknown,
  rightOrderValue?: unknown,
  project: (value: unknown) => unknown = (value) => value,
): UnitStructuralDiffItem[] {
  const left = asRecord(leftValue) ?? {};
  const right = asRecord(rightValue) ?? {};
  const orderedEntries = (record: Record<string, unknown>, orderValue: unknown) => {
    const orderedIds = Array.isArray(orderValue)
      ? orderValue.filter((id): id is string => typeof id === "string" && id in record)
      : [];
    const ids = [...orderedIds, ...Object.keys(record).filter((id) => !orderedIds.includes(id))];
    return ids.map((id, index) => ({
      id,
      index,
      label: entityContentLabel(record[id]),
      value: project(record[id]),
    }));
  };
  return diffEntries(
    category,
    orderedEntries(left, leftOrderValue),
    orderedEntries(right, rightOrderValue),
  );
}

function orderedRecordIds(record: Record<string, unknown>, orderValue: unknown): string[] {
  const orderedIds = Array.isArray(orderValue)
    ? orderValue.filter((id): id is string => typeof id === "string" && id in record)
    : [];
  return [...orderedIds, ...Object.keys(record).filter((id) => !orderedIds.includes(id))];
}

function alignStableOrder(left: readonly string[], right: readonly string[]): string[] {
  const result = [...right];
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const id = left[leftIndex];
    if (id === undefined) continue;
    if (result.includes(id)) continue;
    const nextAnchor = left.slice(leftIndex + 1).find((candidate) => result.includes(candidate));
    if (nextAnchor !== undefined) {
      result.splice(result.indexOf(nextAnchor), 0, id);
      continue;
    }
    const previousAnchor = [...left.slice(0, leftIndex)]
      .reverse()
      .find((candidate) => result.includes(candidate));
    if (previousAnchor === undefined) result.push(id);
    else result.splice(result.indexOf(previousAnchor) + 1, 0, id);
  }
  return result;
}

function pageDisplayName(value: Record<string, unknown> | undefined): string | null {
  if (value === undefined) return null;
  const candidate = [value.name, value.title, value.pageName].find(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  return candidate ?? null;
}

/**
 * Extract a short, user-facing description without weakening the stable-ID contract.
 * Product snapshots hide visible copy at different depths, so this intentionally follows only
 * known presentation-bearing fields instead of walking arbitrary objects (which could surface IDs).
 */
function entityContentLabel(value: unknown, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  if (typeof value === "string") return compactEntityLabel(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 8)) {
      const label = entityContentLabel(entry, depth + 1);
      if (label !== undefined) return label;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const directKeys = [
    "title",
    "label",
    "text",
    "caption",
    "description",
    "dataStream",
    "formula",
    "code",
    "language",
    "url",
  ] as const;
  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate !== "string") continue;
    const label = compactEntityLabel(candidate);
    if (label !== undefined) return label;
  }
  const nestedKeys = [
    "textData",
    "body",
    "shapeData",
    "shapeText",
    "dataModel",
    "doc",
    "content",
    "props",
    "value",
    "values",
    "tableRows",
    "tableCells",
    "rows",
    "cells",
    "columns",
  ] as const;
  for (const key of nestedKeys) {
    const label = entityContentLabel(record[key], depth + 1);
    if (label !== undefined) return label;
  }
  return typeof record.name === "string" ? compactEntityLabel(record.name) : undefined;
}

function compactEntityLabel(value: string): string | undefined {
  const compact = value
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length === 0) return undefined;
  return compact.length <= 72 ? compact : `${compact.slice(0, 69).trimEnd()}…`;
}

function withoutKeys(...keys: readonly string[]): (value: unknown) => unknown {
  return (value) => {
    const record = asRecord(value);
    if (record === undefined) return value;
    return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
  };
}

interface DiffEntry {
  readonly id: string;
  readonly index: number;
  readonly label?: string | undefined;
  readonly nativeStableId?: string;
  readonly value: unknown;
}

function diffEntries(
  category: string,
  leftEntries: readonly DiffEntry[],
  rightEntries: readonly DiffEntry[],
): UnitStructuralDiffItem[] {
  const left = new Map(leftEntries.map((entry) => [entry.id, entry]));
  const right = new Map(rightEntries.map((entry) => [entry.id, entry]));
  const leftCommonOrder = leftEntries
    .filter((entry) => right.has(entry.id))
    .map((entry) => entry.id);
  const rightCommonOrder = rightEntries
    .filter((entry) => left.has(entry.id))
    .map((entry) => entry.id);
  const leftCommonIndex = new Map(leftCommonOrder.map((id, index) => [id, index]));
  const rightCommonIndex = new Map(rightCommonOrder.map((id, index) => [id, index]));
  return [...new Set([...left.keys(), ...right.keys()])].flatMap((stableId) => {
    const before = left.get(stableId);
    const after = right.get(stableId);
    const kind = before === undefined ? "insert" : after === undefined ? "delete" : "update";
    const moved =
      before !== undefined &&
      after !== undefined &&
      leftCommonIndex.get(stableId) !== rightCommonIndex.get(stableId);
    if (
      before !== undefined &&
      after !== undefined &&
      !moved &&
      stableJson(before.value) === stableJson(after.value)
    ) {
      return [];
    }
    const [entityType, parentStableId] = splitCategory(category);
    const changes = buildSemanticChanges(before?.value, after?.value, kind);
    if (moved && !changes.some((change) => change.valueType === "position")) {
      changes.push({
        path: ["position"],
        kind: "update",
        valueType: "position",
        before: before?.index ?? null,
        after: after?.index ?? null,
      });
    }
    return [
      {
        id: `${category}:${kind}:${stableId}`,
        stableId,
        category,
        entityType,
        ...(parentStableId === undefined ? {} : { parentStableId }),
        path:
          parentStableId === undefined
            ? [entityType, stableId]
            : [entityType, parentStableId, stableId],
        label: after?.label ?? before?.label ?? stableId,
        kind,
        moved,
        changes,
        ...(before?.nativeStableId === undefined && after?.nativeStableId === undefined
          ? {}
          : {
              nativeStableIds: {
                ...(before?.nativeStableId === undefined ? {} : { left: before.nativeStableId }),
                ...(after?.nativeStableId === undefined ? {} : { right: after.nativeStableId }),
              },
            }),
        position: {
          left: before?.index ?? null,
          right: after?.index ?? null,
        },
        values: {
          ...(before === undefined ? {} : { left: before.value }),
          ...(after === undefined ? {} : { right: after.value }),
        },
      },
    ];
  });
}

function splitCategory(category: string): readonly [string, string | undefined] {
  const separator = category.indexOf(":");
  return separator === -1
    ? [category, undefined]
    : [category.slice(0, separator), category.slice(separator + 1)];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = asRecord(value);
  if (record === undefined) return JSON.stringify(value) ?? "undefined";
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
