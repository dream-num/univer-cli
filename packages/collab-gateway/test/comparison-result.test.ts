import { UNIT_TYPE_DOC, UNIT_TYPE_SLIDE } from "@univer/collab-gateway-contract";
import { describe, expect, it } from "vitest";
import { compareSnapshots } from "./helpers/comparison-context.js";

describe("agent-facing Unit structural diff model", () => {
  it("provides a versioned summary, stable path, positions, and both values", () => {
    const model = compareSnapshots({
      type: UNIT_TYPE_SLIDE,
      left: {
        slideOrder: ["page-1"],
        slides: {
          "page-1": {
            elementOrder: ["shape-1"],
            elements: { "shape-1": { id: "shape-1", x: 1 } },
          },
        },
      },
      right: {
        slideOrder: ["page-1"],
        slides: {
          "page-1": {
            elementOrder: ["shape-1", "shape-2"],
            elements: {
              "shape-1": { id: "shape-1", x: 2 },
              "shape-2": { id: "shape-2", x: 3 },
            },
          },
        },
      },
    });

    expect(model.schemaVersion).toBe(1);
    expect(model.summary).toMatchObject({ total: 2, insert: 1, update: 1 });
    expect(model.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "slide-element",
          parentStableId: "page-1",
          path: ["slide-element", "page-1", "shape-1"],
          locations: { left: expect.objectContaining({ position: 0 }), right: expect.objectContaining({ position: 0 }) },
          stableId: "shape-1",
          values: {
            left: { id: "shape-1", x: 1 },
            right: { id: "shape-1", x: 2 },
          },
        }),
      ]),
    );
    expect(new Set(model.items.map((item) => item.id)).size).toBe(model.items.length);
  });

  it("aligns Doc paragraphs with explicit placeholders and represents moves as delete plus insert", () => {
    const body = (ids: readonly string[]) => ({
      dataStream: `${ids.join("\r")}\r\0`,
      paragraphs: [
        ...ids.map((id, index) => ({
          paragraphId: id,
          startIndex: ids.slice(0, index + 1).join("\r").length,
        })),
        { paragraphId: "sentinel", startIndex: ids.join("\r").length + 1 },
      ],
    });
    const model = compareSnapshots({
      type: UNIT_TYPE_DOC,
      left: { body: body(["alpha", "beta", "gamma"]) },
      right: { body: body(["beta", "alpha", "inserted", "gamma"]) },
    });

    if (model.productContext.kind !== "doc") throw new Error("Expected Doc context");
    const rows = model.productContext.paragraphAlignment.rows;
    expect(rows.filter((row) => row.leftIndex !== null).map((row) => row.stableId))
      .toEqual(["alpha", "beta", "gamma"]);
    expect(rows.filter((row) => row.rightIndex !== null).map((row) => row.stableId))
      .toEqual(["beta", "alpha", "inserted", "gamma"]);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ stableId: "inserted", kind: "insert", leftIndex: null }),
    ]));
    const movedGhost = rows.find((row) => row.moved && row.leftIndex === null);
    expect(movedGhost).toBeDefined();
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ stableId: movedGhost!.stableId, moved: true, rightIndex: null }),
    ]));
  });

  it("exposes Doc table, block range, custom range, and drawing changes", () => {
    const model = compareSnapshots({
      type: UNIT_TYPE_DOC,
      left: {
        body: {
          dataStream: "Text\r\0",
          paragraphs: [
            { paragraphId: "p1", startIndex: 4 },
            { paragraphId: "sentinel", startIndex: 5 },
          ],
          blockRanges: [{ blockId: "callout", startIndex: 0, endIndex: 4, type: "callout" }],
          customRanges: [{ rangeId: "link", startIndex: 0, endIndex: 3, url: "/old" }],
        },
        tableSource: { table1: { tableId: "table1", tableRows: [] } },
        drawings: { drawing1: { drawingId: "drawing1", title: "Old" } },
      },
      right: {
        body: {
          dataStream: "Text\r\0",
          paragraphs: [
            { paragraphId: "p1", startIndex: 4 },
            { paragraphId: "sentinel", startIndex: 5 },
          ],
          blockRanges: [{ blockId: "callout", startIndex: 1, endIndex: 4, type: "quote" }],
          customRanges: [{ rangeId: "link", startIndex: 0, endIndex: 3, url: "/new" }],
        },
        tableSource: { table1: { tableId: "table1", tableRows: [{ tableCells: [] }] } },
        drawings: { drawing1: { drawingId: "drawing1", title: "New" } },
      },
    });

    expect(model.summary.byEntityType).toMatchObject({
      "block-range": 1,
      "custom-range": 1,
      table: 1,
      drawing: 1,
    });
  });

  it("uses visible Doc range content and code language as human-readable labels", () => {
    const snapshot = (config: string, language: string) => ({
      body: {
        dataStream: "Launch criteria\r\0",
        paragraphs: [
          { paragraphId: "p1", startIndex: 15 },
          { paragraphId: "sentinel", startIndex: 16 },
        ],
        blockRanges: [{ blockId: "quote1", startIndex: 0, endIndex: 14, type: "quote", config }],
        columnGroups: [
          { columnGroupId: "columns1", startIndex: 0, endIndex: 14, columns: [config] },
        ],
      },
      resources: [
        {
          name: "DOC_CODE_PLUGIN",
          data: JSON.stringify({ codes: { code1: { id: "code1", language } } }),
        },
      ],
    });
    const model = compareSnapshots({
      type: UNIT_TYPE_DOC,
      left: snapshot("before", "javascript"),
      right: snapshot("after", "typescript"),
    });

    expect(model.items.find((item) => item.entityType === "block-range")?.title).toBe(
      "Launch criteria",
    );
    expect(model.items.find((item) => item.entityType === "column-group")?.title).toBe(
      "Launch criteria",
    );
    expect(model.items.find((item) => item.entityType === "doc-code")?.title).toBe("typescript");
  });
});
