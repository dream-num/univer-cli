import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type StartedServer } from "../src/server.js";
import { MAX_EXCHANGE_FILE_BYTES } from "../src/exchange/gateway-exchange-service.js";

describe("Universer exchange File API", () => {
  let server: StartedServer;
  let dir: string;
  let key: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gw-exchange-"));
    server = await startServer({ port: 0 });
    key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    server.manager.createByKey(key);
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports into the addressed Univerfile trunk and exports through task + sign-url", async () => {
    const csv = Buffer.from("name,value\nalpha,42\n", "utf8");
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "数据.csv");
    const uploaded = await fetch(
      `${base()}/universer-api/stream/file/upload?size=${csv.byteLength}&source=1&flate=false`,
      { method: "POST", body: form },
    );
    expect(uploaded.status).toBe(201);
    const { FileId } = (await uploaded.json()) as { FileId: string };

    const importStarted = await postJson<{ taskID: string }>(
      `${base()}/universer-api/exchange/2/import`,
      { fileID: FileId, outputType: 1, options: {} },
    );
    const imported = await waitForTask(importStarted.taskID);
    expect(imported).toMatchObject({
      error: { code: 1 },
      status: "done",
      import: { outputType: 1, jsonID: "" },
    });
    const unitID = (imported.import as { unitID: string }).unitID;
    expect(server.manager.resolveByKey(key).collab.listUnits()).toEqual([
      expect.objectContaining({ unitId: unitID, type: 2 }),
    ]);

    const exportStarted = await postJson<{ taskID: string }>(
      `${base()}/universer-api/exchange/2/export`,
      { unitID, format: "xlsx", options: {} },
    );
    const exported = await waitForTask(exportStarted.taskID);
    const fileID = (exported.export as { fileID: string }).fileID;
    const signed = await fetch(`${base()}/universer-api/file/${fileID}/sign-url`);
    expect(signed.status).toBe(200);
    const signBody = (await signed.json()) as { url: string; mode: number };
    expect(signBody).toEqual({
      error: { code: 1, message: "" },
      url: `/uf/${key}/universer-api/file/${fileID}/content`,
      mode: 1,
    });
    const content = await fetch(`${origin()}${signBody.url}`);
    expect(content.status).toBe(200);
    expect(content.headers.get("content-disposition")).toContain("attachment;");
    expect(content.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect((await content.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });

  it("keeps exchange trunk-only and preserves the 50 MiB protocol limit", async () => {
    expect(MAX_EXCHANGE_FILE_BYTES).toBe(50 * 1024 * 1024);
    const worktree = server.manager.resolveByKey(key).collab.createWorktree("agent");
    const response = await fetch(
      `${base()}/worktrees/${worktree.worktreeId}/universer-api/exchange/2/import`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileID: "missing", outputType: 1 }),
      },
    );
    expect(response.status).toBe(404);
  });

  async function waitForTask(taskID: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await fetch(`${base()}/universer-api/exchange/task/${taskID}`);
      expect(response.status).toBe(200);
      const task = (await response.json()) as Record<string, unknown>;
      if (task.status !== "pending") return task;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Exchange task ${taskID} did not settle.`);
  }

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as T;
  }

  function origin(): string {
    return `http://127.0.0.1:${server.port}`;
  }

  function base(): string {
    return `${origin()}/uf/${key}`;
  }
});
