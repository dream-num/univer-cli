import type { JsonValue } from "@univer-cli/daemon";
import type { UniverfileUpgradeResult } from "@univer/univerfile-sqlite";
import {
  codedError,
  optionalString,
  requireRecord,
  requireString,
} from "../../daemon/rpc-values.js";

export const UNIVERFILE_CREATE_METHOD = "univer.univerfile.create";
export const UNIVERFILE_OPEN_METHOD = "univer.univerfile.open";
export const UNIVERFILE_STATUS_METHOD = "univer.univerfile.status";

export interface UniverfileOpenResult {
  readonly filePath: string;
  readonly upgrade: UniverfileUpgradeResult;
}

export interface UniverfileUnitResult {
  readonly headRev: number;
  readonly name: string;
  readonly type: number;
  readonly unitId: string;
}

export interface UniverfileWorktreeResult {
  readonly baseline: Readonly<Record<string, number>>;
  readonly name: string;
  readonly status: string;
  readonly worktreeId: string;
}

export interface UniverfileStatusResult extends UniverfileOpenResult {
  readonly scope: "trunk" | "worktree";
  readonly units: readonly UniverfileUnitResult[];
  readonly worktree?: UniverfileWorktreeResult;
}

export function parsePathRequest(payload: JsonValue): { readonly path: string } {
  const record = requireRecord(payload, "univerfile request");
  const path = record["path"];
  if (typeof path !== "string" || path.length === 0) {
    throw codedError("UNIVERFILE_REQUEST_INVALID", "univerfile request path is required");
  }
  return { path };
}

export function parseStatusRequest(payload: JsonValue): {
  readonly path: string;
  readonly unitId?: string;
  readonly worktreeId?: string;
} {
  const record = requireRecord(payload, "univerfile status request");
  const { path } = parsePathRequest(payload);
  const unitId = optionalString(record["unitId"], "unitId");
  const worktreeId = optionalString(record["worktreeId"], "worktreeId");
  return {
    path,
    ...(unitId === undefined ? {} : { unitId }),
    ...(worktreeId === undefined ? {} : { worktreeId }),
  };
}

export function parseUniverfileOpenResult(value: JsonValue): UniverfileOpenResult {
  const record = requireRecord(value, "univerfile open result");
  return {
    filePath: requireString(record["filePath"], "univerfile open result filePath"),
    upgrade: requireUpgrade(record["upgrade"]),
  };
}

export function parseUniverfileStatusResult(value: JsonValue): UniverfileStatusResult {
  const record = requireRecord(value, "univerfile status result");
  const opened = parseUniverfileOpenResult(value);
  const scope = record["scope"];
  if (scope !== "trunk" && scope !== "worktree") {
    throw codedError("DAEMON_RESULT_INVALID", "univerfile status scope is invalid");
  }
  const rawUnits = record["units"];
  if (!Array.isArray(rawUnits)) {
    throw codedError("DAEMON_RESULT_INVALID", "univerfile status units are invalid");
  }
  const units = rawUnits.map((unit) => parseUnit(unit));
  const worktree = record["worktree"];
  return {
    ...opened,
    scope,
    units,
    ...(worktree === undefined ? {} : { worktree: parseWorktree(worktree) }),
  };
}

function parseUnit(value: JsonValue): UniverfileUnitResult {
  const record = requireRecord(value, "univerfile Unit");
  const type = record["type"];
  const headRev = record["headRev"];
  if (typeof type !== "number" || !Number.isSafeInteger(type)) {
    throw codedError("DAEMON_RESULT_INVALID", "univerfile Unit type is invalid");
  }
  if (typeof headRev !== "number" || !Number.isSafeInteger(headRev) || headRev < 1) {
    throw codedError("DAEMON_RESULT_INVALID", "univerfile Unit headRev is invalid");
  }
  return {
    headRev,
    name: requireString(record["name"], "univerfile Unit name", true),
    type,
    unitId: requireString(record["unitId"], "univerfile Unit unitId"),
  };
}

function parseWorktree(value: JsonValue): UniverfileWorktreeResult {
  const record = requireRecord(value, "univerfile Worktree");
  const baseline = requireRecord(record["baseline"], "univerfile Worktree baseline");
  const revisions: Record<string, number> = {};
  for (const [unitId, revision] of Object.entries(baseline)) {
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
      throw codedError("DAEMON_RESULT_INVALID", "univerfile Worktree baseline is invalid");
    }
    revisions[unitId] = revision;
  }
  return {
    baseline: revisions,
    name: requireString(record["name"], "univerfile Worktree name", true),
    status: requireString(record["status"], "univerfile Worktree status"),
    worktreeId: requireString(record["worktreeId"], "univerfile Worktree id"),
  };
}

function requireUpgrade(value: JsonValue | undefined): UniverfileUpgradeResult {
  const record = requireRecord(value, "univerfile upgrade result");
  if (record["status"] === "unchanged" && record["format"] === "v2") {
    return { status: "unchanged", format: "v2" };
  }
  if (
    record["status"] !== "upgraded" ||
    (record["sourceFormat"] !== "v0" && record["sourceFormat"] !== "v1") ||
    record["targetFormat"] !== "v2"
  ) {
    throw codedError("DAEMON_RESULT_INVALID", "univerfile upgrade result is invalid");
  }
  return value as unknown as UniverfileUpgradeResult;
}
