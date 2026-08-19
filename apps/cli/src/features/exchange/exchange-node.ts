import type { CollaborationUnitData } from "@univer-cli/univer-collaboration-runtime";
import {
  ExchangeError,
  ExchangeErrorCode,
  ExchangeFormat,
  FormulaCalculationMode as NodeFormulaCalculationMode,
  exportToFile,
  importFile,
  type ExportOptions,
  type ImportOptions,
} from "@univerjs-pro/exchange-node";
import { UniverInstanceType } from "@univerjs/core";
import { extname } from "node:path";
import { codedError } from "../../daemon/rpc-values.js";
import type { FormulaCalculationMode } from "./protocol.js";

export type ExchangeUnitType =
  | UniverInstanceType.UNIVER_SHEET
  | UniverInstanceType.UNIVER_BASE
  | UniverInstanceType.UNIVER_DOC
  | UniverInstanceType.UNIVER_SLIDE;

const importUnitData = importFile as unknown as (
  path: string,
  options: ImportOptions,
) => Promise<object>;
const exportUnitData = exportToFile as unknown as (
  data: object,
  path: string,
  options: ExportOptions,
) => Promise<void>;

export async function importOfficeFile(input: {
  readonly formulaCalculationMode?: FormulaCalculationMode;
  readonly sourcePath: string;
  readonly unitType: ExchangeUnitType;
}): Promise<object> {
  const extension = extname(input.sourcePath).toLowerCase();
  const format = exchangeImportFormatOverride(extension);
  const options = {
    type: input.unitType,
    ...(format === undefined ? {} : { format }),
    ...(input.unitType === UniverInstanceType.UNIVER_SHEET &&
    (extension === ".xlsx" || extension === ".xlsm")
      ? {
          formulaCalculation: toNodeFormulaCalculation(input.formulaCalculationMode ?? "forced"),
        }
      : {}),
  } as ImportOptions;
  return await withExchangeError(() => importUnitData(input.sourcePath, options));
}

export async function exportOfficeFile(input: {
  readonly data: CollaborationUnitData;
  readonly format: ExchangeFormat;
  readonly formulaCalculationMode?: FormulaCalculationMode;
  readonly outputPath: string;
  readonly sheetName?: string;
  readonly tableName?: string;
  readonly unitType: ExchangeUnitType;
}): Promise<void> {
  const options = {
    type: input.unitType,
    format: input.format,
    ...(input.unitType === UniverInstanceType.UNIVER_SHEET
      ? {
          formulaCalculation: toNodeFormulaCalculation(input.formulaCalculationMode ?? "forced"),
        }
      : {}),
    ...csvExportOptions(input),
  } as ExportOptions;
  await withExchangeError(() => exportUnitData(input.data, input.outputPath, options));
}

export function exchangeImportFormatOverride(extension: string): ExchangeFormat | undefined {
  switch (extension) {
    case ".xlsm":
      return ExchangeFormat.XLSX;
    case ".pptm":
    case ".ppsx":
    case ".ppsm":
    case ".potx":
      return ExchangeFormat.PPTX;
    default:
      return undefined;
  }
}

function csvExportOptions(input: {
  readonly format: ExchangeFormat;
  readonly sheetName?: string;
  readonly tableName?: string;
  readonly unitType: ExchangeUnitType;
}): { readonly csv?: { readonly worksheetName: string } | { readonly tableName: string } } {
  const delimited = input.format === ExchangeFormat.CSV || input.format === ExchangeFormat.TSV;
  if (!delimited) {
    if (input.sheetName !== undefined || input.tableName !== undefined) {
      throw codedError("invalid-input", "Sheet and table selectors require CSV or TSV output");
    }
    return {};
  }
  if (input.unitType === UniverInstanceType.UNIVER_SHEET) {
    if (input.tableName !== undefined || input.sheetName === undefined) {
      throw codedError(
        "invalid-input",
        "Sheet CSV/TSV export requires exactly one --sheet <name> selector",
      );
    }
    return { csv: { worksheetName: input.sheetName } };
  }
  if (input.unitType === UniverInstanceType.UNIVER_BASE) {
    if (input.sheetName !== undefined || input.tableName === undefined) {
      throw codedError(
        "invalid-input",
        "Base CSV/TSV export requires exactly one --table <name> selector",
      );
    }
    return { csv: { tableName: input.tableName } };
  }
  throw codedError("unsupported-format", "CSV/TSV export only supports Sheet and Base Units");
}

function toNodeFormulaCalculation(value: FormulaCalculationMode): NodeFormulaCalculationMode {
  switch (value) {
    case "forced":
      return NodeFormulaCalculationMode.FORCED;
    case "when_empty":
      return NodeFormulaCalculationMode.WHEN_EMPTY;
    case "no":
      return NodeFormulaCalculationMode.NO;
  }
}

async function withExchangeError<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeExchangeError(error);
  }
}

function normalizeExchangeError(error: unknown): Error {
  if (!(error instanceof ExchangeError)) {
    return conversionFailed(error);
  }
  switch (error.code) {
    case ExchangeErrorCode.INVALID_ARGUMENT:
      return Object.assign(new Error(error.message, { cause: error }), { code: "invalid-input" });
    case ExchangeErrorCode.UNSUPPORTED_FORMAT:
      return Object.assign(new Error(error.message, { cause: error }), {
        code: "unsupported-format",
      });
    case ExchangeErrorCode.NATIVE_LOAD_FAILED:
      return Object.assign(
        new Error("The native Office exchange binding is unavailable.", { cause: error }),
        { code: "dependency-unavailable" },
      );
    default:
      return conversionFailed(error);
  }
}

function conversionFailed(cause: unknown): Error {
  return Object.assign(new Error("Office file conversion failed.", { cause }), {
    code: "conversion-failed",
  });
}
