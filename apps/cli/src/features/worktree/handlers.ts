import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import type { StartedServer } from "@univer/collab-gateway";
import { requireWorktreeStatus } from "../../daemon/collaboration-access.js";
import {
  parseWorktreeCreateRequest,
  parseWorktreePathRequest,
  parseWorktreeTargetRequest,
  WORKTREE_CREATE_METHOD,
  WORKTREE_DISCARD_METHOD,
  WORKTREE_LIST_METHOD,
  WORKTREE_MERGE_METHOD,
  WORKTREE_READY_METHOD,
  WORKTREE_REOPEN_METHOD,
} from "./protocol.js";

export function registerWorktreeHandlers(input: {
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
}): void {
  input.daemon.handle(WORKTREE_CREATE_METHOD, async (payload) => {
    const request = parseWorktreeCreateRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    const worktree = univerfile.collab.createWorktree("", request.name ?? "");
    return {
      filePath: univerfile.path,
      agentId: worktree.agentId,
      baseline: worktree.baseline,
      createdAt: worktree.createdAt,
      ...(worktree.mergedAt === undefined ? {} : { mergedAt: worktree.mergedAt }),
      name: worktree.name,
      status: worktree.status,
      worktreeId: worktree.worktreeId,
    } as JsonValue;
  });
  input.daemon.handle(WORKTREE_LIST_METHOD, async (payload) => {
    const request = parseWorktreePathRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    return {
      filePath: univerfile.path,
      worktrees: univerfile.collab.listWorktrees().map((worktree) => ({
        agentId: worktree.agentId,
        baseline: worktree.baseline,
        createdAt: worktree.createdAt,
        ...(worktree.mergedAt === undefined ? {} : { mergedAt: worktree.mergedAt }),
        name: worktree.name,
        status: worktree.status,
        worktreeId: worktree.worktreeId,
      })),
    } as JsonValue;
  });
  input.daemon.handle(WORKTREE_READY_METHOD, async (payload) => {
    const request = parseWorktreeTargetRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireWorktreeStatus(univerfile.collab, request.worktreeId, ["draft"], "mark ready");
    const result = await univerfile.collab.ready(request.worktreeId);
    return worktreeState(univerfile.path, request.worktreeId, result.status);
  });
  input.daemon.handle(WORKTREE_REOPEN_METHOD, async (payload) => {
    const request = parseWorktreeTargetRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireWorktreeStatus(univerfile.collab, request.worktreeId, ["ready"], "reopen");
    const result = await univerfile.collab.reopen(request.worktreeId);
    return worktreeState(univerfile.path, request.worktreeId, result.status);
  });
  input.daemon.handle(WORKTREE_DISCARD_METHOD, async (payload) => {
    const request = parseWorktreeTargetRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireWorktreeStatus(univerfile.collab, request.worktreeId, ["draft", "ready"], "discard");
    await univerfile.collab.discard(request.worktreeId);
    return worktreeState(univerfile.path, request.worktreeId, "discarded");
  });
  input.daemon.handle(WORKTREE_MERGE_METHOD, async (payload) => {
    const request = parseWorktreeTargetRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireWorktreeStatus(
      univerfile.collab,
      request.worktreeId,
      ["draft", "ready", "merging"],
      "merge",
    );
    const result = await univerfile.collab.merge(request.worktreeId);
    return (
      result.ok
        ? {
            filePath: univerfile.path,
            merged: true,
            revisions: result.mergedRevs,
            worktreeId: request.worktreeId,
          }
        : {
            failedUnit: result.failedUnit,
            filePath: univerfile.path,
            merged: false,
            worktreeId: request.worktreeId,
          }
    ) as JsonValue;
  });
}

function worktreeState(filePath: string, worktreeId: string, status: string): JsonValue {
  return { filePath, status, worktreeId };
}
