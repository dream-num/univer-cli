import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType
} from "@univer/collab-gateway-contract";
import type { IWorkbookData } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import {
  prepareGatewayUnitComparison,
  queryGatewayUnitComparison
} from "../src/comparison/unit-comparison-runtime.js";
import { compareContext } from "./helpers/comparison-context.js";

describe("agent-facing comparison context", () => {
  it("normalizes all five products into stable paths", () => {
    const sheet = context(UNIT_TYPE_SHEET, workbook("before"), workbook("after"));
    const doc = context(
      UNIT_TYPE_DOC,
      docSnapshot("Before", "p1"),
      docSnapshot("After", "p1")
    );
    const slide = context(
      UNIT_TYPE_SLIDE,
      slideSnapshot({ shape1: { id: "shape1", x: 1 } }),
      slideSnapshot({ shape1: { id: "shape1", x: 2 } })
    );
    const base = context(UNIT_TYPE_BASE, baseSnapshot("Before"), baseSnapshot("After"));
    const board = context(
      UNIT_TYPE_BOARD,
      { elements: { note1: { id: "note1", text: "Before" } } },
      { elements: { note1: { id: "note1", text: "After" } } }
    );

    expect(sheet.items[0]).toMatchObject({
      entityType: "cell",
      kind: "update",
      stableId: "A1",
      path: ["cell", "sheet1", "A1"]
    });
    expect(doc.items[0]).toMatchObject({
      entityType: "paragraph",
      path: ["paragraph", "p1"]
    });
    expect(slide.items[0]).toMatchObject({
      entityType: "slide-element",
      path: ["slide-element", "page1", "shape1"]
    });
    expect(base.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "cell",
          path: ["cell", "table1", "record1:field1"]
        })
      ])
    );
    expect(board.items[0]).toMatchObject({
      entityType: "board-element",
      locations: { left: expect.objectContaining({ stableId: "note1" }) }
    });
  });

  it("keeps Base navigation on business fields", () => {
    const left = baseSnapshot("Draft");
    const right = baseSnapshot("Ready");
    left.tables.table1.records.record1.updatedAt = 1;
    right.tables.table1.records.record1.updatedAt = 2;

    const result = context(UNIT_TYPE_BASE, left, right);

    expect(result.items).toEqual([
      expect.objectContaining({
        entityType: "cell",
        stableId: "record1:field1",
        changes: [expect.objectContaining({ path: [], before: "Draft", after: "Ready" })]
      })
    ]);
    expect(JSON.stringify(result.items)).not.toContain("updatedAt");
  });

  it("mirrors insert/delete locations and update values", () => {
    const left = slideSnapshot({ existing: { id: "existing", x: 1 } });
    const right = slideSnapshot({
      existing: { id: "existing", x: 2 },
      inserted: { id: "inserted", x: 3 }
    });
    const forward = context(UNIT_TYPE_SLIDE, left, right);
    const reverse = context(UNIT_TYPE_SLIDE, right, left);
    const forwardInsert = forward.items.find(
      (item) => item.locations.right?.stableId === "inserted"
    );
    const reverseDelete = reverse.items.find(
      (item) => item.locations.left?.stableId === "inserted"
    );
    const forwardUpdate = forward.items.find(
      (item) => item.locations.left?.stableId === "existing"
    );
    const reverseUpdate = reverse.items.find(
      (item) => item.locations.left?.stableId === "existing"
    );

    expect(forwardInsert).toMatchObject({ kind: "insert", locations: { left: null } });
    expect(reverseDelete).toMatchObject({ kind: "delete", locations: { right: null } });
    expect(forwardInsert?.path).toEqual(reverseDelete?.path);
    expect(forwardUpdate).toMatchObject({ kind: "update" });
    expect(reverseUpdate?.values?.left).toEqual(forwardUpdate?.values?.right);
    expect(reverseUpdate?.values?.right).toEqual(forwardUpdate?.values?.left);
  });

  it("filters, searches, pages, and omits values", () => {
    const result = compareContext({
      ...contextInput(
        UNIT_TYPE_SLIDE,
        slideSnapshot({
          one: { id: "one", text: "Alpha" },
          two: { id: "two", text: "Beta" }
        }),
        slideSnapshot({
          one: { id: "one", text: "Changed Alpha" },
          two: { id: "two", text: "Changed Beta" }
        })
      ),
      query: {
        entityTypes: ["slide-element"],
        search: "page1",
        offset: 1,
        limit: 1,
        includeValues: false
      }
    });

    expect(result.summary.total).toBe(2);
    expect(result.page).toEqual({ offset: 1, limit: 1, matched: 2, hasMore: false });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("values");
  });

  it("filters nested Base cells by table or record identity", () => {
    const prepared = prepareGatewayUnitComparison(
      contextInput(UNIT_TYPE_BASE, baseSnapshot("Before"), baseSnapshot("After"))
    );

    for (const parentStableId of ["table1", "record1"]) {
      expect(
        queryGatewayUnitComparison(prepared, {
          entityTypes: ["cell"],
          parentStableId
        }).items
      ).toEqual([
        expect.objectContaining({ entityType: "cell", parentStableId: "table1" })
      ]);
    }
  });

  it("removes values from every projected field", () => {
    const result = compareContext({
      ...contextInput(
        UNIT_TYPE_BASE,
        baseSnapshot("Before secret"),
        baseSnapshot("After secret")
      ),
      query: { entityTypes: ["cell"], includeValues: false }
    });

    expect(result.items).toEqual([
      expect.objectContaining({ entityType: "cell", changes: [], details: [] })
    ]);
    expect(JSON.stringify(result.items)).not.toMatch(/Before secret|After secret/u);
  });

  it("keeps identities stable across summary, changes, and full projections", () => {
    const prepared = prepareGatewayUnitComparison(
      contextInput(
        UNIT_TYPE_SLIDE,
        slideSnapshot({ shape1: { id: "shape1", text: "Plan 2025", x: 12 } }),
        slideSnapshot({ shape1: { id: "shape1", text: "Plan 2026", x: 24 } })
      )
    );
    const summary = queryGatewayUnitComparison(prepared, { detail: "summary" });
    const changes = queryGatewayUnitComparison(prepared, { detail: "changes" });
    const full = queryGatewayUnitComparison(prepared, { detail: "full" });

    expect(summary.items.map((item) => item.id)).toEqual(changes.items.map((item) => item.id));
    expect(changes.items.map((item) => item.id)).toEqual(full.items.map((item) => item.id));
    expect(summary.items[0]).not.toHaveProperty("values");
    expect(summary.items[0]?.changes).toEqual([]);
    expect(changes.items[0]?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["text"],
          before: "Plan 2025",
          after: "Plan 2026"
        })
      ])
    );
    expect(changes.items[0]?.changes.find((change) => change.path[0] === "text")?.segments).toEqual({
      left: expect.arrayContaining([{ kind: "delete", text: "5" }]),
      right: expect.arrayContaining([{ kind: "insert", text: "6" }])
    });
    expect(full.items[0]?.values).toEqual({
      left: { id: "shape1", text: "Plan 2025", x: 12 },
      right: { id: "shape1", text: "Plan 2026", x: 24 }
    });
  });

  it("pages Doc alignment independently from changed items", () => {
    const prepared = prepareGatewayUnitComparison(
      contextInput(
        UNIT_TYPE_DOC,
        docWithParagraphs(["Before one", "Before two"]),
        docWithParagraphs(["After one", "After two"])
      )
    );
    const result = queryGatewayUnitComparison(prepared, {
      limit: 1,
      contextOffset: 1,
      contextLimit: 1
    });

    expect(result.items).toHaveLength(1);
    expect(result.productContext).toMatchObject({
      kind: "doc",
      paragraphAlignment: {
        total: 2,
        rows: [{ stableId: "p2" }],
        page: { offset: 1, limit: 1, hasMore: false }
      }
    });
  });

  it("reports native deletions when one side is absent", () => {
    const result = compareContext({
      ...contextInput(UNIT_TYPE_DOC, docSnapshot("Only left", "p1"), undefined),
      query: { includeValues: false }
    });

    expect(result.unit.presence).toBe("left-only");
    expect(result.summary).toMatchObject({
      total: result.items.length,
      delete: result.items.length,
      insert: 0,
      update: 0
    });
    expect(
      result.items.every((item) => item.kind === "delete" && item.locations.right === null)
    ).toBe(true);
    expect(
      result.items.some((item) => item.entityType === "paragraph" && item.stableId === "p1")
    ).toBe(true);
  });
});

function context(unitType: UnitType, leftData: unknown, rightData: unknown) {
  return compareContext(contextInput(unitType, leftData, rightData));
}

function contextInput(unitType: UnitType, leftData: unknown, rightData: unknown) {
  return {
    comparisonId: "comparison-1",
    unit: {
      unitId: `unit-${unitType}`,
      type: unitType,
      name: `Unit ${unitType}`,
      presence: rightData === undefined ? ("left-only" as const) : ("paired" as const)
    },
    fidelity: "snapshot" as const,
    stale: false,
    leftData,
    rightData,
    leftChangesets: [],
    rightChangesets: []
  };
}

function workbook(value: string): IWorkbookData {
  return {
    appVersion: "test",
    id: "workbook1",
    locale: "enUS",
    name: "Workbook",
    resources: [],
    sheetOrder: ["sheet1"],
    sheets: {
      sheet1: {
        id: "sheet1",
        name: "Sheet 1",
        rowCount: 10,
        columnCount: 10,
        cellData: { 0: { 0: { v: value } } }
      }
    },
    styles: {}
  } as IWorkbookData;
}

function docSnapshot(text: string, paragraphId: string) {
  return {
    body: {
      dataStream: `${text}\r\0`,
      paragraphs: [
        { paragraphId, startIndex: text.length },
        { paragraphId: "sentinel", startIndex: text.length + 1 }
      ]
    }
  };
}

function docWithParagraphs(texts: readonly string[]) {
  let offset = -1;
  const paragraphs = texts.map((text, index) => {
    offset += text.length + 1;
    return { paragraphId: `p${index + 1}`, startIndex: offset };
  });
  return {
    body: {
      dataStream: `${texts.join("\r")}\r\0`,
      paragraphs: [...paragraphs, { paragraphId: "sentinel", startIndex: offset + 1 }]
    }
  };
}

function slideSnapshot(elements: Record<string, unknown>) {
  return {
    slideOrder: ["page1"],
    slides: {
      page1: {
        id: "page1",
        elementOrder: Object.keys(elements),
        elements
      }
    }
  };
}

function baseSnapshot(value: string) {
  return {
    tableOrder: ["table1"],
    tables: {
      table1: {
        id: "table1",
        name: "Tasks",
        fieldOrder: ["field1"],
        fields: { field1: { id: "field1", name: "Title", type: "text" } },
        recordOrder: ["record1"],
        records: {
          record1: {
            id: "record1",
            values: { field1: value },
            updatedAt: 0
          }
        }
      }
    }
  };
}
