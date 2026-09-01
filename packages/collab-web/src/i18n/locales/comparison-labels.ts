import type {
  IUnitComparisonLabelDescriptor,
  UnitComparisonTerm
} from "@univerjs-pro/edit-history-ui";
import {
  getUnitComparisonEntityLabel,
  getUnitComparisonPathLabels,
  getUnitComparisonValueLabel
} from "@univerjs-pro/edit-history-ui";

export interface UnitComparisonLocalePack {
  readonly "edit-history-ui": {
    readonly comparison: Readonly<Record<UnitComparisonTerm, string>>;
  };
}

type ComparisonPathLookup = (key: string) => string | undefined;

const COMPARISON_KEY_PREFIX = "edit-history-ui.comparison.";

/** Resolve one SDK-owned comparison term from the matching standard History UI locale. */
export function comparisonTerm(
  locale: UnitComparisonLocalePack,
  term: UnitComparisonTerm
): string {
  return locale["edit-history-ui"].comparison[term];
}

/** Resolve a typed SDK entity without exposing its persisted identifier to the user. */
export function localizedComparisonEntity(
  locale: UnitComparisonLocalePack,
  entityType: string
): string {
  return resolveDescriptor(locale, getUnitComparisonEntityLabel(entityType));
}

/** Resolve typed SDK path descriptors while preserving application-specific exact labels. */
export function localizedComparisonPath(
  locale: UnitComparisonLocalePack,
  path: readonly string[],
  lookup: ComparisonPathLookup
): string {
  const exact = lookup(path.join("."));
  if (exact !== undefined) {
    return exact;
  }
  return getUnitComparisonPathLabels(path)
    .map((descriptor, index) => lookup(path[index] ?? "") ?? resolveDescriptor(locale, descriptor))
    .join(" · ");
}

/** Resolve only schema-owned enum values; user content remains unchanged. */
export function localizedComparisonEnum(
  locale: UnitComparisonLocalePack,
  entityType: string,
  path: readonly string[],
  value: unknown
): string | undefined {
  const descriptor = getUnitComparisonValueLabel(entityType, path, value);
  return descriptor === undefined ? undefined : resolveDescriptor(locale, descriptor);
}

function resolveDescriptor(
  locale: UnitComparisonLocalePack,
  descriptor: IUnitComparisonLabelDescriptor
): string {
  const term = descriptor.key.slice(COMPARISON_KEY_PREFIX.length) as UnitComparisonTerm;
  const comparison = locale["edit-history-ui"].comparison;
  const template = comparison[term] ?? comparison.unknown;
  return (descriptor.args ?? []).reduce(
    (result, value, index) => result.replaceAll(`{${index}}`, value),
    template
  );
}
