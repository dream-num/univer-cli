import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverInstanceType } from "@univerjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type StartedServer } from "../src/server.js";
import { MAX_UNIVERFILE_ASSET_BYTES } from "@univer/univerfile-sqlite";

const BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

describe("local Univer File API", () => {
  let server: StartedServer;
  let dir: string;
  let key: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gw-assets-"));
    server = await startServer({ port: 0 });
    key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    server.manager.createByKey(key);
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("uploads, signs and serves trunk assets without putting bytes in protocol payloads", async () => {
    const univerfile = server.manager.resolveByKey(key);
    const unit = await univerfile.collab.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });

    const fileId = await upload({ unitId: unit.unitId });
    const signed = await fetch(`${origin()}/uf/${key}/universer-api/file/${fileId}/sign-url`);
    expect(signed.status).toBe(200);
    const signedBody = (await signed.json()) as { url: string };
    expect(signedBody.url).toBe(`${origin()}/uf/${key}/universer-api/file/${fileId}/content`);

    const content = await fetch(signedBody.url);
    expect(content.status).toBe(200);
    expect(content.headers.get("content-type")).toBe("image/png");
    expect(content.headers.get("cache-control")).toBe("private, no-store");
    expect(content.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(BYTES);
  });

  it("isolates worktree assets, publishes them on merge, and deduplicates identical blobs", async () => {
    const univerfile = server.manager.resolveByKey(key);
    const unit = await univerfile.collab.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
    const worktree = univerfile.collab.createWorktree("agent");

    const first = await upload({ unitId: unit.unitId, worktreeId: worktree.worktreeId });
    const second = await upload({ unitId: unit.unitId, worktreeId: worktree.worktreeId });
    expect(first).not.toBe(second);
    expect(univerfile.collab.runtime.assetStore.countAssets()).toBe(2);
    expect(univerfile.collab.runtime.assetStore.countBlobs()).toBe(1);

    const trunkBefore = await fetch(`${origin()}/uf/${key}/universer-api/file/${first}/content`);
    expect(trunkBefore.status).toBe(404);
    const draft = await fetch(
      `${origin()}/uf/${key}/worktrees/${worktree.worktreeId}/universer-api/file/${first}/content`
    );
    expect(draft.status).toBe(200);

    const merged = await univerfile.collab.merge(worktree.worktreeId);
    expect(merged.ok).toBe(true);
    const trunkAfter = await fetch(`${origin()}/uf/${key}/universer-api/file/${first}/content`);
    expect(trunkAfter.status).toBe(200);
  });

  it("rejects uploads that do not target an existing unit", async () => {
    const response = await uploadResponse({ unitId: "missing-unit" });
    expect(response.status).toBe(404);
  });

  it("limits each uploaded asset to 50 MiB", async () => {
    expect(MAX_UNIVERFILE_ASSET_BYTES).toBe(50 * 1024 * 1024);
    const univerfile = server.manager.resolveByKey(key);
    const unit = await univerfile.collab.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
    const response = await fetch(
      `${origin()}/uf/${key}/universer-api/stream/file/upload?size=${MAX_UNIVERFILE_ASSET_BYTES + 1}&source=3&assign=${unit.unitId}`,
      { method: "POST" }
    );
    expect(response.status).toBe(413);
  });

  async function upload(input: { unitId: string; worktreeId?: string }): Promise<string> {
    const response = await uploadResponse(input);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { FileId: string };
    return body.FileId;
  }

  async function uploadResponse(input: { unitId: string; worktreeId?: string }): Promise<Response> {
    const form = new FormData();
    form.append("file", new Blob([BYTES], { type: "image/png" }), "pixel.png");
    const scope = input.worktreeId === undefined ? "" : `/worktrees/${input.worktreeId}`;
    return await fetch(
      `${origin()}/uf/${key}${scope}/universer-api/stream/file/upload?size=${BYTES.byteLength}&source=3&assign=${input.unitId}`,
      { method: "POST", body: form }
    );
  }

  function origin(): string {
    return `http://127.0.0.1:${server.port}`;
  }
});
