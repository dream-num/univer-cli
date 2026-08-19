import type { JsonValue } from "@univer-cli/daemon";
import {
  codedError,
  optionalString,
  requireRecord,
  requireString,
} from "../../daemon/rpc-values.js";
import type { UnitKind } from "../unit/protocol.js";

export const CONTENT_IMPORT_METHOD = "univer.content.import";
export const CONTENT_EXPORT_METHOD = "univer.content.export";

export type ExchangeUnitKind = Exclude<UnitKind, "board">;
export type FormulaCalculationMode = "forced" | "when_empty" | "no";

export interface ContentImportResult {
  readonly filePath: string;
  readonly kind: ExchangeUnitKind;
  readonly name: string;
  readonly scope: "trunk" | "worktree";
  readonly sourcePath: string;
  readonly type: number;
  readonly unitId: string;
  readonly worktreeId?: string;
}

export interface ContentExportResult {
  readonly filePath: string;
  readonly kind: ExchangeUnitKind;
  readonly outputPath: string;
  readonly scope: "trunk" | "worktree";
  readonly type: number;
  readonly unitId: string;
  readonly worktreeId?: string;
}

export interface ContentImportRequest {
  readonly formulaCalculationMode?: FormulaCalculationMode;
  readonly kind: ExchangeUnitKind;
  readonly name: string;
  readonly path: string;
  readonly sourcePath: string;
  readonly worktreeId?: string;
}

export interface ContentExportRequest {
  readonly formulaCalculationMode?: FormulaCalculationMode;
  readonly outputPath: string;
  readonly path: string;
  readonly sheetName?: string;
  readonly tableName?: string;
  readonly unitId?: string;
  readonly worktreeId?: string;
}

export function parseContentImportRequest(payload: JsonValue): ContentImportRequest {
  const record = requireRecord(payload, "content import request");
  const formulaCalculationMode = optionalFormulaCalculationMode(record["formulaCalculationMode"]);
  const worktreeId = optionalString(record["worktreeId"], "content import Worktree ID");
  return {
    kind: requireExchangeUnitKind(record["kind"]),
    name: requireString(record["name"], "content import Unit name", true),
    path: requireString(record["path"], "content import Univerfile path"),
    sourcePath: requireString(record["sourcePath"], "content import source path"),
    ...(formulaCalculationMode === undefined ? {} : { formulaCalculationMode }),
    ...(worktreeId === undefined ? {} : { worktreeId }),
  };
}

export function parseContentExportRequest(payload: JsonValue): ContentExportRequest {
  const record = requireRecord(payload, "content export request");
  const formulaCalculationMode = optionalFormulaCalculationMode(record["formulaCalculationMode"]);
  const sheetName = optionalString(record["sheetName"], "content export Sheet name");
  const tableName = optionalString(record["tableName"], "content export table name");
  if (sheetName !== undefined && tableName !== undefined) {
    throw codedError(
      "CONTENT_EXCHANGE_SELECTOR_INVALID",
      "content export cannot select both a Sheet and a Base table",
    );
  }
  const unitId = optionalString(record["unitId"], "content export Unit ID");
  const worktreeId = optionalString(record["worktreeId"], "content export Worktree ID");
  return {
    outputPath: requireString(record["outputPath"], "content export output path"),
    path: requireString(record["path"], "content export Univerfile path"),
    ...(formulaCalculationMode === undefined ? {} : { formulaCalculationMode }),
    ...(sheetName === undefined ? {} : { sheetName }),
    ...(tableName === undefined ? {} : { tableName }),
    ...(unitId === undefined ? {} : { unitId }),
    ...(worktreeId === undefined ? {} : { worktreeId }),
  };
}

export function parseContentImportResult(value: JsonValue): ContentImportResult {
  const record = requireRecord(value, "content import result");
  return {
    ...parseExchangeResult(record, "content import"),
    name: requireString(record["name"], "content import Unit name", true),
    sourcePath: requireString(record["sourcePath"], "content import source path"),
  };
}

export function parseContentExportResult(value: JsonValue): ContentExportResult {
  const record = requireRecord(value, "content export result");
  return {
    ...parseExchangeResult(record, "content export"),
    outputPath: requireString(record["outputPath"], "content export output path"),
  };
}

function parseExchangeResult(
  record: Readonly<Record<string, JsonValue>>,
  label: string,
): Omit<ContentExportResult, "outputPath"> {
  const scope = record["scope"];
  if (scope !== "trunk" && scope !== "worktree") {
    throw codedError("DAEMON_RESULT_INVALID", `${label} scope is invalid`);
  }
  const type = record["type"];
  if (typeof type !== "number" || !Number.isSafeInteger(type)) {
    throw codedError("DAEMON_RESULT_INVALID", `${label} Unit type is invalid`);
  }
  const worktreeId = optionalString(record["worktreeId"], `${label} Worktree ID`);
  return {
    filePath: requireString(record["filePath"], `${label} Univerfile path`),
    kind: requireExchangeUnitKind(record["kind"]),
    scope,
    type,
    unitId: requireString(record["unitId"], `${label} Unit ID`),
    ...(worktreeId === undefined ? {} : { worktreeId }),
  };
}

function requireExchangeUnitKind(value: JsonValue | undefined): ExchangeUnitKind {
  if (value === "sheet" || value === "base" || value === "doc" || value === "slide") {
    return value;
  }
  throw codedError("CONTENT_EXCHANGE_TYPE_INVALID", "Unit type must be sheet, base, doc, or slide");
}

function optionalFormulaCalculationMode(
  value: JsonValue | undefined,
): FormulaCalculationMode | undefined {
  if (value === undefined) return undefined;
  if (value === "forced" || value === "when_empty" || value === "no") return value;
  throw codedError(
    "CONTENT_EXCHANGE_FORMULA_CALCULATION_INVALID",
    "formula calculation mode must be forced, when_empty, or no",
  );
}
