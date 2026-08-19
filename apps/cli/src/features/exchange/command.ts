import { basename, extname } from "node:path";
import { Command, Option } from "commander";
import type { LocalExchangeApplication } from "./service.js";
import type { ExchangeUnitKind, FormulaCalculationMode } from "./protocol.js";

const IMPORT_KINDS = ["sheet", "base", "doc", "slide"] as const;
const FORMULA_CALCULATION_MODES = ["forced", "when_empty", "no"] as const;

interface JsonOptions {
  readonly json?: boolean;
}

interface ImportOptions extends JsonOptions {
  readonly file: string;
  readonly formulaCalculation?: FormulaCalculationMode;
  readonly name?: string;
  readonly type?: ExchangeUnitKind;
  readonly worktree?: string;
}

interface ExportOptions extends JsonOptions {
  readonly formulaCalculation?: FormulaCalculationMode;
  readonly sheet?: string;
  readonly table?: string;
  readonly unit?: string;
  readonly worktree?: string;
}

export function createExchangeCommands(application: LocalExchangeApplication): readonly Command[] {
  return [createImportCommand(application), createExportCommand(application)];
}

function createImportCommand(application: LocalExchangeApplication): Command {
  const command = new Command("import")
    .description("Import a local file or HTTP(S) URL as a Sheet, Base, Doc, or Slide Unit")
    .argument("<target.univer>", "new or existing local .univer file")
    .requiredOption(
      "--file <source>",
      "local or HTTP(S) XLS/XLSX/XLSM/CSV/TSV/DOC/DOCX/PPT/PPTX source",
    )
    .addOption(
      new Option(
        "--formula-calculation <mode>",
        "formula calculation policy used for Sheet conversion",
      ).choices(FORMULA_CALCULATION_MODES),
    )
    .addOption(
      new Option("--type <kind>", "Unit kind; inferred from the source suffix").choices(
        IMPORT_KINDS,
      ),
    )
    .option("--name <name>", "imported Unit name")
    .option("--worktree <id>", "import into an existing writable Worktree")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: ImportOptions) => {
      validateImportSource(options.file);
      const kind = options.type ?? inferImportKind(options.file);
      const name = options.name ?? defaultImportedName(options.file);
      const result = await execute(command, async () =>
        application.importFile({
          kind,
          name,
          path,
          sourcePath: options.file,
          ...(options.formulaCalculation === undefined
            ? {}
            : { formulaCalculationMode: options.formulaCalculation }),
          ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
        }),
      );
      present(command, options, result, [
        `imported: ${result.sourcePath}`,
        `unit: ${result.unitId}`,
        `type: ${result.kind}`,
        `file: ${result.filePath}`,
        ...(result.worktreeId === undefined ? [] : [`worktree: ${result.worktreeId}`]),
      ]);
    });
  return command;
}

function createExportCommand(application: LocalExchangeApplication): Command {
  const command = new Command("export")
    .description("Export a Sheet/Base, Doc, or Slide Unit to XLSX, CSV, TSV, DOCX, or PPTX")
    .argument("<file.univer>", "local .univer file")
    .argument("<output>", "output .xlsx, .csv, .tsv, .docx, or .pptx path")
    .option("--worktree <id>", "read a Worktree; defaults to trunk")
    .option("--unit <id>", "Unit ID; optional only when the scope has one Unit")
    .addOption(new Option("--sheet <name>", "Sheet name for CSV/TSV export").conflicts("table"))
    .addOption(
      new Option("--table <name>", "Base table name for CSV/TSV export").conflicts("sheet"),
    )
    .addOption(
      new Option(
        "--formula-calculation <mode>",
        "formula calculation policy used for Sheet conversion",
      ).choices(FORMULA_CALCULATION_MODES),
    )
    .option("--json", "write structured JSON")
    .action(async (path: string, outputPath: string, options: ExportOptions) => {
      validateExportSuffix(outputPath);
      const result = await execute(command, async () =>
        application.exportFile({
          outputPath,
          path,
          ...(options.formulaCalculation === undefined
            ? {}
            : { formulaCalculationMode: options.formulaCalculation }),
          ...(options.sheet === undefined ? {} : { sheetName: options.sheet }),
          ...(options.table === undefined ? {} : { tableName: options.table }),
          ...(options.unit === undefined ? {} : { unitId: options.unit }),
          ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
        }),
      );
      present(command, options, result, [
        `exported: ${result.outputPath}`,
        `unit: ${result.unitId}`,
        `type: ${result.kind}`,
        ...(result.worktreeId === undefined ? [] : [`worktree: ${result.worktreeId}`]),
      ]);
    });
  return command;
}

function inferImportKind(path: string): ExchangeUnitKind {
  const extension = importSourceExtension(path);
  if ([".xls", ".xlsx", ".xlsm", ".csv", ".tsv"].includes(extension)) return "sheet";
  if ([".doc", ".docx"].includes(extension)) return "doc";
  if ([".ppt", ".pptx", ".pptm", ".ppsx", ".ppsm", ".potx"].includes(extension)) {
    return "slide";
  }
  throw codedError(
    "IMPORT_TYPE_REQUIRED",
    `Cannot infer Unit type from ${JSON.stringify(extension || path)}; specify --type`,
  );
}

function defaultImportedName(path: string): string {
  const sourcePath = importSourcePath(path);
  const name = basename(sourcePath, extname(sourcePath));
  return name === "" ? "Imported" : name;
}

function validateImportSource(path: string): void {
  if (importSourceExtension(path) !== ".univer") return;
  throw codedError(
    "IMPORT_SOURCE_UNIVERFILE_REJECTED",
    "A .univer container cannot be used as an exchange import source",
  );
}

function importSourceExtension(path: string): string {
  return extname(importSourcePath(path)).toLowerCase();
}

function importSourcePath(path: string): string {
  try {
    const url = new URL(path);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") {
      return decodeURIComponent(url.pathname);
    }
  } catch {
    // Local paths are not required to be valid URLs.
  }
  return path;
}

function validateExportSuffix(path: string): void {
  const extension = extname(path).toLowerCase();
  if ([".xlsx", ".csv", ".tsv", ".docx", ".pptx"].includes(extension)) return;
  throw codedError(
    "EXPORT_FORMAT_UNSUPPORTED",
    "Output must use .xlsx, .csv, .tsv, .docx, or .pptx",
  );
}

async function execute<Result>(
  command: Command,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    fail(command, error);
  }
}

function fail(command: Command, error: unknown): never {
  if (!(error instanceof Error)) throw error;
  command.error(error.message, { code: errorCode(error), exitCode: 1 });
}

function present(
  command: Command,
  options: JsonOptions,
  value: unknown,
  text: readonly string[],
): void {
  command
    .configureOutput()
    .writeOut?.(`${options.json === true ? JSON.stringify(value, null, 2) : text.join("\n")}\n`);
}

function errorCode(error: Error): string {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : "CONTENT_EXCHANGE_FAILED";
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
