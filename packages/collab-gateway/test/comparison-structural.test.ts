import { UNIT_TYPE_BASE, UNIT_TYPE_BOARD, UNIT_TYPE_DOC, UNIT_TYPE_SLIDE } from "@univer/collab-gateway-contract";
import { describe, expect, it } from "vitest";
import { compareSnapshots } from "./helpers/comparison-context.js";

describe("SDK structural comparison contract", () => {
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

    const items = compareSnapshots({ type: UNIT_TYPE_DOC, left, right }).items;
    expect(items.filter((item) => item.entityType === "paragraph")).toEqual(
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

    const items = compareSnapshots({ type: UNIT_TYPE_DOC, left, right }).items;
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
    const items = compareSnapshots({ type: UNIT_TYPE_SLIDE, left, right }).items;
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "shape1", kind: "update" }),
        expect.objectContaining({ stableId: "shape2", kind: "insert" }),
      ]),
    );
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

    const items = compareSnapshots({ type: UNIT_TYPE_BASE, left, right }).items;
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "f1", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "f2", kind: "update", moved: true }),
        expect.objectContaining({ entityType: "cell", stableId: "r1:f1", kind: "update" }),
        expect.objectContaining({ stableId: "r2", kind: "insert" }),
        expect.objectContaining({ stableId: "v1", kind: "delete" }),
      ]),
    );
    expect(items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ entityType: "table", stableId: "t1" })]),
    );
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

    const items = compareSnapshots({ type: UNIT_TYPE_BOARD, left, right }).items;
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stableId: "e1", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "e2", kind: "update", moved: true }),
        expect.objectContaining({ stableId: "e3", kind: "insert" }),
      ]),
    );
    expect(items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ entityType: "board-page", stableId: "p1" })]),
    );
  });
});
