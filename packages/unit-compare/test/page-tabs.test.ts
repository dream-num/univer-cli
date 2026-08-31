import { describe, expect, it } from "vitest";
import { buildChangedSlidePages, type UnitStructuralDiffItem } from "../src/index.js";

function pageItem(stableId: string, kind: UnitStructuralDiffItem["kind"]): UnitStructuralDiffItem {
  return {
    id: `${stableId}:${kind}`,
    stableId,
    category: "slide",
    entityType: "slide",
    kind,
    path: ["slides", stableId],
    label: stableId,
    moved: false,
    changes: [],
    position: { left: null, right: null },
    values: {},
  };
}

describe("SDK-driven Slide tabs", () => {
  const left = {
    slideOrder: ["removed", "changed", "equal"],
    slides: {
      removed: { name: "Old" },
      changed: { name: "Plan" },
      equal: { name: "Appendix" },
    },
  };
  const right = {
    slideOrder: ["changed", "new", "equal"],
    slides: {
      changed: { name: "Updated plan" },
      new: { name: "Launch" },
      equal: { name: "Appendix" },
    },
  };

  it("does not infer content differences when the SDK reports none", () => {
    expect(buildChangedSlidePages({ left, right, items: [] })).toEqual([]);
  });

  it("keeps removed and added pages navigable around common anchors", () => {
    expect(
      buildChangedSlidePages({
        left,
        right,
        items: [
          pageItem("removed", "delete"),
          pageItem("changed", "update"),
          pageItem("new", "insert"),
        ],
      }),
    ).toEqual([
      { id: "removed", label: "Old", status: "delete" },
      { id: "changed", label: "Updated plan", status: "update" },
      { id: "new", label: "Launch", status: "insert" },
    ]);
  });

  it("shows the containing page for an SDK element change", () => {
    const item = {
      ...pageItem("shape", "update"),
      category: "slide-element:changed",
      entityType: "slide-element",
      parentStableId: "changed",
    };
    expect(buildChangedSlidePages({ left, right, items: [item] })).toEqual([
      { id: "changed", label: "Updated plan", status: "update" },
    ]);
  });
});
