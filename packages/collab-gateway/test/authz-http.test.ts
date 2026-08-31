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

  it("allows every action requested through collaboration-client batch_allowed", async () => {
    const ufPath = join(dir, "book.univer");
    const key = Buffer.from(ufPath).toString("base64url");
    server.manager.createByKey(key);

    const response = await fetch(
      `http://127.0.0.1:${server.port}/uf/${key}/universer-api/authz/-/object/-/batch_allowed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              unitID: "doc-1",
              objectID: "doc-1",
              objectType: 4,
              actions: [44, 43]
            },
            {
              unitID: "board-1",
              objectID: "board-1",
              objectType: 7,
              actions: [44]
            }
          ]
        })
      }
    );
    const body = (await response.json()) as {
      error: { code: number; message: string };
      actions?: unknown[];
      objectActions?: Array<{
        unitID: string;
        objectID: string;
        actions: Array<{ action: number; allowed: boolean }>;
      }>;
    };

    expect(body.error.code).toBe(1);
    expect(body.objectActions).toEqual([
      {
        unitID: "doc-1",
        objectID: "doc-1",
        actions: [
          { action: 44, allowed: true },
          { action: 43, allowed: true }
        ]
      },
      {
        unitID: "board-1",
        objectID: "board-1",
        actions: [{ action: 44, allowed: true }]
      }
    ]);
  });

  it("allows every action requested through a direct allowed call", async () => {
    const ufPath = join(dir, "book.univer");
    const key = Buffer.from(ufPath).toString("base64url");
    server.manager.createByKey(key);

    const response = await fetch(
      `http://127.0.0.1:${server.port}/uf/${key}/universer-api/authz/4/object/doc-1/allowed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitID: "doc-1",
          objectID: "doc-1",
          objectType: 4,
          actions: [44, 43]
        })
      }
    );

    expect(await response.json()).toEqual({
      error: { code: 1, message: "" },
      actions: [
        { action: 44, allowed: true },
        { action: 43, allowed: true }
      ]
    });
  });
});
