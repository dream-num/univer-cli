import type { DaemonClient } from "@univer-cli/daemon";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";
import {
  parseWorktreeCreateResult,
  parseWorktreeListResult,
  parseWorktreeMergeResult,
  parseWorktreeStateResult,
  WORKTREE_CREATE_METHOD,
  WORKTREE_DISCARD_METHOD,
  WORKTREE_LIST_METHOD,
  WORKTREE_MERGE_METHOD,
  WORKTREE_READY_METHOD,
  WORKTREE_REOPEN_METHOD,
  type WorktreeCreateResult,
  type WorktreeListResult,
  type WorktreeStateResult,
} from "./protocol.js";

export interface WorktreeTargetInput {
  readonly cwd?: string;
  readonly path: string;
  readonly worktreeId: string;
}

export interface LocalWorktreeApplication {
  createWorktree(input: {
    readonly cwd?: string;
    readonly name?: string;
    readonly path: string;
  }): Promise<WorktreeCreateResult>;
  listWorktrees(input: {
    readonly cwd?: string;
    readonly path: string;
  }): Promise<WorktreeListResult>;
  readyWorktree(input: WorktreeTargetInput): Promise<WorktreeStateResult>;
  reopenWorktree(input: WorktreeTargetInput): Promise<WorktreeStateResult>;
  mergeWorktree(
    input: WorktreeTargetInput,
  ): Promise<WorktreeStateResult & { readonly revisions: Readonly<Record<string, number>> }>;
  discardWorktree(input: WorktreeTargetInput): Promise<WorktreeStateResult>;
}

export function createLocalWorktreeApplication(daemon: DaemonClient): LocalWorktreeApplication {
  return {
    async createWorktree(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseWorktreeCreateResult(
        await daemon.request(WORKTREE_CREATE_METHOD, {
          path,
          ...(input.name === undefined ? {} : { name: input.name }),
        }),
      );
    },
    async listWorktrees(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseWorktreeListResult(await daemon.request(WORKTREE_LIST_METHOD, { path }));
    },
    async readyWorktree(input) {
      return await transition(daemon, WORKTREE_READY_METHOD, input);
    },
    async reopenWorktree(input) {
      return await transition(daemon, WORKTREE_REOPEN_METHOD, input);
    },
    async mergeWorktree(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      const result = parseWorktreeMergeResult(
        await daemon.request(WORKTREE_MERGE_METHOD, { path, worktreeId: input.worktreeId }),
      );
      if (!result.merged) {
        throw Object.assign(
          new Error(
            result.failedUnit === ""
              ? `Worktree ${result.worktreeId} has a merge conflict`
              : `Worktree ${result.worktreeId} has a merge conflict on Unit ${result.failedUnit}`,
          ),
          {
            code: "WORKTREE_MERGE_CONFLICT",
            details: { failedUnit: result.failedUnit, worktreeId: result.worktreeId },
          },
        );
      }
      return {
        filePath: result.filePath,
        revisions: result.revisions,
        status: "merged",
        worktreeId: result.worktreeId,
      };
    },
    async discardWorktree(input) {
      return await transition(daemon, WORKTREE_DISCARD_METHOD, input);
    },
  };
}

async function transition(
  daemon: DaemonClient,
  method: string,
  input: WorktreeTargetInput,
): Promise<WorktreeStateResult> {
  const path = resolveLocalUniverfile(input.path, input.cwd);
  return parseWorktreeStateResult(
    await daemon.request(method, { path, worktreeId: input.worktreeId }),
  );
}
