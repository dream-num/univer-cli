import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@univer-cli/daemon";
import { registerUnitContentHandlers } from "../src/features/unit-content/handlers.js";
import {
  CONTENT_EXECUTE_METHOD,
  CONTENT_READ_METHOD,
  CONTENT_READ_ASSET_METHOD,
} from "../src/features/unit-content/protocol.js";

function fixture(headRevision = 7, runtimeRevision = headRevision, status = "draft") {
  const handlers = new Map<string, (value: JsonValue) => Promise<JsonValue>>();
  const lease = {
    pull: vi.fn(async () => ({ status: "up-to-date", state: { baseRevision: runtimeRevision } })),
    getState: vi.fn(async () => ({ baseRevision: runtimeRevision })),
    execute: vi.fn(async () => ({
      mutations: [{ id: "doc.mutation", data: "{}" }],
      value: { sourceMap: [{ id: "summary" }] },
      state: { baseRevision: runtimeRevision, pendingMutationCount: 1 },
    })),
    commit: vi.fn(async () => ({ status: "confirmed", state: { baseRevision: 8 } })),
    invalidate: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
  };
  const openAsset = vi.fn(() => ({
    record: { unitId: "doc", mediaType: "image/png" },
    bytes: Buffer.from("image bytes"),
  }));
  registerUnitContentHandlers({
    daemon: {
      handle: (method: string, handler: (value: JsonValue) => Promise<JsonValue>) =>
        handlers.set(method, handler),
    } as never,
    gateway: {
      manager: {
        openByPath: () => ({
          path: "/tmp/report.univer",
          collab: {
            openAsset,
            listWorktrees: () => [{ worktreeId: "draft", status }],
            worktreeUnits: () => [
              { unitId: "doc", name: "Report", type: 2, headRev: headRevision },
            ],
          },
        }),
      },
    } as never,
    runtimes: { acquire: async () => lease } as never,
  });
  const execute = (): Promise<JsonValue> =>
    handlers.get(CONTENT_EXECUTE_METHOD)!({
      path: "/tmp/report.univer",
      worktreeId: "draft",
      unitId: "doc",
      code: "return {ok:true};",
    });
  const read = (): Promise<JsonValue> =>
    handlers.get(CONTENT_READ_METHOD)!({
      path: "/tmp/report.univer",
      worktreeId: "draft",
      unitId: "doc",
      code: "return {ok:true};",
    });
  const readAsset = (): Promise<JsonValue> =>
    handlers.get(CONTENT_READ_ASSET_METHOD)!({
      path: "/tmp/report.univer",
      worktreeId: "draft",
      unitId: "doc",
      reference: "asset-1",
    });
  return { execute, lease, read, readAsset, openAsset };
}

describe("content execution lifecycle", () => {
  it("reads a ready worktree with its actual runtime revision without committing", async () => {
    const { read, lease } = fixture(8, 7, "ready");
    lease.execute.mockResolvedValueOnce({
      value: { sourceMap: [{ id: "summary" }] },
      state: { baseRevision: 7, pendingMutationCount: 0 },
    } as never);
    await expect(read()).resolves.toMatchObject({
      revision: 7,
      value: { sourceMap: [{ id: "summary" }] },
    });
    expect(lease.execute).toHaveBeenCalledWith(expect.objectContaining({ mode: "read" }));
    expect(lease.commit).not.toHaveBeenCalled();
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it("reads an image only from the selected file, worktree and unit", async () => {
    const { readAsset, openAsset, lease } = fixture(8, 7, "ready");
    await expect(readAsset()).resolves.toEqual({
      data: Buffer.from("image bytes").toString("base64"),
      mimeType: "image/png",
    });
    expect(openAsset).toHaveBeenCalledWith("asset-1", "draft");
    expect(lease.execute).not.toHaveBeenCalled();
    openAsset.mockReturnValueOnce({
      record: { unitId: "other", mediaType: "image/png" },
      bytes: Buffer.from("other"),
    });
    await expect(readAsset()).rejects.toMatchObject({ code: "CONTENT_ASSET_NOT_FOUND" });
  });

  it("does not persist or reuse a runtime that mutates during a read", async () => {
    const { read, lease } = fixture();
    await expect(read()).rejects.toMatchObject({ code: "CONTENT_READ_MUTATION" });
    expect(lease.commit).not.toHaveBeenCalled();
    expect(lease.invalidate).toHaveBeenCalledOnce();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("commits a native update and returns confirmed identities and revision", async () => {
    const { execute, lease } = fixture();
    await expect(execute()).resolves.toMatchObject({
      committed: true,
      revision: 8,
      value: { sourceMap: [{ id: "summary" }] },
    });
    expect(lease.commit).toHaveBeenCalledWith();
    expect(lease.release).toHaveBeenCalledOnce();
    expect(lease.invalidate).not.toHaveBeenCalled();
  });

  it.each(["retry", "unknown"])(
    "retries ordinary commits with %s acknowledgement",
    async (status) => {
      const { execute, lease } = fixture();
      lease.commit.mockResolvedValueOnce({ status, state: { baseRevision: 7 } } as never);
      await expect(execute()).resolves.toMatchObject({ committed: true, revision: 8 });
      expect(lease.execute).toHaveBeenCalledOnce();
      expect(lease.commit).toHaveBeenCalledTimes(2);
      expect(lease.release).toHaveBeenCalledOnce();
      expect(lease.invalidate).not.toHaveBeenCalled();
    },
  );

  it("pulls current changes before retrying an ordinary commit", async () => {
    const { execute, lease } = fixture();
    lease.commit.mockResolvedValueOnce({
      status: "pull-required",
      state: { baseRevision: 7 },
    } as never);
    await expect(execute()).resolves.toMatchObject({ committed: true, revision: 8 });
    expect(lease.pull).toHaveBeenCalledTimes(2);
    expect(lease.commit).toHaveBeenCalledTimes(2);
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it("invalidates a candidate after ordinary commit retries are exhausted", async () => {
    const { execute, lease } = fixture();
    lease.commit.mockResolvedValue({ status: "unknown", state: { baseRevision: 7 } } as never);
    await expect(execute()).rejects.toMatchObject({ code: "CONTENT_COMMIT_RETRY_EXHAUSTED" });
    expect(lease.commit).toHaveBeenCalledTimes(3);
    expect(lease.invalidate).toHaveBeenCalledOnce();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("invalidates a candidate when committing fails", async () => {
    const { execute, lease } = fixture();
    lease.commit.mockRejectedValueOnce(new Error("Commit failed"));
    await expect(execute()).rejects.toThrow("Commit failed");
    expect(lease.invalidate).toHaveBeenCalledOnce();
    expect(lease.release).not.toHaveBeenCalled();
  });

  it("invalidates a candidate that fails during native editing", async () => {
    const { execute, lease } = fixture();
    lease.execute.mockRejectedValueOnce(new Error("Native edit failed"));
    await expect(execute()).rejects.toThrow("Native edit failed");
    expect(lease.commit).not.toHaveBeenCalled();
    expect(lease.invalidate).toHaveBeenCalledOnce();
  });
});
