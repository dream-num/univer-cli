import type { JsonValue } from "@univer-cli/daemon";
import type { UniverRenderUnit } from "@univer-cli/univer-render-runtime";
import {
  codedError,
  optionalString,
  requireRecord,
  requireString,
} from "../../daemon/rpc-values.js";

export const CONTENT_RENDER_SOURCE_METHOD = "univer.content.render-source";

export interface ContentRenderSourceRequest {
  readonly path: string;
  readonly unitId?: string;
  readonly worktreeId?: string;
}

export function parseContentRenderSourceRequest(payload: JsonValue): ContentRenderSourceRequest {
  const record = requireRecord(payload, "content render-source request");
  const unitId = optionalString(record["unitId"], "content render-source Unit ID");
  const worktreeId = optionalString(record["worktreeId"], "content render-source Worktree ID");
  return {
    path: requireString(record["path"], "content render-source Univerfile path"),
    ...(unitId === undefined ? {} : { unitId }),
    ...(worktreeId === undefined ? {} : { worktreeId }),
  };
}

export function parseContentRenderSourceResult(value: JsonValue): UniverRenderUnit {
  const record = requireRecord(value, "content render-source result");
  const unitType = record["unitType"];
  if (
    unitType !== "sheet" &&
    unitType !== "doc" &&
    unitType !== "slide" &&
    unitType !== "board" &&
    unitType !== "base"
  ) {
    throw codedError("DAEMON_RESULT_INVALID", "content render-source Unit type is invalid");
  }
  const unitData = requireRecord(record["unitData"], "content render-source Unit data");
  requireString(unitData["id"], "content render-source Unit data ID");
  validateRenderUnitList(record["formulaReferenceUnits"], ["sheet", "base"]);
  validateRenderUnitList(record["embeddedUnits"], ["sheet", "doc", "slide", "board", "base"]);
  return record as unknown as UniverRenderUnit;
}

function validateRenderUnitList(
  value: JsonValue | undefined,
  allowedTypes: readonly string[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw codedError("DAEMON_RESULT_INVALID", "content render-source dependency list is invalid");
  }
  for (const item of value) {
    const record = requireRecord(item, "content render-source dependency");
    if (typeof record["unitType"] !== "string" || !allowedTypes.includes(record["unitType"])) {
      throw codedError("DAEMON_RESULT_INVALID", "content render-source dependency type is invalid");
    }
    const unitData = requireRecord(record["unitData"], "content render-source dependency data");
    requireString(unitData["id"], "content render-source dependency Unit ID");
  }
}
