import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SLIDE,
} from "@univer/collab-gateway-contract";
import { describe, expect, it } from "vitest";
import {
  buildBaseDiffGridLayout,
  buildBaseTableDiff,
  getBaseDiffCell,
} from "../src/core/base-table-diff";
import { buildChangedSlidePages, buildUnitStructuralDiff } from "@univer/unit-compare";

describe("stable-ID Unit structural diff", () => {
  it("uses Doc paragraph and SectionBreak IDs for symmetric insert/delete/update/move", () => {
    const left = {
      body: {
        paragraphs: [
          { paragraphId: "p1", startIndex: 0, style: "left" },
          { paragraphId: "p2", startIndex: 4 },
        ],
        sectionBreaks: [{ sectionId: "s1", startIndex: 8 }],
      },
    };
    const right = {
      body: {
        paragraphs: [
          { paragraphId: "p2", startIndex: 0 },
          { paragraphId: "p1", startIndex: 4, style: "right" },
        ],
        sectionBreaks: [{ sectionId: "s2", startIndex: 8 }],
      },
    };

    const items = buildUnitStructuralDiff({ type: UNIT_TYPE_DOC, left, right });
    expect(items.filter((item) => item.category === "paragraph")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "p1", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "p2", kind: "update", moved: true }),
      ]),
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "s1", kind: "delete" }),
        expect.objectContaining({ stableId: "s2", kind: "insert" }),
      ]),
    );
  });

  it("compares Doc paragraph text by stable ID without treating insertion shifts as moves", () => {
    const left = {
      body: {
        dataStream: "Alpha\rBeta\r\n",
        paragraphs: [
          { paragraphId: "p1", startIndex: 5 },
          { paragraphId: "p2", startIndex: 10 },
        ],
      },
    };
    const right = {
      body: {
        dataStream: "New\rAlpha\rBETA\r\n",
        paragraphs: [
          { paragraphId: "p0", startIndex: 3 },
          { paragraphId: "p1", startIndex: 9 },
          { paragraphId: "p2", startIndex: 14 },
        ],
      },
    };

    const items = buildUnitStructuralDiff({ type: UNIT_TYPE_DOC, left, right });
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "p0", kind: "insert", moved: false }),
        expect.objectContaining({ stableId: "p2", kind: "update", moved: false }),
      ]),
    );
    expect(items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ stableId: "p1" })]),
    );
  });

  it("keeps stable Slide page and element IDs", () => {
    const left = { slides: { page1: { elements: { shape1: { x: 1 } } } } };
    const right = { slides: { page1: { elements: { shape1: { x: 2 }, shape2: {} } } } };
    const items = buildUnitStructuralDiff({ type: UNIT_TYPE_SLIDE, left, right });
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "shape1", kind: "update" }),
        expect.objectContaining({ stableId: "shape2", kind: "insert" }),
      ]),
    );
  });

  it("shows only changed Slide pages in stable page order", () => {
    const left = {
      slideOrder: ["page-deleted", "page-common", "page-equal"],
      slides: {
        "page-deleted": { id: "page-deleted", name: "Old plan", elements: {} },
        "page-common": { id: "page-common", name: "Roadmap", elements: { shape: { x: 1 } } },
        "page-equal": { id: "page-equal", name: "Appendix", elements: {} },
      },
    };
    const right = {
      slideOrder: ["page-common", "page-inserted", "page-equal"],
      slides: {
        "page-common": { id: "page-common", name: "Roadmap", elements: { shape: { x: 2 } } },
        "page-inserted": { id: "page-inserted", name: "Launch", elements: {} },
        "page-equal": { id: "page-equal", name: "Appendix", elements: {} },
      },
    };
    const items = buildUnitStructuralDiff({ type: UNIT_TYPE_SLIDE, left, right });

    expect(buildChangedSlidePages({ left, right, items })).toEqual([
      expect.objectContaining({ id: "page-deleted", label: "Old plan", status: "delete" }),
      expect.objectContaining({ id: "page-common", label: "Roadmap", status: "update" }),
      expect.objectContaining({ id: "page-inserted", label: "Launch", status: "insert" }),
    ]);
  });

  it("uses Base order arrays and stable table, field, record, and view IDs", () => {
    const left = {
      tableOrder: ["t1"],
      tables: {
        t1: {
          id: "t1",
          name: "Tasks",
          fieldOrder: ["f1", "f2"],
          fields: { f1: { id: "f1", name: "Name" }, f2: { id: "f2", name: "Owner" } },
          recordOrder: ["r1"],
          records: { r1: { id: "r1", values: { f1: "A" } } },
          viewOrder: ["v1"],
          views: { v1: { id: "v1", name: "Grid" } },
        },
      },
    };
    const right = {
      tableOrder: ["t1"],
      tables: {
        t1: {
          id: "t1",
          name: "Tasks",
          fieldOrder: ["f2", "f1"],
          fields: { f1: { id: "f1", name: "Title" }, f2: { id: "f2", name: "Owner" } },
          recordOrder: ["r1", "r2"],
          records: {
            r1: { id: "r1", values: { f1: "B" } },
            r2: { id: "r2", values: { f1: "C" } },
          },
          viewOrder: [],
          views: {},
        },
      },
    };

    const items = buildUnitStructuralDiff({ type: UNIT_TYPE_BASE, left, right });
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "f1", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "f2", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "r1", kind: "update" }),
        expect.objectContaining({ stableId: "r2", kind: "insert" }),
        expect.objectContaining({ stableId: "v1", kind: "delete" }),
      ]),
    );
    expect(items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "table", stableId: "t1" })]),
    );
  });

  it("aligns Base raw fields and records by stable ID and ignores view-only changes", () => {
    const left = {
      tableOrder: ["t1"],
      tables: {
        t1: {
          id: "t1",
          name: "Tasks",
          primaryFieldId: "title",
          fieldOrder: ["title", "owner"],
          fields: {
            title: { id: "title", name: "Title", type: "text", config: {} },
            owner: { id: "owner", name: "Owner", type: "text", config: {} },
          },
          recordOrder: ["r1", "r-deleted"],
          records: {
            r1: { id: "r1", values: { title: "Alpha", owner: "Mina" } },
            "r-deleted": { id: "r-deleted", values: { title: "Legacy" } },
          },
          viewOrder: ["grid"],
          views: { grid: { id: "grid", name: "Grid", fieldOrder: ["title"] } },
        },
      },
    };
    const right = {
      tableOrder: ["t1"],
      tables: {
        t1: {
          id: "t1",
          name: "Tasks",
          primaryFieldId: "title",
          fieldOrder: ["title", "risk", "owner"],
          fields: {
            title: { id: "title", name: "Title", type: "text", config: {} },
            risk: { id: "risk", name: "Risk", type: "text", config: {} },
            owner: { id: "owner", name: "Owner", type: "text", config: {} },
          },
          recordOrder: ["r1", "r-inserted"],
          records: {
            r1: { id: "r1", values: { title: "ALPHA", owner: "Mina", risk: "High" } },
            "r-inserted": { id: "r-inserted", values: { title: "New" } },
          },
          viewOrder: ["kanban"],
          views: { kanban: { id: "kanban", name: "Board", fieldOrder: ["owner"] } },
        },
      },
    };

    const [table] = buildBaseTableDiff(left, right);
    expect(table?.fields.map((field) => field.id)).toEqual(["title", "risk", "owner"]);
    expect(table?.records.map((record) => record.id)).toEqual(["r1", "r-deleted", "r-inserted"]);
    const title = table?.fields.find((field) => field.id === "title");
    const risk = table?.fields.find((field) => field.id === "risk");
    const r1 = table?.records.find((record) => record.id === "r1");
    expect(title).toBeDefined();
    expect(risk).toBeDefined();
    expect(r1).toBeDefined();
    expect(getBaseDiffCell({ field: title!, record: r1!, side: "left" })).toMatchObject({
      displayValue: "Alpha",
      status: "update",
    });
    expect(getBaseDiffCell({ field: title!, record: r1!, side: "right" })).toMatchObject({
      displayValue: "ALPHA",
      status: "update",
    });
    expect(getBaseDiffCell({ field: risk!, record: r1!, side: "left" })).toMatchObject({
      displayValue: "",
      present: false,
      status: "delete",
    });
    expect(getBaseDiffCell({ field: risk!, record: r1!, side: "right" })).toMatchObject({
      displayValue: "High",
      present: true,
      status: "insert",
    });

    const viewOnlyRight = structuredClone(left);
    viewOnlyRight.tables.t1.views.grid.name = "Renamed view";
    expect(buildBaseTableDiff(left, viewOnlyRight)).toEqual([]);
  });

  it("uses one explicit Base grid geometry for both panes and hides internal record IDs", () => {
    const snapshot = (width: number) => ({
      tableOrder: ["tasks"],
      tables: {
        tasks: {
          id: "tasks",
          name: "Tasks",
          primaryFieldId: "title",
          fieldOrder: ["record-id", "title"],
          fields: {
            "record-id": {
              id: "record-id",
              name: "Record ID",
              type: "recordId",
              system: true,
            },
            title: { id: "title", name: "Title", type: "text" },
          },
          recordOrder: ["r1"],
          records: {
            r1: { id: "r1", values: { title: width > 200 ? "Launch updated" : "Launch" } },
          },
          viewOrder: ["grid"],
          views: {
            grid: {
              id: "grid",
              type: "grid",
              fieldSettings: { title: { width } },
            },
          },
        },
      },
    });
    const [diff] = buildBaseTableDiff(snapshot(120), snapshot(236));

    expect(diff?.fields.map((field) => field.id)).toEqual(["title"]);
    expect(buildBaseDiffGridLayout(diff!)).toEqual({
      columnWidths: [236],
      gridTemplateColumns: "44px 236px",
      totalWidth: 280,
    });
  });

  it("uses Board page and element order with stable IDs", () => {
    const left = {
      pageOrder: ["p1"],
      pages: {
        p1: {
          id: "p1",
          name: "Canvas",
          elementOrder: ["e1", "e2"],
          elements: { e1: { id: "e1", x: 1 }, e2: { id: "e2", x: 2 } },
        },
      },
    };
    const right = {
      pageOrder: ["p1"],
      pages: {
        p1: {
          id: "p1",
          name: "Canvas",
          elementOrder: ["e2", "e1", "e3"],
          elements: {
            e1: { id: "e1", x: 3 },
            e2: { id: "e2", x: 2 },
            e3: { id: "e3", x: 4 },
          },
        },
      },
    };

    const items = buildUnitStructuralDiff({ type: UNIT_TYPE_BOARD, left, right });
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "e1", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "e2", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "e3", kind: "insert" }),
      ]),
    );
    expect(items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "board-page", stableId: "p1" })]),
    );
  });
});
