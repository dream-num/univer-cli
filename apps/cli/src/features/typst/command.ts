import {
  compileDocTypstBundle,
  isDocTypstFacadeError,
  type CompileDocTypstBundleResult,
} from "@univer-cli/doc-typst-facade";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import type { LocalTypstApplication } from "./service.js";

interface CompileTypstOptions {
  readonly apply?: string;
  readonly diagnosticsOut?: string;
  readonly json?: boolean;
  readonly out?: string;
  readonly previewDir?: string;
  readonly worktree?: string;
}

export function createCompileTypstCommand(application: LocalTypstApplication): Command {
  const command = new Command("compile-typst")
    .description("Compile a Typst bundle and optionally create a Doc in a Worktree")
    .argument("<bundle>", "bundle directory or typst.json path")
    .option("--apply <file.univer>", "create the target Doc in a local Univerfile")
    .option("--worktree <id>", "writable Worktree for --apply")
    .option("--out <file>", "write the generated JavaScript program")
    .option("--diagnostics-out <file>", "write structured diagnostics as JSON")
    .option("--preview-dir <directory>", "render PNG previews into this directory")
    .option("--json", "write the structured compile result as JSON")
    .action(async (bundle: string, options: CompileTypstOptions) => {
      validateOptions(command, options);
      let compiled: CompileDocTypstBundleResult;
      try {
        compiled = await compileDocTypstBundle(
          bundle,
          options.previewDir === undefined ? {} : { previewDir: options.previewDir },
        );
        const errors = compiled.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
        if (options.apply !== undefined && errors.length > 0) {
          throw Object.assign(
            new Error(
              `Typst compile has ${String(errors.length)} error diagnostics; Doc was not created`,
            ),
            { code: "DOC_TYPST_DIAGNOSTICS_ERROR", details: { diagnostics: errors } },
          );
        }
        const javascriptPath =
          options.out === undefined
            ? undefined
            : await writeTextFile(options.out, compiled.javascript);
        const diagnosticsPath =
          options.diagnosticsOut === undefined
            ? undefined
            : await writeTextFile(
                options.diagnosticsOut,
                `${JSON.stringify({ schemaVersion: 1, diagnostics: compiled.diagnostics }, null, 2)}\n`,
              );
        const applied =
          options.apply === undefined
            ? undefined
            : await application.createDocumentFromProgram({
                code: compiled.javascript,
                name: compiled.title,
                path: options.apply,
                unitId: compiled.targetUnitId,
                worktreeId: options.worktree!,
              });
        const result = {
          targetUnitId: compiled.targetUnitId,
          title: compiled.title,
          ...(javascriptPath === undefined ? {} : { javascriptPath }),
          ...(diagnosticsPath === undefined ? {} : { diagnosticsPath }),
          diagnostics: compiled.diagnostics,
          previews: compiled.previews,
          ...(applied === undefined ? {} : { applied }),
        };
        command
          .configureOutput()
          .writeOut?.(
            options.json === true
              ? `${JSON.stringify(result, null, 2)}\n`
              : applied === undefined
                ? `Compiled ${compiled.targetUnitId}${javascriptPath === undefined ? "" : ` to ${javascriptPath}`} (${String(compiled.diagnostics.length)} diagnostics)\n`
                : `Created Doc ${applied.unitId} in Worktree ${applied.worktreeId}\n`,
          );
      } catch (error) {
        const typstDetails = typstErrorDetails(error);
        if (options.diagnosticsOut !== undefined) {
          const diagnostics =
            diagnosticsFromDetails(errorDetails(error)) ?? typstDetails?.diagnostics;
          if (diagnostics !== undefined) {
            await writeTextFile(
              options.diagnosticsOut,
              `${JSON.stringify({ schemaVersion: 1, diagnostics }, null, 2)}\n`,
            );
          }
        }
        if (
          typstDetails !== undefined &&
          error instanceof Error &&
          errorDetails(error) === undefined
        ) {
          Object.assign(error, { details: typstDetails });
        }
        const code = isDocTypstFacadeError(error)
          ? error.code
          : errorCode(error, "compile-typst.failed");
        fail(command, error, code);
      }
    });
  return command;
}

function validateOptions(command: Command, options: CompileTypstOptions): void {
  if (options.apply === undefined && options.out === undefined) {
    fail(
      command,
      new Error("compile-typst requires at least --apply <file.univer> or --out <program.js>"),
      "compile-typst.invalid-input",
    );
  }
  if ((options.apply === undefined) !== (options.worktree === undefined)) {
    fail(
      command,
      new Error("--apply and --worktree must be provided together"),
      "compile-typst.invalid-input",
    );
  }
}

async function writeTextFile(path: string, text: string): Promise<string> {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");
  return outputPath;
}

function fail(command: Command, error: unknown, code: string): never {
  if (!(error instanceof Error)) throw error;
  try {
    command.error(error.message, { code, exitCode: 1 });
  } catch (commanderError) {
    const details = errorDetails(error);
    if (details !== undefined && commanderError instanceof Error) {
      Object.assign(commanderError, { details });
    }
    throw commanderError;
  }
}

function errorCode(error: unknown, fallback: string): string {
  if (isRecord(error) && typeof error["code"] === "string" && error["code"].length > 0) {
    return error["code"];
  }
  return fallback;
}

function errorDetails(error: unknown): unknown {
  return isRecord(error) ? error["details"] : undefined;
}

function diagnosticsFromDetails(details: unknown): readonly unknown[] | undefined {
  return isRecord(details) && Array.isArray(details["diagnostics"])
    ? details["diagnostics"]
    : undefined;
}

function typstErrorDetails(
  error: unknown,
):
  | { readonly diagnostics: readonly unknown[]; readonly previews?: readonly unknown[] }
  | undefined {
  if (!isRecord(error) || !Array.isArray(error["diagnostics"])) return undefined;
  return {
    diagnostics: error["diagnostics"],
    ...(Array.isArray(error["previews"]) ? { previews: error["previews"] } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
