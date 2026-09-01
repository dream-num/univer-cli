import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("executable agent diff example", () => {
  it("drains Doc alignment after the last item page", async () => {
    const offsets: string[] = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url!, "http://localhost");
      response.setHeader("content-type", "application/json");
      if (request.method === "POST") {
        response.end(JSON.stringify({ error: { code: 1 }, comparisonId: "pinned" }));
        return;
      }
      const offset = Number(url.searchParams.get("contextOffset"));
      offsets.push(url.searchParams.get("contextOffset")!);
      const remaining = offset === 0 ? 1000 : 3;
      response.end(
        JSON.stringify({
          error: { code: 1 },
          context: {
            comparisonId: "pinned",
            items: [],
            page: { offset: 0, matched: 0, limit: 100, hasMore: false },
            productContext: {
              kind: "doc",
              paragraphAlignment: {
                total: 1003,
                rows: Array.from({ length: remaining }, (_, index) => ({
                  stableId: `p${offset + index}`,
                })),
                page: { offset, limit: 1000, matched: 1003, hasMore: offset === 0 },
              },
            },
          },
        }),
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("Missing server address");
      const child = spawn(process.execPath, [
        fileURLToPath(new URL("../examples/agent-diff-context.mjs", import.meta.url)),
        "--file",
        "/test/fixture.univer",
        "--right-worktree",
        "right",
        "--unit",
        "doc",
        "--origin",
        `http://127.0.0.1:${address.port}`,
      ]);
      let output = "";
      let error = "";
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        error += String(chunk);
      });
      const [code] = await once(child, "close");
      expect(code, error).toBe(0);
      const context = JSON.parse(output);
      expect(offsets).toEqual(["0", "1000"]);
      expect(context.productContext.paragraphAlignment.rows).toHaveLength(1003);
      expect(context.productContext.paragraphAlignment.page).toMatchObject({
        offset: 0,
        matched: 1003,
        hasMore: false,
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
