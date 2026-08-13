import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type StartedServer } from "../src/server.js";

describe("Gateway-owned static view", () => {
  let root: string;
  let server: StartedServer | undefined;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "collab-gateway-view-"));
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(
      join(root, "index.html"),
      '<!doctype html><script src="/assets/app.js"></script>'
    );
    writeFileSync(join(root, "assets", "app.js"), "window.__collabView = true;\n");
    server = await startServer({
      port: 0,
      viewAssetsRoot: root
    });
  });

  afterEach(async () => {
    await server?.close();
    rmSync(root, { force: true, recursive: true });
  });

  it("serves view assets from the Gateway listener and preserves /uf routing", async () => {
    const activeServer = requireServer(server);
    const origin = `http://127.0.0.1:${activeServer.port}`;
    const index = await fetch(`${origin}/`);
    const asset = await fetch(`${origin}/assets/app.js`);
    const missingUniverfile = await fetch(
      `${origin}/uf/${Buffer.from(join(root, "missing.univer")).toString("base64url")}/units`
    );

    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toContain("<!doctype html>");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(await asset.text()).toContain("__collabView");
    expect(missingUniverfile.status).toBe(404);
    expect(await missingUniverfile.json()).toMatchObject({ error: { code: 0 } });
  });

  it("listens only on the IPv4 loopback interface", () => {
    const address = requireServer(server).httpServer.address() as AddressInfo;
    expect(address.address).toBe("127.0.0.1");
  });

  it("bounds static serving to the configured view root", async () => {
    const activeServer = requireServer(server);
    const origin = `http://127.0.0.1:${activeServer.port}`;

    const traversal = await fetch(`${origin}/assets/%2e%2e/%2e%2e/package.json`);
    const missing = await fetch(`${origin}/assets/missing.js`);

    expect(traversal.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("marks hashed assets immutable and index.html revalidatable", async () => {
    const activeServer = requireServer(server);
    const origin = `http://127.0.0.1:${activeServer.port}`;

    const asset = await fetch(`${origin}/assets/app.js`);
    const index = await fetch(`${origin}/`);

    expect(asset.headers.get("cache-control")).toBe("public,max-age=31536000,immutable");
    expect(index.headers.get("cache-control")).toBe("no-cache");
    expect(asset.headers.get("etag")).toMatch(/^W\/".+"$/u);
    expect(index.headers.get("etag")).toMatch(/^W\/".+"$/u);
  });

  it("answers 304 to a matching If-None-Match revalidation", async () => {
    const activeServer = requireServer(server);
    const origin = `http://127.0.0.1:${activeServer.port}`;

    const first = await rawGet(`${origin}/`, {});
    const etag = first.headers.etag;
    expect(etag).toBeDefined();

    const revalidated = await rawGet(`${origin}/`, { "if-none-match": etag ?? "" });
    const mismatched = await rawGet(`${origin}/`, { "if-none-match": 'W/"other"' });

    expect(revalidated.statusCode).toBe(304);
    expect(revalidated.body.length).toBe(0);
    expect(mismatched.statusCode).toBe(200);
  });

  it("stops serving view assets when the Gateway closes", async () => {
    const activeServer = requireServer(server);
    const origin = `http://127.0.0.1:${activeServer.port}`;

    await activeServer.close();
    server = undefined;

    await expect(fetch(`${origin}/`)).rejects.toThrow();
  });

  it("rejects invalid view assets roots before listening", async () => {
    const invalidRoot = mkdtempSync(join(tmpdir(), "collab-gateway-view-invalid-"));
    try {
      await expect(startServer({ port: 0, viewAssetsRoot: invalidRoot })).rejects.toThrow(
        /index\.html/u
      );
    } finally {
      rmSync(invalidRoot, { force: true, recursive: true });
    }
  });
});

function requireServer(server: StartedServer | undefined): StartedServer {
  if (server === undefined) {
    throw new Error("Expected started server.");
  }
  return server;
}

interface RawResponse {
  readonly statusCode: number;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: Buffer;
}

/** Plain http GET: unlike fetch, sends no implicit Accept-Encoding and never decodes the body. */
function rawGet(url: string, headers: Record<string, string>): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks)
        })
      );
      response.on("error", reject);
    });
    request.on("error", reject);
  });
}
