import type { WorkbookCompareChangeset, WorkbookCompareMutation } from "./index.js";

export interface ProtocolWorkbookCompareMutation {
  readonly id: string;
  readonly data: string | object;
}

export interface ProtocolWorkbookCompareChangeset {
  readonly mutations?: readonly ProtocolWorkbookCompareMutation[];
}

export interface BuildSymmetricWorkbookCompareChangesetsInput {
  readonly fidelity: "history" | "snapshot";
  /** Common-baseline -> pinned left head. */
  readonly leftChangesets: readonly ProtocolWorkbookCompareChangeset[];
  /** Common-baseline -> pinned right head. */
  readonly rightChangesets: readonly ProtocolWorkbookCompareChangeset[];
}

const INVERSE_AXIS_MUTATION_ID: Readonly<Record<string, string>> = {
  "sheet.mutation.insert-row": "sheet.mutation.remove-row",
  "sheet.mutation.remove-row": "sheet.mutation.insert-row",
  "sheet.mutation.remove-rows": "sheet.mutation.insert-row",
  "sheet.mutation.insert-col": "sheet.mutation.remove-col",
  "sheet.mutation.remove-col": "sheet.mutation.insert-col",
};

const STRUCTURAL_MUTATION_IDS = new Set([
  ...Object.keys(INVERSE_AXIS_MUTATION_ID),
  "sheet.mutation.insert-sheet",
  "sheet.mutation.remove-sheet",
  "sheet.mutation.move-rows",
  "sheet.mutation.move-cols",
  "sheet.mutation.move-columns",
]);
const STRUCTURAL_MUTATION_NAME =
  /(?:^|\.)(?:insert|remove|delete|move|reorder)-(?:(?:row|rows|col|cols|column|columns)(?:-|$)|(?:sheet|sheets)$)/iu;

/**
 * Derive coordinate hints for the legacy one-way compare core without replaying synthetic data.
 * Conceptually the hints walk pinned-left -> common baseline -> pinned-right. Final cell/style
 * values always come from the two materialized snapshots, never from this derived stream.
 */
export function buildSymmetricWorkbookCompareChangesets(
  input: BuildSymmetricWorkbookCompareChangesetsInput,
): WorkbookCompareChangeset[] {
  if (input.fidelity !== "history") return [];

  const left = flattenProtocolMutations(input.leftChangesets)
    .reverse()
    .flatMap((mutation) => {
      const inverted = invertStructuralMutation(mutation);
      return inverted === null ? [] : [inverted];
    });
  const right = flattenProtocolMutations(input.rightChangesets).flatMap((mutation) => {
    if (!STRUCTURAL_MUTATION_IDS.has(mutation.mutationId)) return [];
    return [normalizeStructuralMutation(mutation)];
  });
  return [...left, ...right].map((mutation, streamOrder) => ({
    mutations: [mutation],
    streamOrder,
  }));
}

function normalizeStructuralMutation(mutation: WorkbookCompareMutation): WorkbookCompareMutation {
  return mutation.mutationId === "sheet.mutation.remove-rows"
    ? { ...mutation, mutationId: "sheet.mutation.remove-row" }
    : mutation;
}

/**
 * Report history mutations that look coordinate-changing but are not yet understood by the
 * symmetric hint builder. Ordinary value/style mutations are snapshot-diffed and intentionally do
 * not degrade readiness.
 */
export function collectUnsupportedStructuralMutationIds(
  input: BuildSymmetricWorkbookCompareChangesetsInput,
): string[] {
  if (input.fidelity !== "history") return [];
  return [
    ...new Set(
      flattenProtocolMutations([...input.leftChangesets, ...input.rightChangesets])
        .map((mutation) => mutation.mutationId)
        .filter(
          (mutationId) =>
            !STRUCTURAL_MUTATION_IDS.has(mutationId) && STRUCTURAL_MUTATION_NAME.test(mutationId),
        ),
    ),
  ].sort();
}

function flattenProtocolMutations(
  changesets: readonly ProtocolWorkbookCompareChangeset[],
): WorkbookCompareMutation[] {
  return changesets.flatMap((changeset) =>
    (changeset.mutations ?? []).map((mutation) => ({
      mutationId: mutation.id,
      params: decodeParams(mutation.data),
    })),
  );
}

function decodeParams(data: string | object): Record<string, unknown> {
  if (typeof data !== "string") return data as Record<string, unknown>;
  const value = JSON.parse(data) as unknown;
  return isRecord(value) ? value : {};
}

function invertStructuralMutation(
  mutation: WorkbookCompareMutation,
): WorkbookCompareMutation | null {
  const inverseAxisId = INVERSE_AXIS_MUTATION_ID[mutation.mutationId];
  if (inverseAxisId !== undefined) {
    return { mutationId: inverseAxisId, params: mutation.params };
  }
  if (mutation.mutationId === "sheet.mutation.insert-sheet") {
    const sheet = isRecord(mutation.params.sheet) ? mutation.params.sheet : undefined;
    return typeof sheet?.id === "string"
      ? {
          mutationId: "sheet.mutation.remove-sheet",
          params: { subUnitId: sheet.id },
        }
      : null;
  }
  if (
    mutation.mutationId === "sheet.mutation.move-rows" ||
    mutation.mutationId === "sheet.mutation.move-cols" ||
    mutation.mutationId === "sheet.mutation.move-columns"
  ) {
    return invertMoveMutation(mutation);
  }
  // A removed sheet's full data is not present in the mutation. Snapshot diffing still reports
  // its mirrored presence; do not fabricate an insert-sheet payload.
  return null;
}

function invertMoveMutation(mutation: WorkbookCompareMutation): WorkbookCompareMutation | null {
  const sourceRange = isRange(mutation.params.sourceRange) ? mutation.params.sourceRange : null;
  const targetRange = isRange(mutation.params.targetRange) ? mutation.params.targetRange : null;
  if (sourceRange === null || targetRange === null) return null;
  const row = mutation.mutationId === "sheet.mutation.move-rows";
  const sourceStart = row ? sourceRange.startRow : sourceRange.startColumn;
  const sourceEnd = row ? sourceRange.endRow : sourceRange.endColumn;
  const targetStart = row ? targetRange.startRow : targetRange.startColumn;
  const count = sourceEnd - sourceStart + 1;
  const movingBackward = sourceStart > targetStart;
  const inverseSource = movingBackward
    ? { ...targetRange }
    : row
      ? {
          ...targetRange,
          startRow: targetRange.startRow - count,
          endRow: targetRange.endRow - count,
        }
      : {
          ...targetRange,
          startColumn: targetRange.startColumn - count,
          endColumn: targetRange.endColumn - count,
        };
  const inverseTarget = movingBackward
    ? row
      ? {
          ...sourceRange,
          startRow: sourceRange.startRow + count,
          endRow: sourceRange.endRow + count,
        }
      : {
          ...sourceRange,
          startColumn: sourceRange.startColumn + count,
          endColumn: sourceRange.endColumn + count,
        }
    : { ...sourceRange };
  return {
    mutationId:
      mutation.mutationId === "sheet.mutation.move-columns"
        ? "sheet.mutation.move-cols"
        : mutation.mutationId,
    params: { ...mutation.params, sourceRange: inverseSource, targetRange: inverseTarget },
  };
}

interface RangeRecord extends Record<string, unknown> {
  readonly startRow: number;
  readonly endRow: number;
  readonly startColumn: number;
  readonly endColumn: number;
}

function isRange(value: unknown): value is RangeRecord {
  return (
    isRecord(value) &&
    typeof value.startRow === "number" &&
    typeof value.endRow === "number" &&
    typeof value.startColumn === "number" &&
    typeof value.endColumn === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
