import type { IDocumentData, IWorkbookData } from "@univerjs/core";
import {
  DocumentFlavor,
  getSheetsEmptySnapshot,
  LocaleType,
  mergeWorksheetSnapshotWithDefault,
  UniverInstanceType,
} from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { unitAdapter } from "../src/univer/unit-types.js";

describe("Unit type defaults", () => {
  it("creates a usable Sheet from the SDK Workbook and Worksheet defaults", () => {
    const data = unitAdapter(UniverInstanceType.UNIVER_SHEET).defaultData(
      "workbook-1",
      "Untitled spreadsheet",
    ) as IWorkbookData;

    expect(data).toEqual({
      ...getSheetsEmptySnapshot("workbook-1", LocaleType.EN_US, "Untitled spreadsheet"),
      sheetOrder: ["sheet-1"],
      sheets: {
        "sheet-1": mergeWorksheetSnapshotWithDefault({
          id: "sheet-1",
          name: "Sheet1",
          rowCount: 1000,
          columnCount: 26,
        }),
      },
    });
    expect(data.sheets?.["sheet-1"]).toMatchObject({
      freeze: { xSplit: 0, ySplit: 0, startRow: -1, startColumn: -1 },
      rowHeader: { width: 46, hidden: 0 },
      columnHeader: { height: 20, hidden: 0 },
    });
  });

  it("creates Docs with SDK-valid paragraph IDs", () => {
    const data = unitAdapter(UniverInstanceType.UNIVER_DOC).defaultData(
      "doc-1",
      "Untitled document",
    ) as IDocumentData;

    expect(data.id).toBe("doc-1");
    expect(data.title).toBe("Untitled document");
    expect(data.documentStyle?.documentFlavor).toBe(DocumentFlavor.MODERN);
    expect(data.body?.paragraphs).toEqual([
      expect.objectContaining({ startIndex: 0, paragraphId: expect.stringMatching(/^para_/) }),
    ]);
  });
});
