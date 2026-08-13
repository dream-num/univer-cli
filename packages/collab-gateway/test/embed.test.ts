import type { IChangeset as IProtocolChangeset, IMutation } from "@univerjs/protocol";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";

const DOC = UniverInstanceType.UNIVER_DOC;
const SHEET = UniverInstanceType.UNIVER_SHEET;
const DEFAULT_SUB_UNIT_ID = "sheet-1";

function setEmbedDescriptorMutation(hostUnitId: string, childUnitId: string): IMutation[] {
  return [
    {
      id: "embed.mutation.set-descriptor",
      data: JSON.stringify({
        unitId: hostUnitId,
        descriptor: {
          embedId: "embed-doc-sheet",
          hostUnitId,
          hostType: DOC,
          entry: "docs-custom-block",
          hostAnchorId: "embed-doc-sheet-anchor",
          source: {
            kind: "ref",
            ref: {
              file: { kind: "self" },
              unit: { selector: childUnitId, type: "sheet" }
            },
            unitType: SHEET
          },
          childUnitId,
          childType: SHEET,
          mode: "interactive",
          lifecycle: "active",
          createdAt: 1,
          updatedAt: 1
        }
      })
    }
  ] as unknown as IMutation[];
}

function sheetFloatingEmbedMutations(hostUnitId: string, childUnitId: string): IMutation[] {
  const embedId = "embed-sheet-1";
  const hostAnchorId = `sheets-floating:${embedId}`;
  const hostContext = {
    subUnitId: DEFAULT_SUB_UNIT_ID,
    left: 80,
    top: 80,
    width: 560,
    height: 360
  };

  return [
    {
      id: "sheet.mutation.set-drawing-apply",
      data: JSON.stringify({
        unitId: hostUnitId,
        subUnitId: DEFAULT_SUB_UNIT_ID,
        op: [
          hostUnitId,
          DEFAULT_SUB_UNIT_ID,
          [
            "data",
            hostAnchorId,
            {
              i: {
                unitId: hostUnitId,
                subUnitId: DEFAULT_SUB_UNIT_ID,
                drawingId: hostAnchorId,
                drawingType: 9,
                componentKey: "UniverEmbedSheetsFloatingObject",
                sheetTransform: {
                  from: { column: 0, columnOffset: 80, row: 0, rowOffset: 80 },
                  to: { column: 0, columnOffset: 640, row: 0, rowOffset: 440 }
                },
                axisAlignSheetTransform: {
                  flipY: false,
                  flipX: false,
                  angle: 0,
                  skewX: 0,
                  skewY: 0,
                  from: { row: 3, rowOffset: 8, column: 0, columnOffset: 80 },
                  to: { row: 18, rowOffset: 8, column: 7, columnOffset: 24 }
                },
                transform: {
                  flipY: false,
                  flipX: false,
                  angle: 0,
                  skewX: 0,
                  skewY: 0,
                  left: 126,
                  top: 100,
                  width: 560,
                  height: 360
                },
                data: {
                  version: 1,
                  embedId,
                  hostType: SHEET,
                  childType: SHEET,
                  hostUnitId,
                  hostAnchorId,
                  runtimeMountMode: "stage2",
                  disablePopup: true
                },
                allowTransform: true
              }
            }
          ],
          ["order", 0, { i: hostAnchorId }]
        ],
        objects: [{ unitId: hostUnitId, subUnitId: DEFAULT_SUB_UNIT_ID, drawingId: hostAnchorId }],
        type: 0,
        trigger: "embed.command.create"
      })
    },
    {
      id: "embed.mutation.set-host-anchor-record",
      data: JSON.stringify({
        unitId: hostUnitId,
        record: {
          hostAnchorId,
          embedId,
          hostUnitId,
          hostType: SHEET,
          entry: "sheets-floating-object",
          kind: "sheets-floating-object",
          hostContext,
          lifecycle: "active"
        }
      })
    },
    {
      id: "embed.mutation.set-descriptor",
      data: JSON.stringify({
        unitId: hostUnitId,
        descriptor: {
          embedId,
          hostUnitId,
          hostType: SHEET,
          hostAnchorId,
          entry: "sheets-floating-object",
          source: {
            kind: "ref",
            ref: {
              file: { kind: "self" },
              unit: { selector: childUnitId, type: "sheet" }
            },
            unitType: SHEET
          },
          childUnitId,
          childType: SHEET,
          mode: "interactive"
        }
      })
    }
  ] as unknown as IMutation[];
}

function richTextEditMutation(unitId: string): IMutation {
  return {
    id: "doc.mutation.rich-text-editing",
    data: JSON.stringify({
      unitId,
      textRanges: null,
      actions: [
        "body",
        {
          et: "text-x",
          e: [
            {
              t: "i",
              body: {
                dataStream: "!",
                textRuns: [{ st: 0, ed: 1, ts: { fs: 18 } }],
                customDecorations: [],
                customRanges: []
              },
              len: 1
            }
          ]
        }
      ]
    })
  } as unknown as IMutation;
}

function embedChangeset(
  unitId: string,
  type: number,
  baseRev: number,
  mutations: IMutation[]
): IProtocolChangeset {
  return {
    unitID: unitId,
    type,
    baseRev,
    revision: 0,
    userID: "u1",
    memberID: "m1",
    mutations,
    sid: "embed-session",
    reqId: 1,
    createTime: Date.now()
  } as unknown as IProtocolChangeset;
}

describe("Embed mutation support", () => {
  it("applies embed descriptor mutations on the gateway trunk", async () => {
    const svc = new CollabService();
    try {
      const host = await svc.createUnit(DOC, { name: "Host doc" });
      const child = await svc.createUnit(SHEET, { name: "Embedded sheet" });

      const result = await svc.submit(
        host.unitId,
        DOC,
        embedChangeset(host.unitId, DOC, 1, setEmbedDescriptorMutation(host.unitId, child.unitId))
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(svc.getCurrentRev(host.unitId)).toBe(2);
    } finally {
      svc.dispose();
    }
  });

  it("applies sheet-floating embed mutations on the gateway trunk", async () => {
    const svc = new CollabService();
    try {
      const host = await svc.createUnit(SHEET, { name: "Host sheet" });
      const child = await svc.createUnit(SHEET, { name: "Embedded sheet" });

      const result = await svc.submit(
        host.unitId,
        SHEET,
        embedChangeset(
          host.unitId,
          SHEET,
          1,
          sheetFloatingEmbedMutations(host.unitId, child.unitId)
        )
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(svc.getCurrentRev(host.unitId)).toBe(2);
    } finally {
      svc.dispose();
    }
  });

  it("rejects a malformed handcrafted doc rich-text changeset", async () => {
    const svc = new CollabService();
    try {
      const doc = await svc.createUnit(DOC, {
        name: "Editable doc",
        data: {
          body: {
            dataStream: "Editable doc\r\n",
            textRuns: [{ st: 0, ed: "Editable doc".length, ts: { fs: 18 } }],
            customBlocks: [],
            tables: [],
            blockRanges: [],
            customRanges: [],
            customDecorations: [],
            paragraphs: [{ startIndex: "Editable doc".length, paragraphId: "p-0" }],
            sectionBreaks: [{ startIndex: "Editable doc".length + 1, sectionId: "section-0" }]
          },
          documentStyle: {}
        }
      });

      const result = await svc.submit(
        doc.unitId,
        DOC,
        embedChangeset(doc.unitId, DOC, 1, [richTextEditMutation(doc.unitId)])
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(svc.getCurrentRev(doc.unitId)).toBe(1);
    } finally {
      svc.dispose();
    }
  });
});
