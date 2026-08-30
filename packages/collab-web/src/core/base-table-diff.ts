import type { UnitStructuralDiffKind } from "@univer/unit-compare";

export interface BaseDiffField {
  readonly id: string;
  readonly left: Record<string, unknown> | null;
  readonly right: Record<string, unknown> | null;
  readonly label: string;
  readonly status: UnitStructuralDiffKind | null;
}

export interface BaseDiffRecord {
  readonly id: string;
  readonly left: Record<string, unknown> | null;
  readonly right: Record<string, unknown> | null;
  readonly label: string;
  readonly status: UnitStructuralDiffKind | null;
}

export interface BaseTableDiff {
  readonly id: string;
  readonly label: string;
  readonly status: UnitStructuralDiffKind;
  readonly left: Record<string, unknown> | null;
  readonly right: Record<string, unknown> | null;
  readonly fields: readonly BaseDiffField[];
  readonly records: readonly BaseDiffRecord[];
}

export interface BaseDiffCell {
  readonly displayValue: string;
  readonly present: boolean;
  readonly value: unknown;
  readonly status: UnitStructuralDiffKind | null;
}

export interface BaseDiffGridLayout {
  readonly columnWidths: readonly number[];
  readonly gridTemplateColumns: string;
  readonly totalWidth: number;
}

const BASE_ROW_HEADER_WIDTH = 44;
const BASE_DEFAULT_FIELD_WIDTH = 160;
const BASE_MIN_FIELD_WIDTH = 80;
const BASE_MAX_FIELD_WIDTH = 480;

export function buildBaseTableDiff(left: unknown, right: unknown): BaseTableDiff[] {
  const leftTables = asRecord(asRecord(left)?.tables) ?? {};
  const rightTables = asRecord(asRecord(right)?.tables) ?? {};
  const tableIds = alignStableOrder(
    orderedIds(leftTables, asRecord(left)?.tableOrder),
    orderedIds(rightTables, asRecord(right)?.tableOrder)
  );

  return tableIds.flatMap((tableId) => {
    const leftTable = asRecord(leftTables[tableId]) ?? null;
    const rightTable = asRecord(rightTables[tableId]) ?? null;
    const fields = buildFields(leftTable, rightTable);
    const records = buildRecords(leftTable, rightTable, fields);
    const status = tableStatus(leftTable, rightTable, fields, records);
    if (status === null) return [];
    return [
      {
        id: tableId,
        label: displayName(rightTable) ?? displayName(leftTable) ?? tableId,
        status,
        left: leftTable,
        right: rightTable,
        fields,
        records
      }
    ];
  });
}

export function getBaseDiffCell(input: {
  readonly field: BaseDiffField;
  readonly record: BaseDiffRecord;
  readonly side: "left" | "right";
}): BaseDiffCell {
  const field = input.field[input.side];
  const record = input.record[input.side];
  const present = field !== null && record !== null;
  const value = asRecord(record)?.values;
  const cellValue = asRecord(value)?.[input.field.id];
  const peerRecord = input.record[input.side === "left" ? "right" : "left"];
  const peerValue = asRecord(asRecord(peerRecord)?.values)?.[input.field.id];
  const status =
    input.field.left === null || input.field.right === null ||
    input.record.left === null || input.record.right === null
      ? input.side === "left"
        ? "delete"
        : "insert"
      : stableJson(cellValue) === stableJson(peerValue)
        ? null
        : "update";
  return {
    displayValue: present ? formatBaseCellValue(cellValue) : "",
    present,
    value: cellValue,
    status
  };
}

/**
 * Resolve one shared Base grid geometry from both snapshots. The comparison panes must consume
 * these exact pixel tracks; letting each DOM grid size itself from its own content makes their
 * scroll widths diverge and breaks pixel-aligned horizontal scrolling.
 */
export function buildBaseDiffGridLayout(table: BaseTableDiff): BaseDiffGridLayout {
  const columnWidths = table.fields.map((field) => resolveFieldWidth(table, field));
  return {
    columnWidths,
    gridTemplateColumns: `${BASE_ROW_HEADER_WIDTH}px ${columnWidths.map((width) => `${width}px`).join(" ")}`,
    totalWidth: BASE_ROW_HEADER_WIDTH + columnWidths.reduce((total, width) => total + width, 0)
  };
}

export function formatBaseCellValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatBaseCellValue).filter(Boolean).join(", ");
  const record = asRecord(value);
  if (record === undefined) return String(value);
  const humanLabel = [record.name, record.label, record.title].find(
    (candidate): candidate is string => typeof candidate === "string"
  );
  return humanLabel ?? JSON.stringify(value);
}

function buildFields(
  leftTable: Record<string, unknown> | null,
  rightTable: Record<string, unknown> | null
): BaseDiffField[] {
  const leftFields = asRecord(leftTable?.fields) ?? {};
  const rightFields = asRecord(rightTable?.fields) ?? {};
  const leftIds = orderedIds(leftFields, leftTable?.fieldOrder).filter((id) =>
    isVisibleComparisonField(leftFields[id])
  );
  const rightIds = orderedIds(rightFields, rightTable?.fieldOrder).filter((id) =>
    isVisibleComparisonField(rightFields[id])
  );
  const ids = alignStableOrder(leftIds, rightIds);
  const leftCommon = leftIds.filter((id) => id in rightFields);
  const rightCommon = rightIds.filter((id) => id in leftFields);
  return ids.map((id) => {
    const left = asRecord(leftFields[id]) ?? null;
    const right = asRecord(rightFields[id]) ?? null;
    return {
      id,
      left,
      right,
      label: displayName(right) ?? displayName(left) ?? id,
      status: pairStatus(
        left,
        right,
        fieldProjection,
        left !== null &&
          right !== null &&
          leftCommon.indexOf(id) !== rightCommon.indexOf(id)
      )
    };
  });
}

function isVisibleComparisonField(value: unknown): boolean {
  const field = asRecord(value);
  return field !== undefined && field.system !== true && field.type !== "recordId";
}

function buildRecords(
  leftTable: Record<string, unknown> | null,
  rightTable: Record<string, unknown> | null,
  fields: readonly BaseDiffField[]
): BaseDiffRecord[] {
  const leftRecords = asRecord(leftTable?.records) ?? {};
  const rightRecords = asRecord(rightTable?.records) ?? {};
  const leftIds = orderedIds(leftRecords, leftTable?.recordOrder);
  const rightIds = orderedIds(rightRecords, rightTable?.recordOrder);
  const ids = alignStableOrder(leftIds, rightIds);
  const leftCommon = leftIds.filter((id) => id in rightRecords);
  const rightCommon = rightIds.filter((id) => id in leftRecords);
  const labelFieldId =
    typeof rightTable?.primaryFieldId === "string"
      ? rightTable.primaryFieldId
      : typeof leftTable?.primaryFieldId === "string"
        ? leftTable.primaryFieldId
        : fields[0]?.id;
  return ids.map((id) => {
    const left = asRecord(leftRecords[id]) ?? null;
    const right = asRecord(rightRecords[id]) ?? null;
    const moved =
      left !== null &&
      right !== null &&
      leftCommon.indexOf(id) !== rightCommon.indexOf(id);
    const status = pairStatus(left, right, recordProjection, moved);
    const labelValue =
      asRecord(asRecord(right)?.values)?.[labelFieldId ?? ""] ??
      asRecord(asRecord(left)?.values)?.[labelFieldId ?? ""];
    return {
      id,
      left,
      right,
      label: formatBaseCellValue(labelValue) || id,
      status
    };
  });
}

function tableStatus(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
  fields: readonly BaseDiffField[],
  records: readonly BaseDiffRecord[]
): UnitStructuralDiffKind | null {
  if (left === null) return "insert";
  if (right === null) return "delete";
  if (
    stableJson(tableProjection(left)) !== stableJson(tableProjection(right)) ||
    fields.some((field) => field.status !== null) ||
    records.some((record) => record.status !== null) ||
    hasChangedCell(fields, records)
  ) {
    return "update";
  }
  return null;
}

function hasChangedCell(
  fields: readonly BaseDiffField[],
  records: readonly BaseDiffRecord[]
): boolean {
  return fields.some((field) =>
    records.some(
      (record) =>
        field.left !== null &&
        field.right !== null &&
        record.left !== null &&
        record.right !== null &&
        stableJson(asRecord(record.left.values)?.[field.id]) !==
          stableJson(asRecord(record.right.values)?.[field.id])
    )
  );
}

function pairStatus(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
  project: (value: Record<string, unknown>) => unknown,
  moved = false
): UnitStructuralDiffKind | null {
  if (left === null) return "insert";
  if (right === null) return "delete";
  return moved || stableJson(project(left)) !== stableJson(project(right)) ? "update" : null;
}

function fieldProjection(value: Record<string, unknown>): unknown {
  return value;
}

function recordProjection(value: Record<string, unknown>): unknown {
  return withoutKeys(value, "values", "orderKey", "createdAt", "updatedAt");
}

function tableProjection(value: Record<string, unknown>): unknown {
  return withoutKeys(
    value,
    "fields",
    "fieldOrder",
    "records",
    "recordOrder",
    "rowIndex",
    "rowId",
    "colIndex",
    "colId",
    "cellData",
    "resources",
    "views",
    "viewOrder"
  );
}

function resolveFieldWidth(table: BaseTableDiff, field: BaseDiffField): number {
  const widths = [
    viewFieldWidth(table.left, field.id, field.left !== null),
    viewFieldWidth(table.right, field.id, field.right !== null)
  ].filter((width): width is number => width !== null);
  const width = widths.length === 0 ? BASE_DEFAULT_FIELD_WIDTH : Math.max(...widths);
  return Math.min(BASE_MAX_FIELD_WIDTH, Math.max(BASE_MIN_FIELD_WIDTH, Math.round(width)));
}

function viewFieldWidth(
  table: Record<string, unknown> | null,
  fieldId: string,
  fieldPresent: boolean
): number | null {
  if (table === null || !fieldPresent) return null;
  const views = asRecord(table.views) ?? {};
  const viewIds = orderedIds(views, table.viewOrder);
  const gridViews = viewIds
    .map((id) => asRecord(views[id]))
    .filter((view): view is Record<string, unknown> => view !== undefined && view.type === "grid");
  for (const view of gridViews) {
    const setting = asRecord(asRecord(view.fieldSettings)?.[fieldId]);
    if (typeof setting?.width === "number" && Number.isFinite(setting.width)) return setting.width;
  }
  return BASE_DEFAULT_FIELD_WIDTH;
}

function orderedIds(record: Record<string, unknown>, orderValue: unknown): string[] {
  const order = Array.isArray(orderValue)
    ? orderValue.filter((id): id is string => typeof id === "string" && id in record)
    : [];
  return [...order, ...Object.keys(record).filter((id) => !order.includes(id))];
}

/**
 * Use the current side as the common spine, then place left-only IDs beside their nearest stable
 * neighbour. Both panes consume this one order, so inserted/deleted fields and records always
 * occupy the same visual row or column.
 */
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
    const previousAnchor = [...left.slice(0, leftIndex)].reverse().find((candidate) => result.includes(candidate));
    if (previousAnchor === undefined) result.push(id);
    else result.splice(result.indexOf(previousAnchor) + 1, 0, id);
  }
  return result;
}

function displayName(value: Record<string, unknown> | null): string | null {
  return typeof value?.name === "string" ? value.name : null;
}

function withoutKeys(value: Record<string, unknown>, ...keys: readonly string[]): unknown {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
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
