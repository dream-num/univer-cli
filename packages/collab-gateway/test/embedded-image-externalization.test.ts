import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transformSnapshotToDocumentData } from "@univerjs-pro/collaboration";
import { getDocsEmptySnapshot, LocaleType, UniverInstanceType } from "@univerjs/core";
import { ErrorCode, type INewChangesRequest, type INewChangesResponse } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { startServer } from "../src/server.js";
import { countAssetRows } from "./asset-counts.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xkAAAAASUVORK5CYII=";
const PNG_DATA_URI = `data:image/png;base64,${PNG_BASE64}`;
const SVG_DATA_URI = "data:image/svg+xml;base64,PHN2Zy8+";

describe("embedded images in Worktrees", () => {
  it("stores duplicate inline images once when creating a Doc and retains the asset on merge", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gw-embedded-images-"));
    const dbPath = join(directory, "book.univer");
    const service = new CollabService({ dbPath, create: true });
    try {
      const { worktreeId } = await service.createWorktree("agent");
      const unitId = "doc";
      const png = { source: PNG_DATA_URI, imageSourceType: "BASE64" };
      const svg = { source: SVG_DATA_URI, imageSourceType: "BASE64" };
      const url = { source: "https://example.test/image.png", imageSourceType: "URL" };
      await service.createWorktreeUnit(worktreeId, UniverInstanceType.UNIVER_DOC, "Doc", unitId, {
        ...getDocsEmptySnapshot(unitId, LocaleType.EN_US, "Doc"),
        drawings: { first: png, second: { source: PNG_DATA_URI, sourceType: "BASE64" }, svg, url },
      });

      const { snapshot } = await service.worktreeGetUnitOnRev(worktreeId, unitId, 0);
      if (!snapshot) throw new Error("Missing Doc snapshot");
      const { drawings } = await transformSnapshotToDocumentData(snapshot);
      const first = drawings?.first;
      if (!first || !("source" in first) || typeof first.source !== "string") {
        throw new Error("Missing first image source");
      }
      expect(drawings).toMatchObject({
        first: { imageSourceType: "UUID" },
        second: { source: first.source, sourceType: "UUID" },
        svg,
        url,
      });
      expect(countAssetRows(dbPath)).toEqual({ assets: 1, blobs: 1 });
      expect((await service.merge(worktreeId)).ok).toBe(true);
      const asset = service.openAsset(first.source);
      expect(asset && Buffer.from(asset.bytes).toString("base64")).toBe(PNG_BASE64);
    } finally {
      await service.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("persists inline image parameters as submitted through the Worktree HTTP endpoint", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gw-worktree-submit-"));
    const server = await startServer({ port: 0, allowedRoot: directory });
    try {
      const dbPath = join(directory, "book.univer");
      const key = Buffer.from(dbPath).toString("base64url");
      const { collab } = server.manager.createByKey(key);
      const type = UniverInstanceType.UNIVER_SHEET;
      const { unitId } = await collab.createUnit(type);
      const { worktreeId } = await collab.createWorktree();
      const mutation = {
        id: "sheet.mutation.set-range-values",
        data: JSON.stringify({
          unitId,
          subUnitId: "sheet-1",
          cellValue: { 0: { 0: { custom: { source: PNG_DATA_URI, imageSourceType: "BASE64" } } } },
        }),
      };
      const request: INewChangesRequest = {
        unitID: unitId,
        type,
        memberID: "test",
        changeset: {
          unitID: unitId,
          type,
          baseRev: 1,
          revision: 0,
          userID: "local",
          memberID: "test",
          sid: "test",
          reqId: 1,
          mutations: [mutation],
        },
      };
      const response = await fetch(
        `http://127.0.0.1:${server.port}/uf/${key}/worktrees/${worktreeId}/universer-api/comb/${type}/unit/${unitId}/new_changes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json() as INewChangesResponse;
      expect(body.error?.code).toBe(ErrorCode.OK);
      const { changesets } = await collab.worktreeGetUnitOnRev(worktreeId, unitId, 0);
      expect(changesets).toMatchObject([{ revision: 2, mutations: [mutation] }]);
      expect(countAssetRows(dbPath)).toEqual({ assets: 0, blobs: 0 });
    } finally {
      await server.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
