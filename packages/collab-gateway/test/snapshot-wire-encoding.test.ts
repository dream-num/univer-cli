import type { ISnapshot } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import { encodeSnapshotForWire } from "../src/transport/http.js";

/**
 * `originalMeta` 在协议里是 bytes;HTTP 响应须编成 base64 字符串(客户端按 base64 解码)。
 * 回归:doc 单元的快照挂在 `.doc`(无 `.workbook`),此前被整体跳过,originalMeta 以原始
 * 字节数组发出,客户端物化时抛 "doc.originalMeta must be a string"。
 */
describe("encodeSnapshotForWire", () => {
  it("base64-encodes a doc snapshot's byte originalMeta", () => {
    const meta = Buffer.from('{"documentStyle":{}}', "utf8");
    const snapshot = {
      unitID: "doc-1",
      type: 1,
      doc: { unitID: "doc-1", name: "Doc", originalMeta: new Uint8Array(meta) }
    } as unknown as ISnapshot;

    const encoded = encodeSnapshotForWire(snapshot) as unknown as {
      doc: { originalMeta: unknown };
    };

    expect(typeof encoded.doc.originalMeta).toBe("string");
    expect(encoded.doc.originalMeta).toBe(meta.toString("base64"));
  });

  it("still base64-encodes workbook + sheet originalMeta", () => {
    const wbMeta = Buffer.from('{"appVersion":"x"}', "utf8");
    const sheetMeta = Buffer.from('{"name":"S"}', "utf8");
    const snapshot = {
      unitID: "wb-1",
      type: 2,
      workbook: {
        unitID: "wb-1",
        originalMeta: new Uint8Array(wbMeta),
        sheets: { s1: { id: "s1", originalMeta: new Uint8Array(sheetMeta) } }
      }
    } as unknown as ISnapshot;

    const encoded = encodeSnapshotForWire(snapshot) as unknown as {
      workbook: { originalMeta: unknown; sheets: Record<string, { originalMeta: unknown }> };
    };

    expect(encoded.workbook.originalMeta).toBe(wbMeta.toString("base64"));
    expect(encoded.workbook.sheets.s1?.originalMeta).toBe(sheetMeta.toString("base64"));
  });

  it("base64-encodes a slide snapshot's .slide AND embedded .doc originalMeta", () => {
    // A slide snapshot carries its text content as `.doc` alongside `.slide`; the old
    // early-return on `.doc` left the slide's `.slide` bytes raw (client then threw on
    // materialize). Both metas must be base64-encoded.
    const slideMeta = Buffer.from('{"slideOrder":[]}', "utf8");
    const docMeta = Buffer.from('{"documentStyle":{}}', "utf8");
    const snapshot = {
      unitID: "slide-1",
      type: 3,
      slide: { unitID: "slide-1", name: "Deck", originalMeta: new Uint8Array(slideMeta) },
      doc: { unitID: "slide-1", name: "Deck", originalMeta: new Uint8Array(docMeta) }
    } as unknown as ISnapshot;

    const encoded = encodeSnapshotForWire(snapshot) as unknown as {
      slide: { originalMeta: unknown };
      doc: { originalMeta: unknown };
    };

    expect(encoded.slide.originalMeta).toBe(slideMeta.toString("base64"));
    expect(encoded.doc.originalMeta).toBe(docMeta.toString("base64"));
  });

  it("base64-encodes a board snapshot's byte originalMeta", () => {
    const meta = Buffer.from('{"pageOrder":["page-1"]}', "utf8");
    const snapshot = {
      unitID: "board-1",
      type: 6,
      board: { unitID: "board-1", name: "Board", originalMeta: new Uint8Array(meta) }
    } as unknown as ISnapshot;

    const encoded = encodeSnapshotForWire(snapshot) as unknown as {
      board: { originalMeta: unknown };
    };

    expect(encoded.board.originalMeta).toBe(meta.toString("base64"));
  });
});
