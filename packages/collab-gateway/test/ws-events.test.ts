import type { WorktreeLifecycleEvent } from "@univer/collab-gateway-contract";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startServer, type StartedServer } from "../src/server.js";
import { attachGatewayWebSockets } from "../src/transport/ws.js";
import { UniverfileManager } from "../src/univerfile-manager.js";

function onceOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function nextMessage(ws: WebSocket, timeoutMs = 2_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function onceClosed(ws: WebSocket, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for close")), timeoutMs);
    const done = (): void => {
      clearTimeout(timer);
      resolve();
    };
    ws.once("close", done);
    ws.once("error", done);
  });
}

describe("lifecycle events over WebSocket", () => {
  let server: StartedServer;
  let dir: string;
  const sockets: WebSocket[] = [];

  function connect(path: string): WebSocket {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}${path}`);
    sockets.push(ws);
    return ws;
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gw-ws-events-"));
    server = await startServer({ port: 0 });
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) {
      ws.removeAllListeners("error");
      ws.on("error", () => undefined);
      ws.terminate();
    }
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("pushes univerfile-channel events as JSON messages", async () => {
    const key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    const uf = server.manager.createByKey(key);

    const ws = connect(`/uf/${key}/events`);
    await onceOpen(ws);

    const received = nextMessage(ws);
    uf.events.emit("", { type: "unit_added", unitId: "u1", unitType: 2, name: "S" });
    expect(await received).toEqual({ type: "unit_added", unitId: "u1", unitType: 2, name: "S" });
  });

  it("scopes the worktree channel to that worktree and isolates it from the univerfile channel", async () => {
    const key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    const uf = server.manager.createByKey(key);
    const w = uf.collab.createWorktree("agent");

    const trunkWs = connect(`/uf/${key}/events`);
    const worktreeWs = connect(`/uf/${key}/worktrees/${w.worktreeId}/events`);
    await Promise.all([onceOpen(trunkWs), onceOpen(worktreeWs)]);

    const trunkGot: unknown[] = [];
    trunkWs.on("message", (data) => trunkGot.push(JSON.parse(data.toString())));

    const received = nextMessage(worktreeWs);
    uf.events.emit(w.worktreeId, {
      type: "reset",
      worktreeId: w.worktreeId
    });
    const event = (await received) as WorktreeLifecycleEvent;
    expect(event.type).toBe("reset");
    expect(trunkGot).toHaveLength(0);
  });

  it("rejects upgrades for a missing univerfile or unknown worktree without creating anything", async () => {
    const missingKey = Buffer.from(join(dir, "missing.univer")).toString("base64url");
    const rejected = connect(`/uf/${missingKey}/events`);
    await onceClosed(rejected);
    expect(server.manager.size()).toBe(0);

    const key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    server.manager.createByKey(key);
    const unknownWorktree = connect(`/uf/${key}/worktrees/nope/events`);
    await onceClosed(unknownWorktree);
  });

  it("keeps routing comb upgrades", async () => {
    const key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    server.manager.createByKey(key);

    const ticketResponse = await fetch(
      `http://127.0.0.1:${server.port}/uf/${key}/universer-api/user/session-ticket`,
      { headers: { "x-user-id": "comb-test" } }
    );
    const ticketBody = (await ticketResponse.json()) as {
      error: { code: number };
      ticket: string;
    };
    expect(ticketBody.error.code).toBe(1);

    const ws = connect(
      `/uf/${key}/universer-api/comb/connect?sessionTicket=${encodeURIComponent(ticketBody.ticket)}`
    );
    await onceOpen(ws);
    const received = nextMessage(ws);
    ws.send(JSON.stringify({ cmd: 1 }));
    const hello = (await received) as { cmd: number };
    expect(hello.cmd).toBeGreaterThan(0);
  });

  it("suppresses idle eviction while an events connection is live", async () => {
    const key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    server.manager.createByKey(key);

    const ws = connect(`/uf/${key}/events`);
    await onceOpen(ws);
    server.manager.evictIdle(0);
    expect(server.manager.size()).toBe(1);

    ws.terminate();
    await onceClosed(ws);
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.manager.evictIdle(0);
    expect(server.manager.size()).toBe(0);
  });

  it("close() force-disconnects live events and comb connections without waiting for clients", async () => {
    const key = Buffer.from(join(dir, "book.univer")).toString("base64url");
    server.manager.createByKey(key);

    const ticketResponse = await fetch(
      `http://127.0.0.1:${server.port}/uf/${key}/universer-api/user/session-ticket`,
      { headers: { "x-user-id": "close-test" } },
    );
    const ticketBody = (await ticketResponse.json()) as { ticket: string };
    const eventsWs = connect(`/uf/${key}/events`);
    const combWs = connect(
      `/uf/${key}/universer-api/comb/connect?sessionTicket=${encodeURIComponent(ticketBody.ticket)}`,
    );
    await Promise.all([onceOpen(eventsWs), onceOpen(combWs)]);

    const closedBoth = Promise.all([onceClosed(eventsWs), onceClosed(combWs)]);
    const started = Date.now();
    await server.close();
    expect(Date.now() - started).toBeLessThan(2_000);
    await closedBoth;
  });
});

describe("events heartbeat", () => {
  it("terminates a connection that stops answering pings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gw-ws-heartbeat-"));
    const manager = new UniverfileManager({});
    const httpServer = http.createServer((_req, res) => {
      res.writeHead(404).end();
    });
    attachGatewayWebSockets(httpServer, manager, { eventsHeartbeatMs: 40 });
    const port = await new Promise<number>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        resolve((httpServer.address() as { port: number }).port);
      });
    });

    try {
      const key = Buffer.from(join(dir, "book.univer")).toString("base64url");
      const uf = manager.createByKey(key);

      // autoPong: false simulates a dead peer that never answers protocol pings.
      const ws = new WebSocket(`ws://127.0.0.1:${port}/uf/${key}/events`, { autoPong: false });
      await onceOpen(ws);
      await onceClosed(ws, 2_000);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(uf.events.hasConnections()).toBe(false);
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      manager.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
