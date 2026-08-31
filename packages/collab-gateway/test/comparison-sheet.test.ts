import type { IWorkbookData } from "@univerjs/core";
import { LocaleType, UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { compareContext } from "./helpers/comparison-context.js";

function workbook(values: readonly string[] = ["Header", "Alpha", "Omega"], axis: "row" | "column" = "row"): IWorkbookData {
  return {
    id: "book", name: "Budget", appVersion: "test", locale: LocaleType.EN_US,
    styles: {}, sheetOrder: ["sheet"], resources: [],
    sheets: { sheet: {
      id: "sheet", name: "Main", rowCount: axis === "row" ? values.length : 3,
      columnCount: axis === "column" ? values.length : 3, defaultRowHeight: 24,
      cellData: axis === "row"
        ? Object.fromEntries(values.map((v, row) => [row, { 0: { v } }]))
        : { 0: Object.fromEntries(values.map((v, column) => [column, { v }])) },
    } },
  };
}

function compare(left: IWorkbookData, right: IWorkbookData, leftChangesets: readonly unknown[] = [], rightChangesets: readonly unknown[] = []) {
  return compareContext({
    comparisonId: "sheet-regression", unit: { unitId: "book", name: "Budget", type: UniverInstanceType.UNIVER_SHEET, presence: "paired" },
    fidelity: leftChangesets.length + rightChangesets.length > 0 ? "history" : "snapshot",
    stale: false, leftData: left, rightData: right, leftChangesets, rightChangesets,
  });
}

function mutation(id: string, start: number, axis: "row" | "column" = "row") {
  return { mutations: [{ id, data: JSON.stringify({ subUnitId: "sheet", range: axis === "row" ? { startRow: start, endRow: start } : { startColumn: start, endColumn: start } }) }] };
}

function cells(result: ReturnType<typeof compare>) {
  return result.items.filter((item) => item.entityType === "cell");
}

describe("SDK Sheet regression contract", () => {
  it("classifies values, formulas, resolved styles and workbook names without coloring source snapshots", () => {
    const left = workbook(["10"]);
    const right = workbook(["12"]);
    left.sheets.sheet!.cellData![0]![0] = { v: "10", f: "=A2", s: "before" };
    right.sheets.sheet!.cellData![0]![0] = { v: "12", f: "=A3", s: "after" };
    left.styles = { before: { bg: { rgb: "#ffffff" } } };
    right.styles = { after: { bg: { rgb: "#f8fafc" } } };
    right.name = "Budget 2026";
    const original = JSON.stringify([left, right]);
    const result = compare(left, right);
    expect(cells(result)).toHaveLength(1);
    expect(cells(result)[0]).toMatchObject({ kind: "update", locations: { left: { stableId: "A1" }, right: { stableId: "A1" } } });
    expect(cells(result)[0]!.changes.map((change) => change.path[0])).toEqual(expect.arrayContaining(["value", "formula", "style"]));
    expect(result.items.find((item) => item.entityType === "workbook")?.changes).toContainEqual(expect.objectContaining({ path: ["name"], before: "Budget", after: "Budget 2026" }));
    expect(JSON.stringify([left, right])).toBe(original);
  });

  it("compares rich text by native content rather than object coercion or key order", () => {
    const left = workbook();
    const right = workbook();
    left.sheets.sheet!.cellData = { 0: { 0: { p: { id: "rich", body: { dataStream: "Plan A\r\n", textRuns: [] } } } } };
    right.sheets.sheet!.cellData = { 0: { 0: { p: { body: { textRuns: [], dataStream: "Plan A\r\n" }, id: "rich" } } } };
    expect(cells(compare(left, right))).toEqual([]);
    right.sheets.sheet!.cellData[0]![0]!.p!.body!.dataStream = "Plan B\r\n";
    const result = cells(compare(left, right));
    expect(result).toHaveLength(1);
    expect(JSON.stringify(result)).toContain("Plan A");
    expect(JSON.stringify(result)).toContain("Plan B");
    expect(JSON.stringify(result)).not.toContain("[object Object]");
  });

  it("does not duplicate history-backed worksheet additions or removals", () => {
    const left = workbook();
    const right = structuredClone(left);
    right.sheetOrder.push("extra");
    right.sheets.extra = { id: "extra", name: "Extra", rowCount: 3, columnCount: 3, cellData: {} };
    const insertion = { mutations: [{ id: "sheet.mutation.insert-sheet", data: { sheet: right.sheets.extra } }] };
    for (const [before, after, changes, kind] of [[left, right, [insertion], "insert"], [right, left, [{ mutations: [{ id: "sheet.mutation.remove-sheet", data: { subUnitId: "extra" } }] }], "delete"]] as const) {
      expect(compare(before, after, [], changes).items.filter((item) => item.entityType === "worksheet" && item.stableId === "extra")).toEqual([expect.objectContaining({ kind })]);
    }
  });

  it.each(["row", "column"] as const)("preserves native cell locations across %s insertion history in both directions", (axis) => {
    const left = workbook(undefined, axis);
    const right = workbook(["Header", "Middle", "Alpha", "Omega"], axis);
    const change = mutation(axis === "row" ? "sheet.mutation.insert-row" : "sheet.mutation.insert-col", 1, axis);
    const forward = cells(compare(left, right, [], [change]));
    const reverse = cells(compare(right, left, [change], []));
    expect(forward).toEqual([expect.objectContaining({ kind: "insert", locations: { left: null, right: expect.objectContaining({ stableId: axis === "row" ? "A2" : "B1" }) } })]);
    expect(reverse).toEqual([expect.objectContaining({ kind: "delete", locations: { right: null, left: forward[0]!.locations.right } })]);
  });

  it("reconciles both histories while retaining independently inserted rows", () => {
    const left = workbook(["Header", "Left", "Alpha", "Omega"]);
    const right = workbook(["Header", "Alpha", "Right", "Omega"]);
    const result = cells(compare(left, right, [mutation("sheet.mutation.insert-row", 1)], [mutation("sheet.mutation.insert-row", 2)]));
    expect(result.map((item) => item.kind).sort()).toEqual(["delete", "insert"]);
    expect(result.find((item) => item.kind === "delete")?.locations.left?.stableId).toBe("A2");
    expect(result.find((item) => item.kind === "insert")?.locations.right?.stableId).toBe("A3");
  });

  it.each(["row", "column"] as const)("content-aligns snapshot-only middle %s changes symmetrically", (axis) => {
    const left = workbook(undefined, axis);
    const right = workbook(["Header", "Middle", "Alpha", "Omega"], axis);
    const forward = cells(compare(left, right));
    const reverse = cells(compare(right, left));
    expect(forward).toEqual([expect.objectContaining({ kind: "insert", locations: { left: null, right: expect.objectContaining({ stableId: axis === "row" ? "A2" : "B1" }) } })]);
    expect(reverse).toEqual([expect.objectContaining({ kind: "delete", locations: { right: null, left: forward[0]!.locations.right } })]);
  });

  it("keeps sparse snapshot alignment bounded and reports its ambiguous identity", () => {
    const left = workbook();
    const right = workbook();
    for (const [book, count] of [[left, 25_000], [right, 25_001]] as const) {
      book.sheets.sheet!.rowCount = count;
      book.sheets.sheet!.cellData = { 0: { 0: { v: "first" } }, [count - 1]: { 0: { v: "last" } } };
    }
    const started = performance.now();
    const result = compare(left, right);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(result.diagnostics.readiness).toBe("degraded");
    expect(result.productContext.kind).toBe("sheet");
    if (result.productContext.kind === "sheet") expect(result.productContext.sheets[0]!.rows.length).toBeLessThan(10);
  });

  it("keeps resource ranges independent for moved, deleted and added rules", () => {
    const before = { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 };
    const after = { startRow: 3, endRow: 3, startColumn: 2, endColumn: 2 };
    const source = (range: typeof before | null) => ({ ...workbook(), resources: range === null ? [] : [{ name: "SHEET_DATA_VALIDATION_PLUGIN", data: JSON.stringify({ sheet: { rule: { id: "rule", name: "Review rule", ranges: [range] } } }) }] });
    const moved = compare(source(before), source(after)).items.find((item) => item.entityType === "data-validation")!;
    expect(moved).toMatchObject({ parentStableId: "sheet", displayName: "Review rule", locations: { left: { target: { ranges: [before] } }, right: { target: { ranges: [after] } } } });
    expect(compare(source(before), source(null)).items.find((item) => item.entityType === "data-validation")?.locations).toEqual({ left: moved.locations.left, right: null });
    expect(compare(source(null), source(after)).items.find((item) => item.entityType === "data-validation")?.locations).toEqual({ left: null, right: moved.locations.right });
  });

  it("exposes formula and value segments from the SDK without treating formulas as literal values", () => {
    const left = workbook(["North 2025"]);
    const right = workbook(["North 2026"]);
    const value = cells(compare(left, right))[0]!.changes.find((change) => change.path[0] === "value")!;
    expect(value.segments?.left).toContainEqual(expect.objectContaining({ kind: "delete", text: "5" }));
    expect(value.segments?.right).toContainEqual(expect.objectContaining({ kind: "insert", text: "6" }));
    left.sheets.sheet!.cellData![0]![0] = { f: "=SUM(A1:A3)" };
    right.sheets.sheet!.cellData![0]![0] = { f: "=SUM(A1:A4)" };
    const formula = cells(compare(left, right))[0]!.changes.find((change) => change.path[0] === "formula")!;
    expect(formula.segments?.left?.map((segment) => segment.text).join("")).toBe("=SUM(A1:A3)");
    expect(formula.segments?.right?.map((segment) => segment.text).join("")).toBe("=SUM(A1:A4)");
    expect(formula.segments?.left).toContainEqual(expect.objectContaining({ kind: "delete", text: "A3" }));
    expect(formula.segments?.right).toContainEqual(expect.objectContaining({ kind: "insert", text: "A4" }));
    right.sheets.sheet!.cellData![0]![0] = { v: 12 };
    const mixed = cells(compare(left, right))[0]!.changes;
    expect(mixed.find((change) => change.path[0] === "formula")).toMatchObject({ kind: "delete" });
    expect(mixed.find((change) => change.path[0] === "value")).toMatchObject({ kind: "insert" });
  });
});
