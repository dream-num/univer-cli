import type {
  ContentInspectionQuery,
  ContentInspectionResult,
} from "@univer-cli/content-inspection";
import type { JsonValue } from "@univer-cli/daemon";
import {
  codedError,
  invalidResult,
  requireRecord,
  requireString,
} from "../../daemon/rpc-values.js";
import { parseUnitTargetRequest } from "../unit/protocol.js";
import { parseWorktreePathRequest } from "../worktree/protocol.js";

export const CONTENT_EXECUTE_METHOD = "univer.content.execute";
export const CONTENT_INSPECT_METHOD = "univer.content.inspect";

export interface ContentExecuteResult {
  readonly committed: boolean;
  readonly filePath: string;
  readonly revision?: number;
  readonly unitId: string;
  readonly value: JsonValue;
  readonly worktreeId: string;
}

export interface ContentInspectResult {
  readonly inspection: ContentInspectionResult;
}

export function parseExecuteRequest(payload: JsonValue): {
  readonly code: string;
  readonly path: string;
  readonly unitId: string;
  readonly worktreeId: string;
} {
  const record = requireRecord(payload, "content execute request");
  return {
    ...parseUnitTargetRequest(payload),
    code: requireString(record["code"], "content execute code", true),
  };
}

export function parseInspectRequest(payload: JsonValue): {
  readonly path: string;
  readonly query: ContentInspectionQuery;
  readonly unitId: string;
  readonly worktreeId?: string;
} {
  const record = requireRecord(payload, "content inspect request");
  const target = parseWorktreePathRequest(payload);
  const query = requireRecord(record["query"], "content inspection query");
  const kind = query["kind"];
  if (
    kind !== "workbook" &&
    kind !== "worksheet" &&
    kind !== "worksheet-range" &&
    kind !== "presentation" &&
    kind !== "slide" &&
    kind !== "document" &&
    kind !== "paragraph"
  ) {
    throw codedError("INSPECTION_REQUEST_INVALID", "content inspection query kind is invalid");
  }
  return {
    ...target,
    query: query as unknown as ContentInspectionQuery,
    unitId: requireString(record["unitId"], "content inspection Unit ID"),
  };
}

export function parseContentExecuteResult(value: JsonValue): ContentExecuteResult {
  const record = requireRecord(value, "content execute result");
  if (typeof record["committed"] !== "boolean" || !("value" in record)) {
    throw invalidResult("content execute result is invalid");
  }
  const revision = record["revision"];
  if (
    revision !== undefined &&
    (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1)
  ) {
    throw invalidResult("content execute revision is invalid");
  }
  return {
    committed: record["committed"],
    filePath: requireString(record["filePath"], "content execute filePath"),
    ...(revision === undefined ? {} : { revision }),
    unitId: requireString(record["unitId"], "content execute Unit ID"),
    value: record["value"] as JsonValue,
    worktreeId: requireString(record["worktreeId"], "content execute Worktree ID"),
  };
}

export function parseContentInspectResult(value: JsonValue): ContentInspectResult {
  const record = requireRecord(value, "content inspect result");
  const inspection = requireRecord(record["inspection"], "content inspection result");
  if (typeof inspection["kind"] !== "string") {
    throw invalidResult("content inspection result kind is invalid");
  }
  return { inspection: inspection as unknown as ContentInspectionResult };
}
