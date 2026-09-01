import type { UnitComparisonContextChange } from "@univer/collab-gateway-contract";

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

export interface UnitDiffPageOption {
  readonly id: string;
  readonly label: string;
  readonly status: UnitStructuralDiffKind;
}

/** Return the stable Slide page containing a structural diff item. */
export function slidePageIdOfDiffItem(item: UnitStructuralDiffItem): string | null {
  if (item.entityType === "slide") return item.stableId;
  if (item.entityType === "slide-element") {
    return item.parentStableId ?? legacyParentStableId(item.category, "slide-element");
  }
  return null;
}

/** Return only changes rendered by the selected Slide page. */
export function filterSlidePageDiffItems(
  items: readonly UnitStructuralDiffItem[],
  pageId: string,
): UnitStructuralDiffItem[] {
  return items.filter((item) => slidePageIdOfDiffItem(item) === pageId);
}

/** Return the stable Base table containing a structural diff item. */
export function baseTableIdOfDiffItem(item: UnitStructuralDiffItem): string | null {
  if (item.entityType === "table") return item.stableId;
  return item.parentStableId ?? legacyParentStableId(item.category, item.entityType);
}

/** Return only changes rendered by the selected Base table. */
export function filterBaseTableDiffItems(
  items: readonly UnitStructuralDiffItem[],
  tableId: string,
): UnitStructuralDiffItem[] {
  return items.filter((item) => baseTableIdOfDiffItem(item) === tableId);
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

/** Build page tabs from SDK-reported changes; never compare snapshot content here. */

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
      const pageId = slidePageIdOfDiffItem(item);
      return pageId === null ? [] : [pageId];
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

function legacyParentStableId(category: string, entityType: string): string | null {
  const prefix = `${entityType}:`;
  return category.startsWith(prefix) ? category.slice(prefix.length) : null;
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
