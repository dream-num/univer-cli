import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IUniverInstanceService, type Univer } from "@univerjs/core";
import { IRenderManagerService } from "@univerjs/engine-render";
import { captureDocLayout, paperSize } from "../src/doc-ops.js";
import type { LoadedUnit } from "../src/units.js";

describe("captureDocLayout", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the skeleton paragraph start index to the projected paragraph id", async () => {
    const skeleton = {
      getActualSize: () => ({ actualWidth: 800, actualHeight: 1100 }),
      getSkeletonData: () => ({
        pages: [
          {
            pageWidth: Number.POSITIVE_INFINITY,
            pageHeight: Number.POSITIVE_INFINITY,
            marginLeft: 0,
            marginRight: 0,
            marginTop: 0,
            width: 800,
            height: 1100,
            sections: [
              {
                top: 0,
                columns: [
                  {
                    lines: [
                      { paragraphIndex: 5, top: 10, lineHeight: 20, width: 100 },
                      { paragraphIndex: 5, top: 30, lineHeight: 20, width: 90 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    };
    const render = { mainComponent: { getSkeleton: () => skeleton } };
    const injector = {
      get(token: unknown): unknown {
        if (token === IUniverInstanceService) return { focusUnit: vi.fn() };
        if (token === IRenderManagerService) return { getRenderUnitById: () => render };
        throw new Error("unexpected dependency");
      },
    };
    const univer = { __getInjector: () => injector } as unknown as Univer;
    const unit: LoadedUnit = {
      unitKey: "doc::4",
      unitType: "doc",
      unitId: "doc-1",
      embeddedUnitIds: [],
      referenceUnitIds: [],
      unitData: {
        id: "doc-1",
        body: { paragraphs: [{ paragraphId: "p1", startIndex: 5 }] },
      },
      lastUsedAt: 0,
    };

    await expect(captureDocLayout(univer, unit)).resolves.toEqual({
      pages: [
        {
          page: 1,
          width: 800,
          height: 1100,
          paragraphs: [{ paragraphIndex: 5, paragraphId: "p1", top: 10, height: 40, width: 100 }],
        },
      ],
    });
  });

  it("captures paragraphs inside a Modern Doc column group", async () => {
    const columnPage = (paragraphIndex: number, top: number) => ({
      marginLeft: 0,
      marginRight: 0,
      marginTop: 2,
      sections: [
        {
          top: 4,
          columns: [
            {
              left: 0,
              width: 180,
              lines: [{ paragraphIndex, top, lineHeight: 20, width: 100 }],
            },
          ],
        },
      ],
    });
    const skeleton = {
      getActualSize: () => ({ actualWidth: 800, actualHeight: 1100 }),
      getSkeletonData: () => ({
        pages: [
          {
            pageWidth: Number.POSITIVE_INFINITY,
            pageHeight: Number.POSITIVE_INFINITY,
            marginLeft: 0,
            marginRight: 0,
            marginTop: 0,
            width: 800,
            height: 1100,
            sections: [
              {
                top: 0,
                columns: [
                  {
                    lines: [
                      { paragraphIndex: 0, top: 10, lineHeight: 20, width: 80 },
                      { paragraphIndex: 62, top: 40, lineHeight: 70, width: 0 },
                    ],
                  },
                ],
              },
            ],
            skeColumnGroups: new Map([
              [
                "group-1",
                {
                  left: 0,
                  top: 40,
                  columns: [
                    { left: 0, top: 3, width: 180, page: columnPage(10, 5) },
                    { left: 200, top: 7, width: 180, page: columnPage(20, 5) },
                    { left: 400, top: 11, width: 180, page: columnPage(30, 5) },
                  ],
                },
              ],
            ]),
          },
        ],
      }),
    };
    const render = { mainComponent: { getSkeleton: () => skeleton } };
    const injector = {
      get(token: unknown): unknown {
        if (token === IUniverInstanceService) return { focusUnit: vi.fn() };
        if (token === IRenderManagerService) return { getRenderUnitById: () => render };
        throw new Error("unexpected dependency");
      },
    };
    const univer = { __getInjector: () => injector } as unknown as Univer;
    const unit: LoadedUnit = {
      unitKey: "doc::column-group",
      unitType: "doc",
      unitId: "doc-1",
      embeddedUnitIds: [],
      referenceUnitIds: [],
      unitData: {
        id: "doc-1",
        body: {
          paragraphs: [
            { paragraphId: "p0", startIndex: 0 },
            { paragraphId: "p1", startIndex: 10 },
            { paragraphId: "p2", startIndex: 20 },
            { paragraphId: "p3", startIndex: 30 },
          ],
        },
      },
      lastUsedAt: 0,
    };

    await expect(captureDocLayout(univer, unit)).resolves.toEqual({
      pages: [
        {
          page: 1,
          width: 800,
          height: 1100,
          paragraphs: [
            { paragraphIndex: 0, paragraphId: "p0", top: 10, height: 20, width: 80 },
            { paragraphIndex: 10, paragraphId: "p1", top: 54, height: 20, width: 100 },
            { paragraphIndex: 20, paragraphId: "p2", top: 58, height: 20, width: 100 },
            { paragraphIndex: 30, paragraphId: "p3", top: 62, height: 20, width: 100 },
          ],
        },
      ],
    });
  });
});

describe("paperSize", () => {
  it("uses the fixed physical page size for a Traditional Doc", () => {
    expect(
      paperSize({
        pageWidth: 816,
        pageHeight: 1056,
        width: 120,
        height: 80,
        marginTop: 96,
        marginBottom: 96,
        marginLeft: 96,
        marginRight: 96,
      }),
    ).toEqual({ width: 816, height: 1056 });
  });

  it("falls back to used content plus margins for a Modern Doc", () => {
    expect(
      paperSize({
        pageWidth: Number.POSITIVE_INFINITY,
        pageHeight: Number.POSITIVE_INFINITY,
        width: 600,
        height: 80,
        marginTop: 24,
        marginBottom: 32,
        marginLeft: 12,
        marginRight: 16,
      }),
    ).toEqual({ width: 628, height: 136 });
  });
});
