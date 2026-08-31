import type { IWorkbookData } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import {
  buildWorkbookCompareModel,
  mapSelectionTargetAcrossPanes,
  mapScrollTargetAcrossPanes,
} from "../src/index.js";

describe("Sheet presentation boundary", () => {
  it("does not infer a semantic change from snapshots absent SDK items", () => {
    const left = { name: "Before", sheetOrder: [], sheets: {} } as unknown as IWorkbookData;
    const right = { name: "After", sheetOrder: [], sheets: {} } as unknown as IWorkbookData;
    const model = buildWorkbookCompareModel({
      baseSnapshot: left,
      targetSnapshot: right,
      compareInfo: { worksheets: {}, workbookItems: [], snapshotAlignmentDegraded: false },
    });
    expect(model.items).toEqual([]);
    expect(model.summary.hasChanges).toBe(false);
    expect(model.displayedSnapshots.base).toBe(left);
    expect(model.displayedSnapshots.current).toBe(right);
  });

  it("preserves native coordinates when the SDK has no mapping for the sheet", () => {
    const compareInfo = { worksheets: {}, workbookItems: [], snapshotAlignmentDegraded: false };
    const range = { sheetId: "sheet", startRow: 10, endRow: 20, startColumn: 3, endColumn: 4 };
    const scroll = {
      sheetId: "sheet",
      sheetViewStartRow: 10,
      sheetViewStartColumn: 3,
      offsetX: 12,
      offsetY: 5,
    };
    expect(
      mapSelectionTargetAcrossPanes({ compareInfo, sourceRole: "base", target: range }),
    ).toEqual(range);
    expect(
      mapScrollTargetAcrossPanes({ compareInfo, sourceRole: "current", target: scroll }),
    ).toEqual(scroll);
  });
});
