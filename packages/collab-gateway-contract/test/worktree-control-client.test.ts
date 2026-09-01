import { describe, expect, it } from "vitest";
import { encodeUniverfile } from "../src/univerfile.js";
import { WorktreeControlClient } from "../src/worktree-control-client.js";

const ORIGIN = "http://127.0.0.1:8000";
const UNIVERFILE = "/tmp/book.univer";
const ENC = encodeUniverfile(UNIVERFILE);

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function clientWith(handler: (request: CapturedRequest) => Response): {
  client: WorktreeControlClient;
  calls: CapturedRequest[];
} {
  const calls: CapturedRequest[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: CapturedRequest = { url: String(input), init };
    calls.push(request);
    return handler(request);
  }) as typeof fetch;
  return {
    client: new WorktreeControlClient({ origin: ORIGIN, univerfile: UNIVERFILE, fetch: fetchFn }),
    calls,
  };
}

describe("WorktreeControlClient lifecycle", () => {
  it("POSTs the explicit ready-to-draft transition", async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({ error: { code: 1, message: "" }, ok: true, status: "draft" }),
    );

    const result = await client.reopen("wt-1");

    expect(result.status).toBe("draft");
    expect(calls[0]!.url).toBe(`${ORIGIN}/uf/${ENC}/worktrees/wt-1/reopen`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({});
  });

  it("POSTs SDK-standard ready without a logical commit token", async () => {
    const worktree = {
      worktreeId: "wt-1",
      status: "ready",
      agentId: "agent-1",
      name: "Changes",
      baseline: {},
      createdAt: "2026-08-09T00:00:00.000Z",
    } as const;
    const { client, calls } = clientWith(() =>
      jsonResponse({ error: { code: 1, message: "" }, ok: true, status: "ready", worktree }),
    );

    const result = await client.ready("wt-1");

    expect(result.ok).toBe(true);
    expect(calls[0]!.url).toBe(`${ORIGIN}/uf/${ENC}/worktrees/wt-1/ready`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({});
  });
});

describe("WorktreeControlClient same-origin file key", () => {
  it("uses the key as the local route base", async () => {
    const calls: CapturedRequest[] = [];
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ error: { code: 1, message: "" }, units: [] });
    }) as typeof fetch;
    const gatewayFileKey = "L3RtcC91bml2ZXItZ2F0ZXdheS1zbW9rZS9idWRnZXQudW5pdmVy";
    const client = new WorktreeControlClient({ origin: ORIGIN, gatewayFileKey, fetch: fetchFn });

    await client.listUnits();

    expect(calls[0]!.url).toBe(`${ORIGIN}/uf/${gatewayFileKey}/units`);
  });
});

describe("WorktreeControlClient pinned comparisons", () => {
  it("creates a Trunk-to-Worktree comparison by default", async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse({
        error: { code: 1, message: "" },
        comparisonId: "cmp-1",
        createdAt: "2026-08-29T00:00:00.000Z",
        left: { kind: "trunk", label: "Trunk", heads: {} },
        right: { kind: "worktree", worktreeId: "wt-right", label: "Right", heads: {} },
        units: [],
      }),
    );

    await client.createUnitComparison("wt-right");

    expect(calls[0]!.url).toBe(`${ORIGIN}/uf/${ENC}/worktrees/wt-right/comparisons`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({});
  });

  it("addresses one pinned Unit comparison", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ error: { code: 1, message: "" } }));

    await client.getUnitComparison("wt-right", "cmp-1", "unit/1");

    expect(calls[0]!.url).toBe(
      `${ORIGIN}/uf/${ENC}/worktrees/wt-right/comparisons/cmp-1/units/unit%2F1`,
    );
    expect(calls[0]!.init?.method).toBeUndefined();
  });

  it("requests a filtered and paged agent diff context", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ error: { code: 1, message: "" } }));

    await client.getUnitComparisonContext("wt-right", "cmp-1", "unit/1", {
      offset: 20,
      limit: 10,
      kinds: ["update"],
      entityTypes: ["cell", "formula"],
      parentStableId: "sheet-1",
      search: "revenue",
      detail: "changes",
    });

    expect(calls[0]!.url).toBe(
      `${ORIGIN}/uf/${ENC}/worktrees/wt-right/comparisons/cmp-1/units/unit%2F1/diff?offset=20&limit=10&kind=update&entityType=cell%2Cformula&parentStableId=sheet-1&search=revenue&detail=changes`,
    );
    expect(calls[0]!.init?.method).toBeUndefined();
  });

  it("keeps includeValues as a backward-compatible query alias", async () => {
    const { client, calls } = clientWith(() => jsonResponse({ error: { code: 1, message: "" } }));

    await client.getUnitComparisonContext("wt-right", "cmp-1", "unit/1", {
      includeValues: false,
    });

    expect(calls[0]!.url).toBe(
      `${ORIGIN}/uf/${ENC}/worktrees/wt-right/comparisons/cmp-1/units/unit%2F1/diff?includeValues=false`,
    );
  });
});
