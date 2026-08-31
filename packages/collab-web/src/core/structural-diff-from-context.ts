import type {
  UnitComparisonContext,
  UnitComparisonContextItem,
} from "@univer/collab-gateway-contract";
import type { UnitStructuralDiffItem } from "@univer/unit-compare";

/** Adapt the Pro History wire result to the private canvas presentation model. */
export function structuralDiffItemsFromContext(
  context: Pick<UnitComparisonContext, "items">,
): UnitStructuralDiffItem[] {
  return context.items.map((item) => {
    const sideStableIds = nativeStableIds(item);
    return {
      id: item.id,
      stableId: item.stableId,
      category: itemCategory(item),
      entityType: item.entityType,
      ...(item.parentStableId === undefined ? {} : { parentStableId: item.parentStableId }),
      path: item.path,
      label: item.title,
      kind: item.kind,
      moved: item.moved,
      changes: item.changes,
      ...(sideStableIds === undefined ? {} : { nativeStableIds: sideStableIds }),
      position: {
        left: item.locations.left?.position ?? null,
        right: item.locations.right?.position ?? null,
      },
      values: item.values ?? {},
    };
  });
}

function itemCategory(item: UnitComparisonContextItem): string {
  if (
    item.parentStableId !== undefined &&
    ["slide-element", "board-element", "field", "record", "view"].includes(item.entityType)
  ) {
    return `${item.entityType}:${item.parentStableId}`;
  }
  return item.entityType;
}

function nativeStableIds(
  item: UnitComparisonContextItem,
): { readonly left?: string; readonly right?: string } | undefined {
  const left = item.locations.left?.stableId;
  const right = item.locations.right?.stableId;
  if ((left === undefined || left === item.stableId) && (right === undefined || right === item.stableId)) {
    return undefined;
  }
  return {
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
  };
}
