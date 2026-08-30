import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType,
} from "@univer/collab-gateway-contract";
import type { IWorkbookData } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import {
  buildUnitComparisonContext,
  buildSemanticChanges,
  buildUnitStructuralDiffModel,
  prepareUnitComparisonContext,
  queryPreparedUnitComparisonContext,
} from "../src/index.js";

describe("agent-facing five-product comparison context", () => {
  it("collapses product text mirrors and favors semantic business fields over metadata", () => {
    const changes = buildSemanticChanges(
      {
        text: "Baseline",
        textData: { body: { dataStream: "Baseline\r\n" } },
        updatedAt: 1,
        values: { field1: "Draft" },
      },
      {
        text: "Approved",
        textData: { body: { dataStream: "Approved\r\n" } },
        updatedAt: 2,
        values: { field1: "Ready" },
      },
    );

    expect(changes.filter((change) => change.path.join(".") === "text")).toHaveLength(1);
    expect(changes.map((change) => change.path)).toEqual([
      ["text"],
      ["field", "field1"],
      ["updatedAt"],
    ]);
  });

  it("normalizes Sheet, Doc, Slide, Base, and Board changes into stable paths", () => {
    const sheet = context(UNIT_TYPE_SHEET, workbook("before"), workbook("after"));
    const doc = context(UNIT_TYPE_DOC, docSnapshot("Before", "p1"), docSnapshot("After", "p1"));
    const slide = context(
      UNIT_TYPE_SLIDE,
      slideSnapshot({ shape1: { id: "shape1", x: 1 } }),
      slideSnapshot({ shape1: { id: "shape1", x: 2 } }),
    );
    const base = context(UNIT_TYPE_BASE, baseSnapshot("Before"), baseSnapshot("After"));
    const board = context(
      UNIT_TYPE_BOARD,
      { elements: { note1: { id: "note1", text: "Before" } } },
      { elements: { note1: { id: "note1", text: "After" } } },
    );

    expect(sheet.items[0]).toMatchObject({
      entityType: "cell",
      kind: "update",
      stableId: "A1",
      path: ["sheet", "sheet1", "cell", "A1"],
    });
    expect(doc.items[0]).toMatchObject({ entityType: "paragraph", path: ["paragraph", "p1"] });
    expect(slide.items[0]).toMatchObject({
      entityType: "slide-element",
      path: ["slide-element", "page1", "shape1"],
    });
    expect(base.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "cell",
          path: ["cell", "table1", "record1", "field1"],
        }),
      ]),
    );
    expect(base.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ entityType: "record" })]),
    );
    expect(board.items[0]).toMatchObject({ entityType: "board-element" });
    expect(board.items[0]?.locations.left?.stableId).toBe("note1");
  });

  it("keeps Base record navigation focused on business fields instead of timestamps", () => {
    const left = baseSnapshot("Draft");
    const right = baseSnapshot("Ready");
    left.tables.table1.records.record1.updatedAt = 1;
    right.tables.table1.records.record1.updatedAt = 2;

    const model = buildUnitStructuralDiffModel({ type: UNIT_TYPE_BASE, left, right });
    const record = model.items.find((item) => item.entityType === "record");

    expect(record?.changes.map((change) => change.path)).toEqual([["field", "field1"]]);
  });

  it("mirrors insert/delete locations and preserves blue updates", () => {
    const left = slideSnapshot({ existing: { id: "existing", x: 1 } });
    const right = slideSnapshot({
      existing: { id: "existing", x: 2 },
      inserted: { id: "inserted", x: 3 },
    });
    const forward = context(UNIT_TYPE_SLIDE, left, right);
    const reverse = context(UNIT_TYPE_SLIDE, right, left);
    const forwardInsert = forward.items.find(
      (item) => item.locations.right?.stableId === "inserted",
    );
    const reverseDelete = reverse.items.find(
      (item) => item.locations.left?.stableId === "inserted",
    );
    const forwardUpdate = forward.items.find(
      (item) => item.locations.left?.stableId === "existing",
    );
    const reverseUpdate = reverse.items.find(
      (item) => item.locations.left?.stableId === "existing",
    );

    expect(forwardInsert).toMatchObject({ kind: "insert", locations: { left: null } });
    expect(reverseDelete).toMatchObject({ kind: "delete", locations: { right: null } });
    expect(forwardInsert?.path).toEqual(reverseDelete?.path);
    expect(forwardUpdate).toMatchObject({ kind: "update" });
    expect(reverseUpdate).toMatchObject({ kind: "update" });
    expect(forwardUpdate?.values?.left).toEqual(reverseUpdate?.values?.right);
    expect(forwardUpdate?.values?.right).toEqual(reverseUpdate?.values?.left);
  });

  it("filters, pages, searches, and optionally omits large before/after values", () => {
    const left = slideSnapshot({
      one: { id: "one", text: "Alpha" },
      two: { id: "two", text: "Beta" },
    });
    const right = slideSnapshot({
      one: { id: "one", text: "Changed Alpha" },
      two: { id: "two", text: "Changed Beta" },
    });
    const result = buildUnitComparisonContext({
      ...contextInput(UNIT_TYPE_SLIDE, left, right),
      query: {
        entityTypes: ["slide-element"],
        search: "page1",
        offset: 1,
        limit: 1,
        includeValues: false,
      },
    });

    expect(result.summary.total).toBe(2);
    expect(result.page).toEqual({ offset: 1, limit: 1, matched: 2, hasMore: false });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("values");
  });

  it("filters by either containing parent identity or nested location parent", () => {
    const prepared = prepareUnitComparisonContext(
      contextInput(UNIT_TYPE_BASE, baseSnapshot("Before"), baseSnapshot("After")),
    );

    const table = queryPreparedUnitComparisonContext(prepared, {
      entityTypes: ["cell"],
      parentStableId: "table1",
    });
    const record = queryPreparedUnitComparisonContext(prepared, {
      entityTypes: ["cell"],
      parentStableId: "record1",
    });

    expect(table.items).toEqual([
      expect.objectContaining({ entityType: "cell", parentStableId: "table1" }),
    ]);
    expect(record.items).toEqual([
      expect.objectContaining({ entityType: "cell", parentStableId: "table1" }),
    ]);
  });

  it("omits values from both the value payload and detail lines", () => {
    const result = buildUnitComparisonContext({
      ...contextInput(UNIT_TYPE_BASE, baseSnapshot("Before secret"), baseSnapshot("After secret")),
      query: { entityTypes: ["cell"], includeValues: false },
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        details: [{ label: "Value", kind: "update" }],
      }),
    ]);
    expect(JSON.stringify(result.items)).not.toContain("Before secret");
    expect(JSON.stringify(result.items)).not.toContain("After secret");
  });

  it("projects summary, agent changes, and full raw values without changing item identity", () => {
    const prepared = prepareUnitComparisonContext(
      contextInput(
        UNIT_TYPE_SLIDE,
        slideSnapshot({ shape1: { id: "shape1", text: "Plan 2025", x: 12 } }),
        slideSnapshot({ shape1: { id: "shape1", text: "Plan 2026", x: 24 } }),
      ),
    );
    const summary = queryPreparedUnitComparisonContext(prepared, { detail: "summary" });
    const changes = queryPreparedUnitComparisonContext(prepared, { detail: "changes" });
    const full = queryPreparedUnitComparisonContext(prepared, { detail: "full" });

    expect(summary.detail).toBe("summary");
    expect(summary.items[0]).not.toHaveProperty("values");
    expect(summary.items[0]?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["text"], valueType: "text" }),
        expect.objectContaining({ path: ["geometry", "x"], valueType: "geometry" }),
      ]),
    );
    expect(summary.items[0]?.changes[0]).not.toHaveProperty("before");
    expect(changes.detail).toBe("changes");
    expect(changes.items[0]).not.toHaveProperty("values");
    expect(changes.items[0]?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["text"], before: "Plan 2025", after: "Plan 2026" }),
      ]),
    );
    expect(changes.items[0]?.changes.find((change) => change.path[0] === "text")?.segments).toEqual(
      {
        left: expect.arrayContaining([{ kind: "delete", text: "5" }]),
        right: expect.arrayContaining([{ kind: "insert", text: "6" }]),
      },
    );
    expect(full.detail).toBe("full");
    expect(full.items[0]?.values).toEqual({
      left: { id: "shape1", text: "Plan 2025", x: 12 },
      right: { id: "shape1", text: "Plan 2026", x: 24 },
    });
  });

  it("returns understandable leaf changes for all five products", () => {
    const sheetLeft = workbook("10");
    const sheetRight = workbook("12");
    sheetLeft.sheets.sheet1!.cellData = { 0: { 0: { v: 10, f: "=SUM(A1:A3)" } } };
    sheetRight.sheets.sheet1!.cellData = { 0: { 0: { v: 12, f: "=SUM(A1:A4)" } } };
    const sheet = context(UNIT_TYPE_SHEET, sheetLeft, sheetRight);
    const doc = context(
      UNIT_TYPE_DOC,
      docSnapshot("Publish the 2025 plan", "p1"),
      docSnapshot("Publish the 2026 plan", "p1"),
    );
    const slide = context(
      UNIT_TYPE_SLIDE,
      slideSnapshot({ shape1: { id: "shape1", text: "Revenue 2025", x: 120, fill: "#fff" } }),
      slideSnapshot({ shape1: { id: "shape1", text: "Revenue 2026", x: 160, fill: "#eef4ff" } }),
    );
    const baseLeft = baseSnapshot("Draft");
    const baseRight = baseSnapshot("Ready");
    baseLeft.tables.table1.fields.field1.name = "Task";
    baseRight.tables.table1.fields.field1.name = "Work item";
    const base = context(UNIT_TYPE_BASE, baseLeft, baseRight);
    const board = context(
      UNIT_TYPE_BOARD,
      { elements: { connector1: { id: "connector1", text: "Old", x: 1, targetId: "node1" } } },
      { elements: { connector1: { id: "connector1", text: "New", x: 2, targetId: "node2" } } },
    );

    expect(sheet.items.find((item) => item.entityType === "cell")?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["formula"], valueType: "formula" }),
        expect.objectContaining({ path: ["value"] }),
      ]),
    );
    expect(doc.items.find((item) => item.entityType === "paragraph")?.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["text"], valueType: "text" })]),
    );
    expect(slide.items.find((item) => item.entityType === "slide-element")?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["text"], valueType: "text" }),
        expect.objectContaining({ path: ["geometry", "x"], valueType: "geometry" }),
        expect.objectContaining({ path: ["style", "fill"], valueType: "color" }),
      ]),
    );
    expect(base.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "field",
          changes: expect.arrayContaining([expect.objectContaining({ path: ["name"] })]),
        }),
        expect.objectContaining({
          entityType: "cell",
          changes: expect.arrayContaining([expect.objectContaining({ path: [] })]),
        }),
      ]),
    );
    expect(board.items.find((item) => item.entityType === "board-element")?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["text"], valueType: "text" }),
        expect.objectContaining({ path: ["geometry", "x"], valueType: "geometry" }),
        expect.objectContaining({ path: ["targetId"], valueType: "reference" }),
      ]),
    );
    expect(doc.items.find((item) => item.entityType === "paragraph")?.title).toBe(
      "Publish the 2026 plan",
    );
    expect(slide.items.find((item) => item.entityType === "slide-element")?.title).toBe(
      "Revenue 2026",
    );
    expect(base.items.find((item) => item.entityType === "cell")?.title).toBe("Ready · Work item");
    expect(board.items.find((item) => item.entityType === "board-element")?.title).toBe("New");
  });

  it("degrades only when Sheet history contains an unknown structural coordinate mutation", () => {
    const result = buildUnitComparisonContext({
      ...contextInput(UNIT_TYPE_SHEET, workbook("before"), workbook("after")),
      fidelity: "history",
      leftChangesets: [
        {
          mutations: [
            { id: "sheet.mutation.set-range-values", data: "{}" },
            { id: "sheet.mutation.reorder-row-blocks", data: "{}" },
          ],
        },
      ],
    });

    expect(result.diagnostics).toMatchObject({
      readiness: "degraded",
      unsupportedMutationIds: ["sheet.mutation.reorder-row-blocks"],
    });
  });

  it("keeps Sheet history ready for snapshot-resolved style and resource mutations", () => {
    const result = buildUnitComparisonContext({
      ...contextInput(UNIT_TYPE_SHEET, workbook("before"), workbook("after")),
      fidelity: "history",
      leftChangesets: [
        {
          mutations: [
            { id: "sheet.mutation.set-style", data: "{}" },
            { id: "sheet.mutation.set-data-validation", data: "{}" },
            { id: "sheet.mutation.remove-sparkline", data: "{}" },
          ],
        },
      ],
    });

    expect(result.diagnostics).toEqual({
      readiness: "ready",
      unsupportedMutationIds: [],
      notes: [],
    });
  });

  it("explains ambiguous snapshot-only Sheet axis alignment to agents", () => {
    const left = workbook("same");
    const right = workbook("same");
    right.sheets.sheet1!.rowCount += 1;
    const result = buildUnitComparisonContext(contextInput(UNIT_TYPE_SHEET, left, right));

    expect(result.diagnostics).toEqual({
      readiness: "degraded",
      unsupportedMutationIds: [],
      notes: [
        "Sheet snapshot axis alignment was ambiguous; row and column coordinates are best effort.",
      ],
    });
  });

  it("prepares once and limits Doc alignment metadata to the selected page", () => {
    const prepared = prepareUnitComparisonContext(
      contextInput(
        UNIT_TYPE_DOC,
        docWithParagraphs(["Before one", "Before two"]),
        docWithParagraphs(["After one", "After two"]),
      ),
    );
    const first = queryPreparedUnitComparisonContext(prepared, {
      entityTypes: ["paragraph"],
      limit: 1,
      includeValues: false,
    });
    const second = queryPreparedUnitComparisonContext(prepared, {
      entityTypes: ["paragraph"],
      offset: 1,
      limit: 1,
      includeValues: false,
    });

    expect(first.productContext).toMatchObject({
      kind: "doc",
      paragraphAlignment: { total: 2, rows: [{ stableId: "p1" }] },
    });
    expect(second.productContext).toMatchObject({
      kind: "doc",
      paragraphAlignment: { total: 2, rows: [{ stableId: "p2" }] },
    });
  });

  it("keeps Doc paragraph navigation context for text-style-only pages", () => {
    const left = docSnapshot("Styled", "p1");
    const right = docSnapshot("Styled", "p1");
    left.body.textRuns = [{ st: 0, ed: 6, ts: { bl: 0 } }];
    right.body.textRuns = [{ st: 0, ed: 6, ts: { bl: 1 } }];
    const prepared = prepareUnitComparisonContext(contextInput(UNIT_TYPE_DOC, left, right));

    const result = queryPreparedUnitComparisonContext(prepared, {
      entityTypes: ["text-style"],
      includeValues: false,
    });

    expect(result.items).toEqual([
      expect.objectContaining({ entityType: "text-style", stableId: "p1" }),
    ]);
    expect(result.productContext).toMatchObject({
      kind: "doc",
      paragraphAlignment: { rows: [{ stableId: "p1" }] },
    });
  });

  it("compares text inside stable table cells and columns by structural slot", () => {
    const result = context(
      UNIT_TYPE_DOC,
      nestedDoc("68%", "Customer signal", "left"),
      nestedDoc("81%", "Launch signal", "right"),
    );

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "paragraph",
          stableId: "table:table1:row:0:cell:0:paragraph:0",
          kind: "update",
          locations: {
            left: expect.objectContaining({ stableId: "table-left" }),
            right: expect.objectContaining({ stableId: "table-right" }),
          },
        }),
        expect.objectContaining({
          entityType: "paragraph",
          stableId: "column-group:columns1:column:0:paragraph:0",
          kind: "update",
          locations: {
            left: expect.objectContaining({ stableId: "column-left" }),
            right: expect.objectContaining({ stableId: "column-right" }),
          },
        }),
      ]),
    );
    expect(result.productContext).toMatchObject({
      kind: "doc",
      paragraphAlignment: {
        rows: expect.arrayContaining([
          expect.objectContaining({
            stableId: "table:table1:row:0:cell:0:paragraph:0",
            kind: "update",
          }),
          expect.objectContaining({
            stableId: "column-group:columns1:column:0:paragraph:0",
            kind: "update",
          }),
        ]),
      },
    });
  });

  it("covers persisted feature families beyond visible element shells", () => {
    const doc = buildUnitStructuralDiffModel({
      type: UNIT_TYPE_DOC,
      left: featureDoc("before"),
      right: featureDoc("after"),
    });
    const docContext = context(UNIT_TYPE_DOC, featureDoc("before"), featureDoc("after"));
    const slide = buildUnitStructuralDiffModel({
      type: UNIT_TYPE_SLIDE,
      left: featureSlide("before"),
      right: featureSlide("after"),
    });
    const base = buildUnitStructuralDiffModel({
      type: UNIT_TYPE_BASE,
      left: { ...baseSnapshot("Before"), name: "Before base" },
      right: { ...baseSnapshot("After"), name: "After base" },
    });
    const board = buildUnitStructuralDiffModel({
      type: UNIT_TYPE_BOARD,
      left: featureBoard("before"),
      right: featureBoard("after"),
    });

    expect(Object.keys(doc.summary.byCategory)).toEqual(
      expect.arrayContaining([
        "paragraph",
        "text-style",
        "section",
        "block-range",
        "custom-range",
        "table-range",
        "custom-block",
        "column-group",
        "table",
        "drawing",
        "header",
        "footer",
        "document-style",
        "document-setting",
        "custom-decoration",
        "doc-hyperlink",
        "doc-callout",
        "doc-chart",
        "doc-chart-data",
        "doc-code",
        "doc-latex",
        "doc-shape-resource",
        "doc-table-resource",
      ]),
    );
    expect(doc.items.find((item) => item.category === "table")?.label).toBe("after");
    expect(doc.items.find((item) => item.category === "doc-callout")?.label).toBe("after");
    expect(doc.items.find((item) => item.category === "doc-code")?.label).toBe("after");
    expect(docContext.items.find((item) => item.entityType === "table")?.title).toBe("after");
    expect(docContext.items.find((item) => item.entityType === "doc-callout")?.title).toBe("after");
    expect(docContext.items.find((item) => item.entityType === "doc-code")?.title).toBe("after");
    expect(Object.keys(slide.summary.byCategory)).toEqual(
      expect.arrayContaining([
        "slide-element",
        "slide-transition",
        "slide-transition-ref",
        "slide-master",
        "slide-layout",
        "slide-theme",
        "slide-chart",
        "slide-chart-data",
        "slide-table",
      ]),
    );
    expect(Object.keys(base.summary.byCategory)).toContain("base");
    expect(Object.keys(board.summary.byCategory)).toEqual(
      expect.arrayContaining([
        "board-element",
        "board-theme",
        "board-chart",
        "board-chart-data",
        "board-table",
      ]),
    );
  });

  it("keeps insert/delete/update semantics symmetric for all five products", () => {
    const pairs: Array<readonly [UnitType, unknown, unknown]> = [
      [UNIT_TYPE_SHEET, workbook("before"), workbookWithInsertedSheet("after")],
      [UNIT_TYPE_DOC, featureDoc("before"), featureDoc("after")],
      [UNIT_TYPE_SLIDE, featureSlide("before"), featureSlide("after")],
      [UNIT_TYPE_BASE, baseSnapshot("Before"), baseWithInsertedRecord("After")],
      [UNIT_TYPE_BOARD, featureBoard("before"), featureBoard("after")],
    ];

    for (const [type, left, right] of pairs) {
      const forward = context(type, left, right);
      const reverse = context(type, right, left);
      for (const item of forward.items) {
        const mirrored = reverse.items.find(
          (candidate) =>
            candidate.entityType === item.entityType &&
            candidate.stableId === item.stableId &&
            candidate.parentStableId === item.parentStableId,
        );
        expect(mirrored, `${type}:${item.entityType}:${item.stableId}`).toBeDefined();
        expect(mirrored?.kind).toBe(
          item.kind === "insert" ? "delete" : item.kind === "delete" ? "insert" : "update",
        );
        expect(mirrored?.moved).toBe(item.moved);
        if (item.values !== undefined && mirrored?.values !== undefined) {
          expect(mirrored.values.left).toEqual(item.values.right);
          expect(mirrored.values.right).toEqual(item.values.left);
        }
      }
    }
  });

  it("satisfies the mirror property for seeded bilateral edits across all five products", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const left = mutateEntities(seed * 2, "left");
      const right = mutateEntities(seed * 2 + 1, "right");
      const pairs: Array<readonly [UnitType, unknown, unknown]> = [
        [UNIT_TYPE_SHEET, workbookFromEntities(left), workbookFromEntities(right)],
        [UNIT_TYPE_DOC, docFromEntities(left), docFromEntities(right)],
        [UNIT_TYPE_SLIDE, slideFromEntities(left), slideFromEntities(right)],
        [UNIT_TYPE_BASE, baseFromEntities(left), baseFromEntities(right)],
        [UNIT_TYPE_BOARD, boardFromEntities(left), boardFromEntities(right)],
      ];

      for (const [type, before, after] of pairs) {
        expectMirroredContext(type, before, after, seed);
      }
    }
  });

  it("reports a Unit-level gap when one comparison side is absent", () => {
    const result = buildUnitComparisonContext({
      ...contextInput(UNIT_TYPE_DOC, docSnapshot("Only left", "p1"), undefined),
      query: { includeValues: false },
    });

    expect(result).toMatchObject({
      diagnostics: { readiness: "degraded" },
      summary: { total: 1, delete: 1 },
      items: [{ entityType: "unit", kind: "delete", locations: { right: null } }],
    });
  });
});

function context(unitType: UnitType, leftData: unknown, rightData: unknown) {
  return buildUnitComparisonContext(contextInput(unitType, leftData, rightData));
}

function contextInput(unitType: UnitType, leftData: unknown, rightData: unknown) {
  return {
    comparisonId: "comparison-1",
    unit: {
      unitId: `unit-${unitType}`,
      type: unitType,
      name: `Unit ${unitType}`,
      presence: rightData === undefined ? ("left-only" as const) : ("paired" as const),
    },
    fidelity: "snapshot" as const,
    stale: false,
    ...(leftData === undefined ? {} : { leftData }),
    ...(rightData === undefined ? {} : { rightData }),
  };
}

interface GeneratedEntity {
  readonly id: string;
  readonly value: string;
}

function mutateEntities(seed: number, side: "left" | "right"): GeneratedEntity[] {
  const random = seededRandom(seed);
  const entities = Array.from({ length: 6 }, (_, index) => ({
    id: `entity-${index}`,
    value: random() < 0.55 ? `value-${index}` : `${side}-${seed}-${index}`,
  })).filter(() => random() > 0.2);
  if (random() > 0.35) entities.push({ id: `${side}-insert-${seed}`, value: `${side}-new` });
  for (let index = entities.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [entities[index], entities[target]] = [entities[target]!, entities[index]!];
  }
  return entities;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function expectMirroredContext(type: UnitType, left: unknown, right: unknown, seed: number): void {
  const forward = context(type, left, right);
  const reverse = context(type, right, left);
  expect(reverse.items, `${seed}:${type}:item count`).toHaveLength(forward.items.length);
  for (const item of forward.items) {
    const mirrored = reverse.items.find(
      (candidate) =>
        candidate.entityType === item.entityType &&
        candidate.stableId === item.stableId &&
        candidate.parentStableId === item.parentStableId,
    );
    expect(mirrored, `${seed}:${type}:${item.entityType}:${item.stableId}`).toBeDefined();
    expect(mirrored?.kind).toBe(
      item.kind === "insert" ? "delete" : item.kind === "delete" ? "insert" : "update",
    );
    expect(mirrored?.moved).toBe(item.moved);
    expect(mirrored?.locations.left).toEqual(item.locations.right);
    expect(mirrored?.locations.right).toEqual(item.locations.left);
    if (item.values !== undefined || mirrored?.values !== undefined) {
      expect(mirrored?.values?.left).toEqual(item.values?.right);
      expect(mirrored?.values?.right).toEqual(item.values?.left);
    }
    expectMirroredChanges(item.changes, mirrored?.changes ?? [], `${seed}:${type}:${item.id}`);
  }
}

function expectMirroredChanges(
  forward: readonly {
    readonly path: readonly string[];
    readonly kind: "delete" | "insert" | "update";
    readonly before?: unknown;
    readonly after?: unknown;
    readonly segments?: {
      readonly left: readonly unknown[];
      readonly right: readonly unknown[];
    };
  }[],
  reverse: readonly {
    readonly path: readonly string[];
    readonly kind: "delete" | "insert" | "update";
    readonly before?: unknown;
    readonly after?: unknown;
    readonly segments?: {
      readonly left: readonly unknown[];
      readonly right: readonly unknown[];
    };
  }[],
  label: string,
): void {
  expect(reverse, `${label}:change count`).toHaveLength(forward.length);
  for (const change of forward) {
    const mirrored = reverse.find(
      (candidate) => candidate.path.join("\u0000") === change.path.join("\u0000"),
    );
    expect(mirrored, `${label}:${change.path.join(".")}`).toBeDefined();
    expect(mirrored?.kind).toBe(
      change.kind === "insert" ? "delete" : change.kind === "delete" ? "insert" : "update",
    );
    expect(mirrored?.before).toEqual(change.after);
    expect(mirrored?.after).toEqual(change.before);
    if (change.segments !== undefined || mirrored?.segments !== undefined) {
      expect(mirrored?.segments?.left).toEqual(change.segments?.right.map(mirrorInlineSegment));
      expect(mirrored?.segments?.right).toEqual(change.segments?.left.map(mirrorInlineSegment));
    }
  }
}

function mirrorInlineSegment(segment: unknown): unknown {
  if (typeof segment !== "object" || segment === null || !("kind" in segment)) return segment;
  const value = segment as { readonly kind: unknown; readonly text?: unknown };
  return {
    ...value,
    kind: value.kind === "insert" ? "delete" : value.kind === "delete" ? "insert" : value.kind,
  };
}

function workbookFromEntities(entities: readonly GeneratedEntity[]): IWorkbookData {
  return {
    id: "book",
    name: "Book",
    appVersion: "1",
    locale: "en-US",
    sheetOrder: entities.map((entity) => entity.id),
    sheets: Object.fromEntries(
      entities.map((entity) => [
        entity.id,
        {
          id: entity.id,
          name: entity.id,
          rowCount: 10,
          columnCount: 10,
          cellData: { 0: { 0: { v: entity.value } } },
        },
      ]),
    ),
    styles: {},
  } as IWorkbookData;
}

function docFromEntities(entities: readonly GeneratedEntity[]) {
  return docWithParagraphsAndIds(entities.map((entity) => ({ id: entity.id, text: entity.value })));
}

function docWithParagraphsAndIds(
  values: readonly { readonly id: string; readonly text: string }[],
) {
  let offset = -1;
  const paragraphs = values.map(({ id, text }) => {
    offset += text.length + 1;
    return { paragraphId: id, startIndex: offset };
  });
  return {
    body: {
      dataStream: `${values.map((value) => value.text).join("\r")}\r\0`,
      paragraphs: [...paragraphs, { paragraphId: "sentinel", startIndex: offset + 1 }],
    },
  };
}

function slideFromEntities(entities: readonly GeneratedEntity[]) {
  return {
    slideOrder: ["page1"],
    slides: {
      page1: {
        id: "page1",
        elementOrder: entities.map((entity) => entity.id),
        elements: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
      },
    },
  };
}

function baseFromEntities(entities: readonly GeneratedEntity[]) {
  return {
    tableOrder: ["table1"],
    tables: {
      table1: {
        id: "table1",
        fieldOrder: ["field1"],
        fields: { field1: { id: "field1", name: "Value", type: "text" } },
        recordOrder: entities.map((entity) => entity.id),
        records: Object.fromEntries(
          entities.map((entity) => [
            entity.id,
            { id: entity.id, values: { field1: entity.value } },
          ]),
        ),
      },
    },
  };
}

function boardFromEntities(entities: readonly GeneratedEntity[]) {
  return {
    pageOrder: ["page1"],
    pages: {
      page1: {
        id: "page1",
        elementOrder: entities.map((entity) => entity.id),
        elements: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
      },
    },
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
        cellData: { 0: { 0: { v: value } } },
      },
    },
    styles: {},
  } as IWorkbookData;
}

function docSnapshot(text: string, paragraphId: string) {
  return {
    body: {
      dataStream: `${text}\r\0`,
      paragraphs: [
        { paragraphId, startIndex: text.length },
        { paragraphId: "sentinel", startIndex: text.length + 1 },
      ],
    },
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
      paragraphs: [...paragraphs, { paragraphId: "sentinel", startIndex: offset + 1 }],
    },
  };
}

function nestedDoc(tableText: string, columnText: string, idSuffix: string) {
  const tablePrefix = "\x1a\x1b\x1c";
  const tableSuffix = "\n\x1d\x0e\x0f";
  const between = "Between";
  const columnPrefix = "\x12\x13";
  const columnSuffix = "\x14\x15";
  const after = "After";
  const tableParagraphEnd = tablePrefix.length + tableText.length;
  const tableEnd = tableParagraphEnd + 1 + tableSuffix.length;
  const betweenEnd = tableEnd + between.length;
  const columnStart = betweenEnd + 1;
  const columnParagraphEnd = columnStart + columnPrefix.length + columnText.length;
  const columnEnd = columnParagraphEnd + 1 + columnSuffix.length - 1;
  const afterEnd = columnEnd + 1 + after.length;
  const dataStream = `${tablePrefix}${tableText}\r${tableSuffix}${between}\r${columnPrefix}${columnText}\r${columnSuffix}${after}\r\0`;
  return {
    body: {
      dataStream,
      paragraphs: [
        { paragraphId: `table-${idSuffix}`, startIndex: tableParagraphEnd },
        { paragraphId: "between", startIndex: betweenEnd },
        { paragraphId: `column-${idSuffix}`, startIndex: columnParagraphEnd },
        { paragraphId: "after", startIndex: afterEnd },
        { paragraphId: "sentinel", startIndex: afterEnd + 1 },
      ],
      tables: [{ tableId: "table1", startIndex: 0, endIndex: tableEnd }],
      columnGroups: [{ columnGroupId: "columns1", startIndex: columnStart, endIndex: columnEnd }],
    },
  };
}

function slideSnapshot(elements: Record<string, unknown>) {
  return {
    slideOrder: ["page1"],
    slides: { page1: { id: "page1", elementOrder: Object.keys(elements), elements } },
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
        records: { record1: { id: "record1", values: { field1: value } } },
      },
    },
  };
}

function workbookWithInsertedSheet(value: string): IWorkbookData {
  const original = workbook(value);
  return {
    ...original,
    sheetOrder: ["sheet1", "sheet2"],
    sheets: {
      ...original.sheets,
      sheet2: {
        id: "sheet2",
        name: "Added",
        rowCount: 10,
        columnCount: 10,
        cellData: { 0: { 0: { v: "new" } } },
      },
    },
  } as IWorkbookData;
}

function featureDoc(value: string) {
  const text = `Paragraph ${value}`;
  return {
    title: `Document ${value}`,
    documentStyle: { pageSize: value },
    settings: { compatibility: value },
    headers: { header1: { id: "header1", text: value } },
    footers: { footer1: { id: "footer1", text: value } },
    tableSource: { table1: { id: "table1", rows: [[value]] } },
    drawings: { drawing1: { id: "drawing1", source: value } },
    body: {
      dataStream: `${text}\r\0`,
      paragraphs: [
        { paragraphId: "p1", startIndex: text.length },
        { paragraphId: "sentinel", startIndex: text.length + 1 },
      ],
      textRuns: [{ st: 0, ed: text.length, ts: { bl: value === "after" ? 1 : 0 } }],
      sectionBreaks: [{ sectionId: "section1", startIndex: text.length, pageNumber: value }],
      blockRanges: [{ blockId: "block1", startIndex: 0, endIndex: 1, config: value }],
      customRanges: [{ rangeId: "range1", startIndex: 0, endIndex: 1, config: value }],
      tables: [{ tableId: "table1", startIndex: 0, endIndex: 1, config: value }],
      customBlocks: [{ blockId: "custom1", startIndex: 0, config: value }],
      columnGroups: [{ columnGroupId: "columns1", startIndex: 0, endIndex: 1, config: value }],
      customDecorations: [{ id: "decoration1", color: value }],
    },
    resources: [
      resource("DOC_HYPER_LINK_PLUGIN", { links: { link1: { id: "link1", url: value } } }),
      resource("DOC_CALLOUT_PLUGIN", { callouts: { callout1: { id: "callout1", text: value } } }),
      resource("DOC_CHART_PLUGIN", {
        charts: { chart1: { id: "chart1", title: value } },
        dataSources: { source1: [[value]] },
      }),
      resource("DOC_CODE_PLUGIN", { codes: { code1: { id: "code1", language: value } } }),
      resource("DOC_LATEX_PLUGIN", { formulas: { formula1: { id: "formula1", latex: value } } }),
      resource("DOC_SHAPE_PLUGIN", { shape1: { id: "shape1", fill: value } }),
      resource("DOC_TABLE_PLUGIN", { tables: { table1: { id: "table1", style: value } } }),
    ],
  };
}

function featureSlide(value: string) {
  return {
    slideOrder: ["page1"],
    slides: {
      page1: {
        id: "page1",
        elementOrder: ["shape1"],
        elements: { shape1: { id: "shape1", text: value } },
      },
    },
    transitionRecords: { transition1: { id: "transition1", type: value } },
    slideTransitionRefs: { page1: value },
    masterPages: { master1: { id: "master1", background: value } },
    layoutPages: { layout1: { id: "layout1", name: value } },
    theme: { id: "theme1", name: value },
    resources: [
      resource("SLIDE_CHART_PLUGIN", {
        charts: { chart1: { id: "chart1", title: value } },
        dataSources: { source1: [[value]] },
      }),
      resource("SLIDE_TABLE_PLUGIN", { tables: { table1: { id: "table1", value } } }),
    ],
  };
}

function featureBoard(value: string) {
  return {
    pageOrder: ["page1"],
    pages: {
      page1: {
        id: "page1",
        elementOrder: ["shape1"],
        elements: { shape1: { id: "shape1", text: value } },
      },
    },
    theme: { id: "theme1", name: value },
    resources: [
      resource("BOARD_CHART_PLUGIN", {
        charts: { chart1: { id: "chart1", title: value } },
        dataSources: { source1: [[value]] },
      }),
      resource("BOARD_TABLE_PLUGIN", { tables: { table1: { id: "table1", value } } }),
    ],
  };
}

function baseWithInsertedRecord(value: string) {
  const snapshot = baseSnapshot(value);
  return {
    ...snapshot,
    tables: {
      ...snapshot.tables,
      table1: {
        ...snapshot.tables.table1,
        recordOrder: ["record1", "record2"],
        records: {
          ...snapshot.tables.table1.records,
          record2: { id: "record2", values: { field1: "Inserted" } },
        },
      },
    },
  };
}

function resource(name: string, data: unknown) {
  return { name, data: JSON.stringify(data) };
}
