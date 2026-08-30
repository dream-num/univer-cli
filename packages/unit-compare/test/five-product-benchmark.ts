import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType,
} from "@univer/collab-gateway-contract";
import type { IWorkbookData } from "@univerjs/core";
import { prepareUnitComparisonContext, queryPreparedUnitComparisonContext } from "../src/index.js";

interface Scale {
  readonly name: "medium" | "large";
  readonly sheetRows: number;
  readonly docParagraphs: number;
  readonly slidePages: number;
  readonly baseRecords: number;
  readonly boardElements: number;
}

interface BenchmarkResult {
  readonly scale: Scale["name"];
  readonly product: string;
  readonly sourceEntities: number;
  readonly changes: number;
  readonly prepareMs: number;
  readonly prepareSamplesMs: readonly number[];
  readonly queryMs: number;
  readonly serializeMs: number;
  readonly pageBytes: number;
  readonly heapDeltaMb: number;
}

const scales: readonly Scale[] = [
  {
    name: "medium",
    sheetRows: 2_000,
    docParagraphs: 5_000,
    slidePages: 100,
    baseRecords: 500,
    boardElements: 5_000,
  },
  {
    name: "large",
    sheetRows: 10_000,
    docParagraphs: 25_000,
    slidePages: 500,
    baseRecords: 2_500,
    boardElements: 25_000,
  },
];

const results: BenchmarkResult[] = [];
for (const scale of scales) {
  const cases = benchmarkCases(scale);
  for (const benchmarkCase of cases) {
    globalThis.gc?.();
    const beforeHeap = process.memoryUsage().heapUsed;
    const prepareSamplesMs: number[] = [];
    let prepared: ReturnType<typeof prepareUnitComparisonContext> | undefined;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const prepareStarted = performance.now();
      prepared = prepareUnitComparisonContext({
        comparisonId: `benchmark-${scale.name}-${benchmarkCase.product}`,
        unit: {
          unitId: `unit-${benchmarkCase.type}`,
          type: benchmarkCase.type,
          name: benchmarkCase.product,
          presence: "paired",
        },
        fidelity: "snapshot",
        stale: false,
        leftData: benchmarkCase.left,
        rightData: benchmarkCase.right,
      });
      prepareSamplesMs.push(rounded(performance.now() - prepareStarted));
    }
    if (prepared === undefined) throw new Error("benchmark did not prepare a context");
    const prepareMs = median(prepareSamplesMs);
    const queryStarted = performance.now();
    const page = queryPreparedUnitComparisonContext(prepared, {
      offset: Math.max(0, Math.floor(prepared.items.length / 2) - 50),
      limit: 100,
      includeValues: false,
    });
    const queryMs = performance.now() - queryStarted;
    const serializeStarted = performance.now();
    const serialized = JSON.stringify(page);
    const serializeMs = performance.now() - serializeStarted;
    results.push({
      scale: scale.name,
      product: benchmarkCase.product,
      sourceEntities: benchmarkCase.sourceEntities,
      changes: prepared.summary.total,
      prepareMs: rounded(prepareMs),
      prepareSamplesMs,
      queryMs: rounded(queryMs),
      serializeMs: rounded(serializeMs),
      pageBytes: Buffer.byteLength(serialized),
      heapDeltaMb: rounded((process.memoryUsage().heapUsed - beforeHeap) / 1024 / 1024),
    });
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  node: process.version,
  results,
};
const violations = results.flatMap((result) => {
  const prepareBudget =
    result.scale === "medium"
      ? 750
      : result.product === "doc" || result.product === "board"
        ? 2_000
        : 1_000;
  return [
    ...(result.prepareMs > prepareBudget
      ? [`${result.scale}/${result.product} prepare ${result.prepareMs}ms > ${prepareBudget}ms`]
      : []),
    ...(result.queryMs > 25
      ? [`${result.scale}/${result.product} query ${result.queryMs}ms > 25ms`]
      : []),
    ...(result.serializeMs > 25
      ? [`${result.scale}/${result.product} serialize ${result.serializeMs}ms > 25ms`]
      : []),
    ...(result.pageBytes > 131_072
      ? [`${result.scale}/${result.product} page ${result.pageBytes} bytes > 131072 bytes`]
      : []),
  ];
});
const outputFlag = process.argv.indexOf("--out");
if (outputFlag >= 0) {
  const candidate = process.argv[outputFlag + 1];
  if (candidate === undefined) throw new Error("--out requires a path");
  const outputPath = resolve(candidate);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--enforce") && violations.length > 0) {
  throw new Error(`Performance budget violations:\n${violations.join("\n")}`);
}

function benchmarkCases(scale: Scale) {
  const sheet = workbookPair(scale.sheetRows, 5);
  const doc = docPair(scale.docParagraphs);
  const slide = slidePair(scale.slidePages, 50);
  const base = basePair(scale.baseRecords, 4, 5);
  const board = boardPair(scale.boardElements);
  return [
    { product: "sheet", type: UNIT_TYPE_SHEET, ...sheet },
    { product: "doc", type: UNIT_TYPE_DOC, ...doc },
    { product: "slide", type: UNIT_TYPE_SLIDE, ...slide },
    { product: "base", type: UNIT_TYPE_BASE, ...base },
    { product: "board", type: UNIT_TYPE_BOARD, ...board },
  ] satisfies Array<{
    readonly product: string;
    readonly type: UnitType;
    readonly left: unknown;
    readonly right: unknown;
    readonly sourceEntities: number;
  }>;
}

function workbookPair(rows: number, columns: number) {
  const create = (changed: boolean): IWorkbookData => {
    const cellData: Record<number, Record<number, { v: string; t: number }>> = {};
    for (let row = 0; row < rows; row += 1) {
      cellData[row] = {};
      for (let column = 0; column < columns; column += 1) {
        cellData[row]![column] = {
          v:
            changed && (row * columns + column) % 10 === 0
              ? `changed-${row}-${column}`
              : `v-${row}-${column}`,
          t: 1,
        };
      }
    }
    return {
      appVersion: "benchmark",
      id: "sheet-unit",
      locale: "enUS",
      name: "Benchmark",
      resources: [],
      sheetOrder: ["sheet1"],
      sheets: {
        sheet1: { id: "sheet1", name: "Data", rowCount: rows, columnCount: columns, cellData },
      },
      styles: {},
    } as IWorkbookData;
  };
  return { left: create(false), right: create(true), sourceEntities: rows * columns };
}

function docPair(paragraphCount: number) {
  const create = (changed: boolean) => {
    const texts = Array.from({ length: paragraphCount }, (_, index) =>
      changed && index % 10 === 0 ? `Changed paragraph ${index}` : `Paragraph ${index}`,
    );
    let offset = -1;
    const paragraphs = texts.map((text, index) => {
      offset += text.length + 1;
      return { paragraphId: `p${index}`, startIndex: offset };
    });
    return {
      body: {
        dataStream: `${texts.join("\r")}\r\0`,
        paragraphs: [...paragraphs, { paragraphId: "sentinel", startIndex: offset + 1 }],
        textRuns: Array.from({ length: Math.ceil(paragraphCount / 10) }, (_, index) => ({
          st: paragraphs[index * 10]?.startIndex ?? 0,
          ed: (paragraphs[index * 10]?.startIndex ?? 0) + 1,
          ts: { bl: changed ? 1 : 0 },
        })),
      },
    };
  };
  return { left: create(false), right: create(true), sourceEntities: paragraphCount };
}

function slidePair(pageCount: number, elementsPerPage: number) {
  const create = (changed: boolean) => {
    const slideOrder = Array.from({ length: pageCount }, (_, index) => `page${index}`);
    return {
      slideOrder,
      slides: Object.fromEntries(
        slideOrder.map((pageId, pageIndex) => {
          const elementOrder = Array.from(
            { length: elementsPerPage },
            (_, elementIndex) => `${pageId}-element${elementIndex}`,
          );
          return [
            pageId,
            {
              id: pageId,
              elementOrder,
              elements: Object.fromEntries(
                elementOrder.map((id, elementIndex) => [
                  id,
                  {
                    id,
                    type: "shape",
                    text:
                      changed && (pageIndex * elementsPerPage + elementIndex) % 10 === 0
                        ? `changed-${id}`
                        : id,
                  },
                ]),
              ),
            },
          ];
        }),
      ),
    };
  };
  return {
    left: create(false),
    right: create(true),
    sourceEntities: pageCount * elementsPerPage,
  };
}

function basePair(recordCount: number, tableCount: number, fieldCount: number) {
  const create = (changed: boolean) => {
    const tableOrder = Array.from({ length: tableCount }, (_, index) => `table${index}`);
    return {
      id: "base-unit",
      name: "Benchmark Base",
      tableOrder,
      tables: Object.fromEntries(
        tableOrder.map((tableId, tableIndex) => {
          const fieldOrder = Array.from({ length: fieldCount }, (_, index) => `field${index}`);
          const recordOrder = Array.from({ length: recordCount }, (_, index) => `record${index}`);
          return [
            tableId,
            {
              id: tableId,
              fieldOrder,
              fields: Object.fromEntries(
                fieldOrder.map((id) => [id, { id, name: id, type: "text" }]),
              ),
              recordOrder,
              records: Object.fromEntries(
                recordOrder.map((recordId, recordIndex) => [
                  recordId,
                  {
                    id: recordId,
                    values: Object.fromEntries(
                      fieldOrder.map((fieldId, fieldIndex) => [
                        fieldId,
                        changed &&
                        (tableIndex * recordCount * fieldCount +
                          recordIndex * fieldCount +
                          fieldIndex) %
                          10 ===
                          0
                          ? `changed-${recordId}-${fieldId}`
                          : `${recordId}-${fieldId}`,
                      ]),
                    ),
                  },
                ]),
              ),
              viewOrder: [],
              views: {},
            },
          ];
        }),
      ),
    };
  };
  return {
    left: create(false),
    right: create(true),
    sourceEntities: recordCount * tableCount * fieldCount,
  };
}

function boardPair(elementCount: number) {
  const create = (changed: boolean) => {
    const elementOrder = Array.from({ length: elementCount }, (_, index) => `element${index}`);
    return {
      pageOrder: ["page1"],
      pages: {
        page1: {
          id: "page1",
          elementOrder,
          elements: Object.fromEntries(
            elementOrder.map((id, index) => [
              id,
              { id, type: "shape", text: changed && index % 10 === 0 ? `changed-${id}` : id },
            ]),
          ),
        },
      },
    };
  };
  return { left: create(false), right: create(true), sourceEntities: elementCount };
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}
