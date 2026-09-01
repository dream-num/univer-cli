import type {
  IUnitComparisonLabelDescriptor,
  UnitComparisonTerm
} from "@univerjs-pro/edit-history-ui";
import {
  getUnitComparisonEntityLabel,
  getUnitComparisonPathLabels,
  getUnitComparisonValueLabel,
  unitComparisonLocaleKey
} from "@univerjs-pro/edit-history-ui";

/** Translate an SDK descriptor through a host-owned Univer LocaleService. */
export type UnitComparisonTranslate = (descriptor: IUnitComparisonLabelDescriptor) => string;

type ComparisonPathLookup = (key: string) => string | undefined;

/** Resolve one SDK-owned comparison term through the standard History UI locale. */
export function comparisonTerm(
  translate: UnitComparisonTranslate,
  term: UnitComparisonTerm
): string {
  return translate({ key: unitComparisonLocaleKey(term) });
}

/** Resolve a typed SDK entity without exposing its persisted identifier to the user. */
export function localizedComparisonEntity(
  translate: UnitComparisonTranslate,
  entityType: string
): string {
  return translate(getUnitComparisonEntityLabel(entityType));
}

/** Resolve typed SDK path descriptors while preserving application-specific exact labels. */
export function localizedComparisonPath(
  translate: UnitComparisonTranslate,
  path: readonly string[],
  lookup: ComparisonPathLookup
): string {
  const exact = lookup(path.join("."));
  if (exact !== undefined) {
    return exact;
  }
  return getUnitComparisonPathLabels(path)
    .map((descriptor, index) => lookup(path[index] ?? "") ?? translate(descriptor))
    .join(" · ");
}

/** Resolve only schema-owned enum values; user content remains unchanged. */
export function localizedComparisonEnum(
  translate: UnitComparisonTranslate,
  entityType: string,
  path: readonly string[],
  value: unknown
): string | undefined {
  const descriptor = getUnitComparisonValueLabel(entityType, path, value);
  return descriptor === undefined ? undefined : translate(descriptor);
}
