import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GATEWAY_CAPABILITIES,
  GATEWAY_DESCRIPTOR_MEDIA_TYPE,
  GATEWAY_PROTOCOL_VERSION
} from "@univer/collab-gateway-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, type StartedServer } from "../src/server.js";

describe("gateway file descriptor endpoint", () => {
  let dir: string;
  let server: StartedServer;

  beforeEach(async () => {
    // realpath 归一:macOS 上 tmpdir 是 /var → /private/var 的符号链接,manager 会按 realpath
    // 归一存储路径,断言侧必须同基准比较。
    dir = realpathSync(mkdtempSync(join(tmpdir(), "gw-descriptor-")));
    const viewRoot = join(dir, "view");
    mkdirSync(join(viewRoot, "assets"), { recursive: true });
    writeFileSync(join(viewRoot, "index.html"), "<!doctype html><title>gateway viewer</title>");
    writeFileSync(join(viewRoot, "assets", "app.js"), "window.__gatewayViewer = true;\n");
    server = await startServer({
      port: 0,
      allowedRoot: dir,
      viewAssetsRoot: viewRoot
    });
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { force: true, recursive: true });
  });

  it("describes an addressable /uf endpoint before create, then preserves create and units routes", async () => {
    const filePath = join(dir, "budget.univer");
    const key = Buffer.from(filePath).toString("base64url");
    const fileEndpoint = `http://127.0.0.1:${server.port}/uf/${key}`;

    const descriptor = await fetch(fileEndpoint, {
      headers: { accept: GATEWAY_DESCRIPTOR_MEDIA_TYPE }
    });
    expect(descriptor.status).toBe(200);
    expect(descriptor.headers.get("content-type")).toContain(GATEWAY_DESCRIPTOR_MEDIA_TYPE);
    expect(await descriptor.json()).toEqual({
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      capabilities: GATEWAY_CAPABILITIES,
      viewUrl: `/?file=${key}`
    });

    const created = await fetch(fileEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ error: { code: 1, message: "" } });

    const duplicate = await fetch(fileEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    expect(duplicate.status).toBe(409);

    const units = await fetch(`${fileEndpoint}/units`);
    expect(units.status).toBe(200);
    expect(await units.json()).toEqual({ error: { code: 1, message: "" }, units: [] });
  });

  it("serves viewer shell and worktree lifecycle from the same /uf endpoint URI", async () => {
    const filePath = join(dir, "workflow.univer");
    const key = Buffer.from(filePath).toString("base64url");
    const origin = `http://127.0.0.1:${server.port}`;
    const fileEndpoint = `${origin}/uf/${key}`;

    await postJson(fileEndpoint, {});

    const viewer = await fetch(`${origin}/?file=${key}`);
    expect(viewer.status).toBe(200);
    expect(await viewer.text()).toContain("gateway viewer");

    const resourceGet = await fetch(fileEndpoint);
    expect(resourceGet.status).toBe(404);

    const created = await postJson<{
      error: { code: number };
      worktreeId: string;
      status: string;
      baseline: Record<string, number>;
    }>(`${fileEndpoint}/worktrees`, { agentId: "agent-a", name: "task-a" });
    expect(created.error.code).toBe(1);
    expect(created.status).toBe("draft");
    expect(created.baseline).toEqual({});

    const listed = await getJson<{
      error: { code: number };
      worktrees: Array<{ agentId: string; name: string; worktreeId: string }>;
    }>(`${fileEndpoint}/worktrees`);
    expect(listed.worktrees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "agent-a",
          name: "task-a",
          worktreeId: created.worktreeId
        })
      ])
    );

    const ready = await postJson<{
      error: { code: number };
      ok: true;
      status: string;
      worktree: { worktreeId: string; status: string };
    }>(`${fileEndpoint}/worktrees/${created.worktreeId}/ready`, {});
    expect(ready).toMatchObject({
      error: { code: 1 },
      ok: true,
      status: "ready",
      worktree: { worktreeId: created.worktreeId, status: "ready" }
    });

    const commitPost = await fetch(`${fileEndpoint}/worktrees/${created.worktreeId}/commits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ops: {} })
    });
    expect(commitPost.status).toBe(404);
    expect((await fetch(`${fileEndpoint}/worktrees/${created.worktreeId}/commits`)).status).toBe(404);
    expect(
      (
        await fetch(`${fileEndpoint}/worktrees/${created.worktreeId}/rollback`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        })
      ).status
    ).toBe(404);

    const reopened = await postJson<{ error: { code: number }; ok: true; status: string }>(
      `${fileEndpoint}/worktrees/${created.worktreeId}/reopen`,
      {}
    );
    expect(reopened).toMatchObject({ error: { code: 1 }, ok: true, status: "draft" });

    const readyAgain = await postJson<{ error: { code: number }; ok: true; status: string }>(
      `${fileEndpoint}/worktrees/${created.worktreeId}/ready`,
      {}
    );
    expect(readyAgain).toMatchObject({ error: { code: 1 }, ok: true, status: "ready" });

    const discardTarget = await postJson<{ worktreeId: string }>(`${fileEndpoint}/worktrees`, {
      name: "discard-task"
    });
    const discarded = await postJson<{ error: { code: number }; ok: true }>(
      `${fileEndpoint}/worktrees/${discardTarget.worktreeId}/discard`,
      {}
    );
    expect(discarded).toMatchObject({ error: { code: 1 }, ok: true });
  });

  it("serializes ready and merge for the same worktree", async () => {
    const filePath = join(dir, "concurrent-lifecycle.univer");
    const key = Buffer.from(filePath).toString("base64url");
    await postJson(`http://127.0.0.1:${server.port}/uf/${key}`, {});
    const collab = server.manager.resolveByKey(key).collab;
    const worktree = collab.createWorktree("agent-a", "concurrent-task");
    const worktreeService = collab.runtime.worktreeService;
    const originalMarkReady = worktreeService.markReady.bind(worktreeService);
    let releaseReady: (() => void) | undefined;
    const readyBarrier = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    let markReadyEntered: (() => void) | undefined;
    const markReadyStarted = new Promise<void>((resolve) => {
      markReadyEntered = resolve;
    });
    vi.spyOn(worktreeService, "markReady").mockImplementation(async (...args) => {
      const result = await originalMarkReady(...args);
      markReadyEntered?.();
      await readyBarrier;
      return result;
    });
    const originalMerge = worktreeService.mergeWorktree.bind(worktreeService);
    let mergeEntered: (() => void) | undefined;
    const mergeStarted = new Promise<void>((resolve) => {
      mergeEntered = resolve;
    });
    vi.spyOn(worktreeService, "mergeWorktree").mockImplementation(async (...args) => {
      mergeEntered?.();
      return originalMerge(...args);
    });

    const readyPromise = collab.ready(worktree.worktreeId);
    await markReadyStarted;
    const mergePromise = collab.merge(worktree.worktreeId);

    try {
      const mergeEnteredBeforeReadyCompleted = await Promise.race([
        mergeStarted.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 50))
      ]);
      expect(mergeEnteredBeforeReadyCompleted).toBe(false);
    } finally {
      releaseReady?.();
      const [readyResult, mergeResult] = await Promise.all([readyPromise, mergePromise]);
      expect(readyResult).toMatchObject({
        status: "ready",
        worktree: { worktreeId: worktree.worktreeId, status: "ready" }
      });
      expect(mergeResult.ok).toBe(true);
    }
  });

  it("rejects descriptor probe for a key outside the allowed root", async () => {
    const key = Buffer.from(join(tmpdir(), "outside.univer")).toString("base64url");
    const response = await fetch(`http://127.0.0.1:${server.port}/uf/${key}`, {
      headers: { accept: GATEWAY_DESCRIPTOR_MEDIA_TYPE }
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 0 } });
  });
});

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}
