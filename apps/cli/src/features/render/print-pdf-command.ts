import { Command } from "commander";
import type { LocalRenderApplication } from "./service.js";

interface PrintPdfOptions {
  readonly json?: boolean;
  readonly unit?: string;
  readonly worktree?: string;
}

/** Compose Unit PDF printing with Local Univerfile addressing and output. */
export function createPrintPdfCommand(application: LocalRenderApplication): Command {
  const command = new Command("print-pdf")
    .description("Print a local Univerfile Unit to PDF")
    .argument("<file.univer>", "local .univer file")
    .argument("<output.pdf>", "output PDF file")
    .option("--worktree <id>", "read a Worktree; defaults to trunk")
    .option("--unit <unit-id>", "Unit to print; optional only when the scope has one Unit")
    .option("--json", "write a structured output summary as JSON")
    .action(async (path: string, destination: string, options: PrintPdfOptions) => {
      try {
        const result = await application.printPdf({
          destination,
          path,
          ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
          ...(options.unit === undefined ? {} : { unitId: options.unit }),
        });
        command
          .configureOutput()
          .writeOut?.(
            options.json === true ? `${JSON.stringify(result, null, 2)}\n` : `${result.location}\n`,
          );
      } catch (error) {
        fail(command, error);
      }
    });
  return command;
}

function fail(command: Command, error: unknown): never {
  if (!(error instanceof Error)) throw error;
  try {
    command.error(error.message, { code: errorCode(error), exitCode: 1 });
  } catch (commanderError) {
    const details = (error as Error & { readonly details?: unknown }).details;
    if (details !== undefined && commanderError instanceof Error) {
      Object.assign(commanderError, { details });
    }
    throw commanderError;
  }
}

function errorCode(error: Error): string {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : "UNIT_PRINT_PDF_FAILED";
}
