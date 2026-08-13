import type { JsonValue } from "@univer-cli/daemon";
import {
  codedError,
  invalidResult,
  optionalString,
  requireRecord,
  requireString,
} from "../../daemon/rpc-values.js";
import { parseWorktreePathRequest, parseWorktreeTargetRequest } from "../worktree/protocol.js";

export const UNIT_CREATE_METHOD = "univer.unit.create";
export const UNIT_REMOVE_METHOD = "univer.unit.remove";
export const UNIT_LIST_METHOD = "univer.unit.list";

export type UnitKind = "sheet" | "doc" | "slide" | "base" | "board";

export interface UnitResult {
  readonly headRev: number;
  readonly kind: UnitKind;
  readonly name: string;
  readonly type: number;
  readonly unitId: string;
}

export interface UnitCreateResult extends UnitResult {
  readonly filePath: string;
  readonly worktreeId: string;
}

export interface UnitRemoveResult {
  readonly filePath: string;
  readonly removed: true;
  readonly unitId: string;
  readonly worktreeId: string;
}

export interface UnitListResult {
  readonly filePath: string;
  readonly scope: "trunk" | "worktree";
  readonly units: readonly UnitResult[];
  readonly worktreeId?: string;
}

export function parseUnitCreateRequest(payload: JsonValue): {
  readonly kind: UnitKind;
  readonly name: string;
  readonly path: string;
  readonly worktreeId: string;
} {
  const record = requireRecord(payload, "Unit create request");
  return {
    ...parseWorktreeTargetRequest(payload),
    kind: requireUnitKind(record["kind"]),
    name: requireString(record["name"], "Unit name", true),
  };
}

export function parseUnitTargetRequest(payload: JsonValue): {
  readonly path: string;
  readonly unitId: string;
  readonly worktreeId: string;
} {
  const record = requireRecord(payload, "Unit request");
  return {
    ...parseWorktreeTargetRequest(payload),
    unitId: requireString(record["unitId"], "Unit ID"),
  };
}

export function parseUnitCreateResult(value: JsonValue): UnitCreateResult {
  const record = requireRecord(value, "Unit create result");
  return {
    filePath: requireString(record["filePath"], "Unit result filePath"),
    worktreeId: requireString(record["worktreeId"], "Worktree ID"),
    ...parseUnit(record),
  };
}

export function parseUnitRemoveResult(value: JsonValue): UnitRemoveResult {
  const record = requireRecord(value, "Unit remove result");
  if (record["removed"] !== true) throw invalidResult("Unit remove result is invalid");
  return {
    filePath: requireString(record["filePath"], "Unit result filePath"),
    removed: true,
    unitId: requireString(record["unitId"], "Unit ID"),
    worktreeId: requireString(record["worktreeId"], "Worktree ID"),
  };
}

export function parseUnitListResult(value: JsonValue): UnitListResult {
  const record = requireRecord(value, "Unit list result");
  const scope = record["scope"];
  const units = record["units"];
  if (scope !== "trunk" && scope !== "worktree") throw invalidResult("Unit scope is invalid");
  if (!Array.isArray(units)) throw invalidResult("Unit list is invalid");
  const worktreeId = optionalString(record["worktreeId"], "Worktree ID");
  return {
    filePath: requireString(record["filePath"], "Unit result filePath"),
    scope,
    units: units.map((item) => parseUnit(requireRecord(item, "Unit"))),
    ...(worktreeId === undefined ? {} : { worktreeId }),
  };
}

export function parseUnitPathRequest(payload: JsonValue): {
  readonly path: string;
  readonly worktreeId?: string;
} {
  return parseWorktreePathRequest(payload);
}

export function unitKindFromType(type: number): UnitKind {
  if (type === 1) return "doc";
  if (type === 2) return "sheet";
  if (type === 3) return "slide";
  if (type === 5) return "base";
  if (type === 6) return "board";
  throw codedError("UNIT_TYPE_UNSUPPORTED", `Unsupported Unit type ${String(type)}`);
}

export function unitTypeFromKind(kind: UnitKind): 1 | 2 | 3 | 5 | 6 {
  if (kind === "doc") return 1;
  if (kind === "sheet") return 2;
  if (kind === "slide") return 3;
  if (kind === "base") return 5;
  return 6;
}

function parseUnit(record: Readonly<Record<string, JsonValue>>): UnitResult {
  const type = record["type"];
  const headRev = record["headRev"];
  if (typeof type !== "number" || !Number.isSafeInteger(type)) {
    throw invalidResult("Unit type is invalid");
  }
  if (typeof headRev !== "number" || !Number.isSafeInteger(headRev) || headRev < 1) {
    throw invalidResult("Unit revision is invalid");
  }
  return {
    headRev,
    kind: unitKindFromType(type),
    name: requireString(record["name"], "Unit name", true),
    type,
    unitId: requireString(record["unitId"], "Unit ID"),
  };
}

function requireUnitKind(value: JsonValue | undefined): UnitKind {
  if (
    value === "sheet" ||
    value === "doc" ||
    value === "slide" ||
    value === "base" ||
    value === "board"
  ) {
    return value;
  }
  throw codedError("UNIT_REQUEST_INVALID", "Unit kind is invalid");
}
