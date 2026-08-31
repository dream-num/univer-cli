import type { UnitComparisonContextChange } from "@univer/collab-gateway-contract";
import { t } from "../i18n";

/** Human-readable values shared by the comparison sidebar's change descriptions. */
export function formatComparisonValue(
  value: unknown,
  valueType: UnitComparisonContextChange["valueType"] = "unknown",
  semantic?: { readonly entityType: string; readonly path: readonly string[] },
): string {
  if (value === undefined) return "∅";
  if (value === null) return "null";
  if (semantic) {
    const label = t().diff.changeValue(semantic.entityType, semantic.path, value);
    if (label !== undefined) return label;
  }
  if (valueType === "boolean" && typeof value === "boolean") {
    return value ? t().diff.checkboxState.checked : t().diff.checkboxState.unchecked;
  }
  if (typeof value === "string") {
    if (valueType !== "text" && valueType !== "formula" && /^[{[]/u.test(value.trim())) {
      try {
        return formatComparisonValue(JSON.parse(value) as unknown, valueType, semantic);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return t().diff.itemCount(value.length);
  const record = asRecord(value);
  if (record === undefined) return String(value);
  const primitive = [record.rgb, record.v, record.value, record.text].find(
    (candidate) => typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean"
  );
  return primitive === undefined ? t().diff.propertyCount(Object.keys(record).length) : String(primitive);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
