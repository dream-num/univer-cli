import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IMutation } from "@univerjs/protocol";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { countAssetRows } from "./asset-counts.js";
import { changeWorktree } from "./change-worktree.js";

const PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";
const SVG_DATA_URI = "data:image/svg+xml;base64,PHN2Zy8+";

describe("embedded image externalization", () => {
  it("stores supported BASE64 bytes once and commits UUID references", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gw-embedded-images-"));
    const dbPath = join(directory, "book.univer");
    const service = new CollabService({ dbPath, create: true });
    try {
      const sheet = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
      const worktree = await service.createWorktree("agent");
      await changeWorktree(service, worktree.worktreeId, "image", {
        modify: {
          [sheet.unitId]: [
            mutation(sheet.unitId, {
              source: PNG_DATA_URI,
              imageSourceType: "BASE64",
              duplicate: { source: PNG_DATA_URI, sourceType: "BASE64" },
              preservedSvg: { source: SVG_DATA_URI, imageSourceType: "BASE64" },
              preservedUrl: { source: "https://example.test/image.png", imageSourceType: "URL" }
            })
          ]
        }
      });

      const loaded = await service.worktreeGetUnitOnRev(worktree.worktreeId, sheet.unitId, 0);
      const params = JSON.parse(loaded.changesets[0]?.mutations[0]?.data ?? "{}") as {
        cellValue?: Record<string, Record<string, Record<string, unknown>>>;
      };
      const cell = params.cellValue?.[0]?.[0];
      if (cell === undefined) throw new Error("Externalized cell payload is missing");
      expect(cell.imageSourceType).toBe("UUID");
      expect(cell.source).toEqual(expect.any(String));
      expect(cell.source).not.toBe(PNG_DATA_URI);
      expect((cell.duplicate as Record<string, unknown>).sourceType).toBe("UUID");
      expect((cell.duplicate as Record<string, unknown>).source).toBe(cell.source);
      expect((cell.preservedSvg as Record<string, unknown>).source).toBe(SVG_DATA_URI);
      expect((cell.preservedUrl as Record<string, unknown>).source).toBe(
        "https://example.test/image.png"
      );
      expect(countAssetRows(dbPath)).toEqual({ assets: 1, blobs: 1 });

      const merged = await service.merge(worktree.worktreeId);
      expect(merged.ok).toBe(true);
      expect(service.openAsset(String(cell.source))).not.toBeNull();
    } finally {
      await service.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function mutation(unitId: string, value: Record<string, unknown>): IMutation {
  return {
    id: "sheet.mutation.set-range-values",
    data: JSON.stringify({
      unitId,
      subUnitId: "sheet-1",
      cellValue: { 0: { 0: value } }
    })
  } as IMutation;
}
