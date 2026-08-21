import { describe, expect, it } from "vitest";
import { buildRuntimeConfig } from "../src/runtime-config.js";
import { encodeUniverfile } from "../src/univerfile.js";

const origin = "http://127.0.0.1:8000";
const univerfile = "/Users/me/book.univer";
const enc = encodeUniverfile(univerfile);

describe("buildRuntimeConfig", () => {
  it("builds trunk base URLs under /uf/<enc> (no worktree segment)", () => {
    const c = buildRuntimeConfig({ origin, univerfile });
    expect(c.historyListServerUrl).toBe(`${origin}/uf/${enc}/universer-api/history`);
    expect(c.snapshotServerUrl).toBe(`${origin}/uf/${enc}/universer-api/snapshot`);
    expect(c.collabSubmitChangesetUrl).toBe(`${origin}/uf/${enc}/universer-api/comb`);
    expect(c.wsSessionTicketUrl).toBe(`${origin}/uf/${enc}/universer-api/user/session-ticket`);
    expect(c.authzUrl).toBe(`${origin}/uf/${enc}/universer-api/authz`);
    expect(c.downloadEndpointUrl).toBe(`${origin}/`);
    expect(c.uploadFileServerUrl).toBe(`${origin}/uf/${enc}/universer-api/stream/file/upload`);
    expect(c.signUrlServerUrl).toBe(`${origin}/uf/${enc}/universer-api/file/{fileID}/sign-url`);
    expect(c.getTaskServerUrl).toBe(`${origin}/uf/${enc}/universer-api/exchange/task/{taskID}`);
    expect(c.importServerUrl).toBe(`${origin}/uf/${enc}/universer-api/exchange/{type}/import`);
    expect(c.exportServerUrl).toBe(`${origin}/uf/${enc}/universer-api/exchange/{type}/export`);
  });

  it("inserts /worktrees/<worktreeId> when worktreeId is given", () => {
    const c = buildRuntimeConfig({ origin, univerfile, worktreeId: "fk_123" });
    expect(c.historyListServerUrl).toBe(`${origin}/uf/${enc}/universer-api/history`);
    expect(c.snapshotServerUrl).toBe(`${origin}/uf/${enc}/worktrees/fk_123/universer-api/snapshot`);
    expect(c.uploadFileServerUrl).toBe(
      `${origin}/uf/${enc}/worktrees/fk_123/universer-api/stream/file/upload`,
    );
    expect(c.signUrlServerUrl).toBe(
      `${origin}/uf/${enc}/worktrees/fk_123/universer-api/file/{fileID}/sign-url`,
    );
    expect(c.getTaskServerUrl).toBe(
      `${origin}/uf/${enc}/worktrees/fk_123/universer-api/exchange/task/{taskID}`,
    );
  });

  it("derives ws origin from http origin for the WS url", () => {
    const c = buildRuntimeConfig({ origin, univerfile, worktreeId: "fk_123" });
    expect(c.collabWebSocketUrl).toBe(
      `ws://127.0.0.1:8000/uf/${enc}/worktrees/fk_123/universer-api/comb/connect`,
    );
  });

  it("derives wss from https", () => {
    const c = buildRuntimeConfig({ origin: "https://host", univerfile });
    expect(c.collabWebSocketUrl).toBe(`wss://host/uf/${enc}/universer-api/comb/connect`);
  });

  it("honors an explicit wsOrigin override", () => {
    const c = buildRuntimeConfig({ origin, univerfile, wsOrigin: "ws://other:9000" });
    expect(c.collabWebSocketUrl).toBe(`ws://other:9000/uf/${enc}/universer-api/comb/connect`);
  });

  it("builds same-origin URLs from a gateway file key", () => {
    const gatewayFileKey = "L3RtcC91bml2ZXItZ2F0ZXdheS1zbW9rZS9idWRnZXQudW5pdmVy";
    const c = buildRuntimeConfig({ origin, gatewayFileKey, worktreeId: "wt-1" });

    expect(c.historyListServerUrl).toBe(`${origin}/uf/${gatewayFileKey}/universer-api/history`);

    expect(c.snapshotServerUrl).toBe(
      `${origin}/uf/${gatewayFileKey}/worktrees/wt-1/universer-api/snapshot`,
    );
    expect(c.collabSubmitChangesetUrl).toBe(
      `${origin}/uf/${gatewayFileKey}/worktrees/wt-1/universer-api/comb`,
    );
    expect(c.collabWebSocketUrl).toBe(
      "ws://127.0.0.1:8000/uf/L3RtcC91bml2ZXItZ2F0ZXdheS1zbW9rZS9idWRnZXQudW5pdmVy/worktrees/wt-1/universer-api/comb/connect",
    );
  });
});
