import type { UniverCollaborationRuntimeLease } from "@univer-cli/univer-collaboration-runtime-pool";
import type { CollabService } from "@univer/collab-gateway";
import { codedError } from "./rpc-values.js";

export { codedError } from "./rpc-values.js";

export type LocalCollaboration = CollabService;

export interface UnitSummary {
  readonly headRev: number;
  readonly name: string;
  readonly type: number;
  readonly unitId: string;
}

export function requireWorktree(collab: LocalCollaboration, worktreeId: string) {
  const worktree = collab.listWorktrees().find((candidate) => candidate.worktreeId === worktreeId);
  if (worktree === undefined) {
    throw codedError("WORKTREE_NOT_FOUND", `Worktree ${worktreeId} not found`);
  }
  return worktree;
}

export function requireDraftWorktree(collab: LocalCollaboration, worktreeId: string) {
  return requireWorktreeStatus(collab, worktreeId, ["draft"], "write");
}

export function requireWorktreeStatus(
  collab: LocalCollaboration,
  worktreeId: string,
  allowed: readonly string[],
  operation: string,
) {
  const worktree = requireWorktree(collab, worktreeId);
  if (!allowed.includes(worktree.status)) {
    throw codedError(
      operation === "write" ? "WORKTREE_NOT_WRITABLE" : "WORKTREE_TRANSITION_INVALID",
      `Worktree ${worktreeId} is ${worktree.status}; cannot ${operation}`,
    );
  }
  return worktree;
}

export function requireUnit(collab: LocalCollaboration, worktreeId: string, unitId: string) {
  const unit = collab.worktreeUnits(worktreeId).find((candidate) => candidate.unitId === unitId);
  if (unit === undefined) {
    throw codedError("UNIT_NOT_FOUND", `Unit ${unitId} not found in Worktree ${worktreeId}`);
  }
  return unit;
}

export async function pullCurrent(lease: UniverCollaborationRuntimeLease): Promise<void> {
  const pulled = await lease.pull();
  if (pulled.status === "conflict") {
    throw codedError("CONTENT_RUNTIME_CONFLICT", pulled.conflict.message);
  }
}
