import type { JsonValue } from "@univer-cli/daemon";
import {
  codedError,
  invalidResult,
  optionalString,
  requireRecord,
  requireString,
} from "../../daemon/rpc-values.js";

export const WORKTREE_CREATE_METHOD = "univer.worktree.create";
export const WORKTREE_LIST_METHOD = "univer.worktree.list";
export const WORKTREE_READY_METHOD = "univer.worktree.ready";
export const WORKTREE_REOPEN_METHOD = "univer.worktree.reopen";
export const WORKTREE_MERGE_METHOD = "univer.worktree.merge";
export const WORKTREE_DISCARD_METHOD = "univer.worktree.discard";

export interface WorktreeResult {
  readonly agentId: string;
  readonly baseline: Readonly<Record<string, number>>;
  readonly createdAt: string;
  readonly mergedAt?: string;
  readonly name: string;
  readonly status: string;
  readonly worktreeId: string;
}

export interface WorktreeCreateResult extends WorktreeResult {
  readonly filePath: string;
}

export interface WorktreeListResult {
  readonly filePath: string;
  readonly worktrees: readonly WorktreeResult[];
}

export interface WorktreeStateResult {
  readonly filePath: string;
  readonly status: string;
  readonly worktreeId: string;
}

export type WorktreeMergeResult =
  | {
      readonly filePath: string;
      readonly merged: true;
      readonly revisions: Readonly<Record<string, number>>;
      readonly worktreeId: string;
    }
  | {
      readonly failedUnit: string;
      readonly filePath: string;
      readonly merged: false;
      readonly worktreeId: string;
    };

export function parseWorktreePathRequest(payload: JsonValue): {
  readonly path: string;
  readonly worktreeId?: string;
} {
  const record = requireRecord(payload, "Worktree request");
  const path = requireString(record["path"], "Worktree request path");
  const worktreeId = optionalString(record["worktreeId"], "Worktree request worktreeId");
  return { path, ...(worktreeId === undefined ? {} : { worktreeId }) };
}

export function parseWorktreeCreateRequest(payload: JsonValue): {
  readonly name?: string;
  readonly path: string;
} {
  const record = requireRecord(payload, "Worktree create request");
  const { path } = parseWorktreePathRequest(payload);
  const name = optionalString(record["name"], "Worktree name", true);
  return { path, ...(name === undefined ? {} : { name }) };
}

export function parseWorktreeTargetRequest(payload: JsonValue): {
  readonly path: string;
  readonly worktreeId: string;
} {
  const parsed = parseWorktreePathRequest(payload);
  if (parsed.worktreeId === undefined) {
    throw codedError("WORKTREE_REQUEST_INVALID", "Worktree ID is required");
  }
  return { path: parsed.path, worktreeId: parsed.worktreeId };
}

export function parseWorktreeCreateResult(value: JsonValue): WorktreeCreateResult {
  const record = requireRecord(value, "Worktree create result");
  return {
    filePath: requireString(record["filePath"], "Worktree result filePath"),
    ...parseWorktree(record),
  };
}

export function parseWorktreeListResult(value: JsonValue): WorktreeListResult {
  const record = requireRecord(value, "Worktree list result");
  const worktrees = record["worktrees"];
  if (!Array.isArray(worktrees)) throw invalidResult("Worktree list is invalid");
  return {
    filePath: requireString(record["filePath"], "Worktree result filePath"),
    worktrees: worktrees.map((item) => parseWorktree(requireRecord(item, "Worktree"))),
  };
}

export function parseWorktreeStateResult(value: JsonValue): WorktreeStateResult {
  const record = requireRecord(value, "Worktree state result");
  return {
    filePath: requireString(record["filePath"], "Worktree result filePath"),
    status: requireString(record["status"], "Worktree status"),
    worktreeId: requireString(record["worktreeId"], "Worktree ID"),
  };
}

export function parseWorktreeMergeResult(value: JsonValue): WorktreeMergeResult {
  const record = requireRecord(value, "Worktree merge result");
  const common = {
    filePath: requireString(record["filePath"], "Worktree result filePath"),
    worktreeId: requireString(record["worktreeId"], "Worktree ID"),
  };
  if (record["merged"] === false) {
    return {
      ...common,
      failedUnit: requireString(record["failedUnit"], "failed Unit ID", true),
      merged: false,
    };
  }
  if (record["merged"] !== true) throw invalidResult("Worktree merge status is invalid");
  return { ...common, merged: true, revisions: parseRevisions(record["revisions"]) };
}

function parseWorktree(record: Readonly<Record<string, JsonValue>>): WorktreeResult {
  return {
    agentId: requireString(record["agentId"], "Worktree agentId", true),
    baseline: parseRevisions(record["baseline"]),
    createdAt: requireString(record["createdAt"], "Worktree createdAt"),
    ...(record["mergedAt"] === undefined
      ? {}
      : { mergedAt: requireString(record["mergedAt"], "Worktree mergedAt") }),
    name: requireString(record["name"], "Worktree name", true),
    status: requireString(record["status"], "Worktree status"),
    worktreeId: requireString(record["worktreeId"], "Worktree ID"),
  };
}

function parseRevisions(value: JsonValue | undefined): Readonly<Record<string, number>> {
  const record = requireRecord(value, "revision map");
  const result: Record<string, number> = {};
  for (const [unitId, revision] of Object.entries(record)) {
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
      throw invalidResult("revision map is invalid");
    }
    result[unitId] = revision;
  }
  return result;
}
