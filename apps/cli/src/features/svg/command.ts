import {
  builtinTextMeasurer,
  compileSvgToFacade,
  isSvgFacadeError,
  wrapSlideScript,
  type SvgTextMeasurer,
} from "@univer-cli/svg-facade";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import type { LocalUnitContentApplication } from "../unit-content/service.js";

const ESTIMATE_LINT =
  "text boxes were sized by estimation (--estimate-text-size), not by real font metrics; recompile without the flag (with a browser) before you ship";

interface SvgCommandDependencies {
  readonly createTextMeasurer: () => SvgTextMeasurer & { close?: () => Promise<void> };
  readonly unitContent: LocalUnitContentApplication;
}

interface CompileSvgOptions {
  readonly add?: boolean;
  readonly apply?: string;
  readonly estimateTextSize?: boolean;
  readonly json?: boolean;
  readonly out?: string;
  readonly page?: number;
  readonly unit?: string;
  readonly worktree?: string;
}

export function createCompileSvgCommand(dependencies: SvgCommandDependencies): Command {
  const command = new Command("compile-svg")
    .description("Compile SVG into Univer Slide Facade code and optionally apply it")
    .argument("<file.svg>", "SVG source file")
    .option("--json", "write structured JSON")
    .option("--estimate-text-size", "use deterministic text-size estimation")
    .option("--page <number>", "wrap for a 1-based target Slide page", positiveInteger)
    .option("--add", "overlay onto the target page instead of clearing it")
    .option("--out <path>", "write generated code to a file")
    .option("--apply <file.univer>", "apply the generated page to a local Univerfile")
    .option("--worktree <id>", "writable Worktree for --apply")
    .option("--unit <id>", "Slide Unit for --apply")
    .action(async (file: string, options: CompileSvgOptions) => {
      validateSvgOptions(command, options);
      const estimate = options.estimateTextSize === true;
      const textMeasurer: SvgTextMeasurer & { close?: () => Promise<void> } = estimate
        ? builtinTextMeasurer
        : dependencies.createTextMeasurer();
      try {
        const svg = readFileSync(file, "utf8");
        const compiled = await compileSvgToFacade(svg, {
          assetResolver: (href) => ({ bytes: readFileSync(resolve(dirname(file), href)) }),
          textMeasurer,
        });
        const lints = estimate ? [...compiled.lints, ESTIMATE_LINT] : compiled.lints;
        const mode = options.add === true ? "add" : "replace";
        const code =
          options.page === undefined
            ? compiled.code
            : wrapSlideScript(compiled.code, {
                page: options.page,
                mode,
                ...compiled.viewport,
              });
        if (options.out !== undefined) writeFileSync(options.out, `${code}\n`, "utf8");

        const applied =
          options.apply === undefined
            ? undefined
            : await dependencies.unitContent.execute({
                code,
                path: options.apply,
                unitId: options.unit!,
                worktreeId: options.worktree!,
              });
        const result = {
          code,
          lints,
          textMeasure: compiled.textMeasure,
          viewport: compiled.viewport,
          warnings: compiled.warnings,
          ...(options.page === undefined ? {} : { mode, page: options.page }),
          ...(options.out === undefined ? {} : { out: options.out }),
          ...(applied === undefined ? {} : { applied }),
        };
        if (options.json === true) {
          command.configureOutput().writeOut?.(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }
        writeSvgDiagnostics(command, compiled.warnings, lints);
        if (applied !== undefined) {
          command
            .configureOutput()
            .writeOut?.(
              `applied page ${String(options.page)} (${mode}) to ${applied.unitId}${applied.committed ? ` at revision ${String(applied.revision)}` : ""}\n`,
            );
        } else if (options.out !== undefined) {
          command.configureOutput().writeOut?.(`generated code: ${options.out}\n`);
        } else {
          command.configureOutput().writeOut?.(`${code}\n`);
        }
      } catch (error) {
        const code = isSvgFacadeError(error) ? error.code : errorCode(error, "compile-svg.failed");
        fail(command, error, code);
      } finally {
        await textMeasurer.close?.().catch(() => undefined);
      }
    });
  return command;
}

function validateSvgOptions(command: Command, options: CompileSvgOptions): void {
  if (options.page === undefined && (options.add === true || options.out !== undefined)) {
    fail(
      command,
      new Error("--add and --out require --page <number>"),
      "compile-svg.invalid-input",
    );
  }
  if (options.apply !== undefined) {
    if (
      options.page === undefined ||
      options.worktree === undefined ||
      options.unit === undefined
    ) {
      fail(
        command,
        new Error("--apply requires --page <number>, --worktree <id>, and --unit <id>"),
        "compile-svg.invalid-input",
      );
    }
    if (options.out !== undefined) {
      fail(
        command,
        new Error("--apply and --out cannot be used together"),
        "compile-svg.invalid-input",
      );
    }
  } else if (options.worktree !== undefined || options.unit !== undefined) {
    fail(command, new Error("--worktree and --unit require --apply"), "compile-svg.invalid-input");
  }
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError(`Expected an integer >= 1; received ${JSON.stringify(value)}`);
  }
  return parsed;
}

function writeSvgDiagnostics(
  command: Command,
  warnings: readonly string[],
  lints: readonly string[],
): void {
  const output = command.configureOutput();
  for (const warning of warnings) output.writeErr?.(`warning: ${warning}\n`);
  for (const lint of lints) output.writeErr?.(`lint: ${lint}\n`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
