import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExchangeFormat } from "@univerjs-pro/exchange-node";
import {
  BaseFieldType,
  BaseViewType,
  CellValueType,
  LocaleType,
  UniverInstanceType,
  type IWorkbookData,
} from "@univerjs/core";
import { describe, expect, it } from "vitest";
import {
  exchangeImportFormatOverride,
  exportOfficeFile,
  importOfficeFile,
} from "../src/features/exchange/exchange-node.js";

describe("Exchange Node application adapter", () => {
  it.each([
    [UniverInstanceType.UNIVER_SHEET, ExchangeFormat.XLSX, "sheet.xlsx", workbookData()],
    [UniverInstanceType.UNIVER_BASE, ExchangeFormat.XLSX, "base.xlsx", baseData()],
    [UniverInstanceType.UNIVER_DOC, ExchangeFormat.DOCX, "doc.docx", documentData()],
    [UniverInstanceType.UNIVER_SLIDE, ExchangeFormat.PPTX, "slide.pptx", slideData()],
  ] as const)(
    "round-trips Unit type %s through Exchange Node",
    async (type, format, name, data) => {
      const directory = await mkdtemp(join(tmpdir(), "exchange-node-roundtrip-"));
      const outputPath = join(directory, name);
      try {
        await exportOfficeFile({ data: data as never, format, outputPath, unitType: type });
        expect((await stat(outputPath)).size).toBeGreaterThan(0);
        const imported = await importOfficeFile({ sourcePath: outputPath, unitType: type });
        expect(imported).toBeDefined();
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    },
  );

  it("preserves the forced formula calculation default", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exchange-node-formula-"));
    const outputPath = join(directory, "formula.xlsx");
    const workbook = workbookData();
    workbook.sheets["sheet-1"]!.cellData = { 0: { 0: { f: "=1+1", v: 99 } } };
    try {
      await exportOfficeFile({
        data: workbook,
        format: ExchangeFormat.XLSX,
        outputPath,
        unitType: UniverInstanceType.UNIVER_SHEET,
      });
      const imported = (await importOfficeFile({
        formulaCalculationMode: "no",
        sourcePath: outputPath,
        unitType: UniverInstanceType.UNIVER_SHEET,
      })) as IWorkbookData;
      const cell = imported.sheets[imported.sheetOrder[0]!]!.cellData?.[0]?.[0];
      expect(cell).toMatchObject({ f: "=1+1", v: "2" });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("requires a matching selector for delimited export", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exchange-node-csv-"));
    const outputPath = join(directory, "sheet.csv");
    const input = {
      data: workbookData(),
      format: ExchangeFormat.CSV,
      outputPath,
      unitType: UniverInstanceType.UNIVER_SHEET,
    } as const;
    try {
      await expect(exportOfficeFile(input)).rejects.toMatchObject({ code: "invalid-input" });
      await exportOfficeFile({ ...input, sheetName: "Sheet 1" });
      expect(await readFile(outputPath, "utf8")).toContain("A1");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("maps compatible macro-enabled and presentation suffixes explicitly", () => {
    expect(exchangeImportFormatOverride(".xlsm")).toBe(ExchangeFormat.XLSX);
    expect(exchangeImportFormatOverride(".pptm")).toBe(ExchangeFormat.PPTX);
    expect(exchangeImportFormatOverride(".ppsx")).toBe(ExchangeFormat.PPTX);
    expect(exchangeImportFormatOverride(".xlsx")).toBeUndefined();
  });

  it("keeps converter failures on the existing error vocabulary", async () => {
    await expect(
      importOfficeFile({
        sourcePath: "/definitely-missing/exchange.xlsx",
        unitType: UniverInstanceType.UNIVER_SHEET,
      }),
    ).rejects.toMatchObject({ code: "conversion-failed" });
  });
});

function workbookData(): IWorkbookData {
  return {
    appVersion: "",
    id: "sheet-unit",
    locale: LocaleType.EN_US,
    name: "Workbook",
    resources: [],
    rev: 1,
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        cellData: { 0: { 0: { v: "A1" } } },
        columnCount: 10,
        id: "sheet-1",
        name: "Sheet 1",
        rowCount: 20,
      },
    },
    styles: {},
  };
}

function documentData(): object {
  return {
    body: {
      dataStream: "Document\r\n",
      paragraphs: [{ paragraphId: "paragraph-1", startIndex: 8 }],
      sectionBreaks: [{ sectionId: "section-1", startIndex: 9 }],
      textRuns: [],
    },
    documentStyle: {},
    id: "doc-1",
    resources: [],
    rev: 1,
    title: "Document",
  };
}

function baseData(): object {
  return {
    createdAt: 0,
    id: "base-1",
    name: "Base",
    rev: 1,
    schemaVersion: 1,
    tableOrder: ["table-1"],
    tables: {
      "table-1": {
        cellData: {
          0: {
            0: { t: CellValueType.STRING, v: "record-1" },
            1: { t: CellValueType.STRING, v: "Task" },
          },
        },
        colId: { 0: "__record_id", 1: "title" },
        colIndex: { __record_id: 0, title: 1 },
        fieldOrder: ["__record_id", "title"],
        fields: {
          __record_id: {
            config: {},
            id: "__record_id",
            name: "record-id",
            readonly: true,
            system: true,
            type: BaseFieldType.RecordId,
          },
          title: {
            config: {},
            id: "title",
            name: "Title",
            type: BaseFieldType.Text,
          },
        },
        id: "table-1",
        name: "Tasks",
        primaryFieldId: "title",
        recordOrder: ["record-1"],
        records: {
          "record-1": {
            createdAt: 1,
            id: "record-1",
            orderKey: "a0",
            updatedAt: 1,
            values: { __record_id: "record-1", title: "Task" },
          },
        },
        rowId: { 0: "record-1" },
        rowIndex: { "record-1": 0 },
        viewOrder: ["grid"],
        views: {
          grid: {
            config: {},
            id: "grid",
            name: "Grid",
            tableId: "table-1",
            type: BaseViewType.Grid,
          },
        },
      },
    },
    updatedAt: 0,
  };
}

function slideData(): object {
  return {
    activeSlideId: "",
    appVersion: "",
    defaultPageSize: { height: 540, width: 960 },
    id: "slide-1",
    locale: LocaleType.EN_US,
    name: "Slide",
    resources: [],
    rev: 1,
    slideOrder: [],
    slides: {},
  };
}
