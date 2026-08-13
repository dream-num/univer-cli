import type { JsonValue } from "@univer-cli/daemon";
import { requireRecord, requireString } from "../../daemon/rpc-values.js";
import { parseUnitCreateResult, type UnitCreateResult } from "../unit/protocol.js";

export const CONTENT_CREATE_DOCUMENT_METHOD = "univer.content.create-document";

export interface ContentCreateDocumentRequest {
  readonly code: string;
  readonly name: string;
  readonly path: string;
  readonly unitId: string;
  readonly worktreeId: string;
}

export function parseContentCreateDocumentRequest(
  payload: JsonValue,
): ContentCreateDocumentRequest {
  const record = requireRecord(payload, "content create document request");
  return {
    code: requireString(record["code"], "content create document code", true),
    name: requireString(record["name"], "content create document name", true),
    path: requireString(record["path"], "content create document Univerfile path"),
    unitId: requireString(record["unitId"], "content create document Unit ID"),
    worktreeId: requireString(record["worktreeId"], "content create document Worktree ID"),
  };
}

export function parseContentCreateDocumentResult(value: JsonValue): UnitCreateResult {
  return parseUnitCreateResult(value);
}
