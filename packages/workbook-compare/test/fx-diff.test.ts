import { describe, expect, it } from "vitest";
import { buildWorkbookCompareFxDiffPanes, type WorkbookComparePaneFxState } from "../src/index.js";

function createFxState(input: {
  readonly displayValue?: string;
  readonly formula?: string;
}): WorkbookComparePaneFxState {
  return {
    activeCellLabel: "C4",
    displayValue: input.displayValue ?? "",
    formula: input.formula ?? "",
    selectionLabel: "C4",
  };
}

describe("workbook formula diff", () => {
  it("highlights formula tokens symmetrically", () => {
    const diff = buildWorkbookCompareFxDiffPanes({
      base: createFxState({ formula: "=SUM(A1:A3)" }),
      comparable: true,
      current: createFxState({ formula: "=SUM(A1:A4)" }),
    });

    expect(diff.base).toMatchObject({
      kind: "formula",
      segments: [
        { kind: "equal", text: "=SUM(A1:" },
        { kind: "delete", text: "A3" },
        { kind: "equal", text: ")" },
      ],
    });
    expect(diff.current).toMatchObject({
      kind: "formula",
      segments: [
        { kind: "equal", text: "=SUM(A1:" },
        { kind: "insert", text: "A4" },
        { kind: "equal", text: ")" },
      ],
    });
  });

  it("falls back to a value diff when neither side has a formula", () => {
    const diff = buildWorkbookCompareFxDiffPanes({
      base: createFxState({ displayValue: "North 2025" }),
      comparable: true,
      current: createFxState({ displayValue: "North 2026" }),
    });

    expect(diff.base.kind).toBe("value");
    expect(diff.base.segments).toContainEqual({ kind: "delete", text: "2025" });
    expect(diff.current.segments).toContainEqual({ kind: "insert", text: "2026" });
  });

  it("does not create misleading token highlights when content kinds differ", () => {
    const diff = buildWorkbookCompareFxDiffPanes({
      base: createFxState({ formula: "=A1" }),
      comparable: true,
      current: createFxState({ displayValue: "12" }),
    });

    expect(diff.base).toMatchObject({ kind: "formula", segments: null, text: "=A1" });
    expect(diff.current).toMatchObject({ kind: "value", segments: null, text: "12" });
  });
});
