import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import {
  prepareGatewayUnitComparison,
  queryGatewayUnitComparison,
} from "../src/comparison/unit-comparison-runtime.js";

describe("Gateway unit comparison runtime", () => {
  it("pages more than 1000 Doc alignment rows independently from a single changed item", () => {
    const texts = Array.from({ length: 1007 }, (_, index) => `Paragraph ${index}`);
    const prepared = prepareGatewayUnitComparison({
      comparisonId: "large-doc", unit: { unitId: "doc-1", type: UniverInstanceType.UNIVER_DOC, name: "Large", presence: "paired" },
      fidelity: "snapshot", stale: false,
      leftData: documentWithParagraphs(texts),
      rightData: documentWithParagraphs([...texts.slice(0, -1), "Updated last paragraph"]),
      leftChangesets: [], rightChangesets: [],
    });
    const first = queryGatewayUnitComparison(prepared, { limit: 10 });
    const last = queryGatewayUnitComparison(prepared, { limit: 10, offset: 1, contextOffset: 1000 });
    expect(first.items).toHaveLength(1);
    expect(first.page.hasMore).toBe(false);
    expect(first.productContext).toMatchObject({ kind: "doc", paragraphAlignment: {
      total: 1007, page: { offset: 0, matched: 1007, hasMore: true }, rows: expect.any(Array),
    } });
    expect(last.items).toEqual([]);
    expect(last.productContext).toMatchObject({ kind: "doc", paragraphAlignment: {
      total: 1007, page: { offset: 1000, matched: 1007, hasMore: false },
    } });
    if (last.productContext.kind !== "doc") throw new Error("Expected Doc context");
    expect(last.productContext.paragraphAlignment.rows).toHaveLength(7);
    expect(last.productContext.paragraphAlignment.rows[6]).toMatchObject({
      stableId: "paragraph-1006", kind: "update", leftNativeStableId: "paragraph-1006", rightNativeStableId: "paragraph-1006",
    });
  });

  it("keeps Doc navigation context complete when result items are paged", () => {
    const prepared = prepareGatewayUnitComparison({
      comparisonId: "comparison-doc",
      unit: {
        unitId: "doc-1",
        type: UniverInstanceType.UNIVER_DOC,
        name: "Review",
        presence: "paired",
      },
      fidelity: "snapshot",
      stale: false,
      leftData: documentWithParagraphs(["One", "Two", "Three"]),
      rightData: documentWithParagraphs(["Updated one", "Updated two", "Updated three"]),
      leftChangesets: [],
      rightChangesets: [],
    });

    const firstPage = queryGatewayUnitComparison(prepared, {
      entityTypes: ["paragraph"],
      limit: 1,
      detail: "changes",
    });

    expect(firstPage.page).toMatchObject({ matched: 3, hasMore: true });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.productContext).toMatchObject({
      kind: "doc",
      paragraphAlignment: {
        total: 3,
        rows: [
          { stableId: "paragraph-0", kind: "update" },
          { stableId: "paragraph-1", kind: "update" },
          { stableId: "paragraph-2", kind: "update" },
        ],
      },
    });
  });

  it("forwards SDK-owned Slide scopes for tabs and follow-up agent queries", () => {
    const prepared = prepareGatewayUnitComparison({
      comparisonId: "slide-scopes",
      unit: {
        unitId: "deck-1",
        type: UniverInstanceType.UNIVER_SLIDE,
        name: "Launch deck",
        presence: "paired",
      },
      fidelity: "snapshot",
      stale: false,
      leftData: {
        slideOrder: ["intro", "plan"],
        slides: {
          intro: { name: "Introduction", elements: {} },
          plan: { name: "Plan", elements: { hero: { text: "Draft" } } },
        },
      },
      rightData: {
        slideOrder: ["intro", "plan"],
        slides: {
          intro: { name: "Introduction", elements: {} },
          plan: { name: "Launch plan", elements: { hero: { text: "Ready" } } },
        },
      },
      leftChangesets: [],
      rightChangesets: [],
    });

    const overview = queryGatewayUnitComparison(prepared, { detail: "summary", limit: 1000 });
    const scope = overview.scopes[0];
    if (scope === undefined) throw new Error("Expected a changed Slide scope");
    const scoped = queryGatewayUnitComparison(prepared, { scope, limit: 1000 });

    expect(overview.scopes).toEqual([
      expect.objectContaining({
        entityType: "slide",
        stableId: "plan",
        displayName: "Launch plan",
        kind: "update",
        changeCount: 2,
      }),
    ]);
    expect(scoped.items.length).toBeGreaterThan(0);
    expect(scoped.items.every((item) => item.scope?.stableId === "plan")).toBe(true);
  });
});

function documentWithParagraphs(texts: readonly string[]): unknown {
  let dataStream = "";
  const paragraphs = texts.map((text, index) => {
    dataStream += text;
    const paragraph = { paragraphId: `paragraph-${index}`, startIndex: dataStream.length };
    dataStream += "\r\n";
    return paragraph;
  });
  return { body: { dataStream, paragraphs, textRuns: [], sectionBreaks: [] }, resources: [] };
}
