import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type StartedServer } from "../src/server.js";

describe("authz HTTP stub", () => {
  let server: StartedServer;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gw-authz-"));
    server = await startServer({ port: 0 });
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the collaboration-client batch_allowed response shape", async () => {
    const ufPath = join(dir, "book.univer");
    const key = Buffer.from(ufPath).toString("base64url");
    server.manager.createByKey(key);

    const response = await fetch(
      `http://127.0.0.1:${server.port}/uf/${key}/universer-api/authz/-/object/-/batch_allowed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requests: [] })
      }
    );
    const body = (await response.json()) as {
      error: { code: number; message: string };
      actions?: unknown[];
      objectActions?: unknown[];
    };

    expect(body.error.code).toBe(1);
    expect(body.actions).toEqual([]);
    expect(body.objectActions).toEqual([]);
  });
});
