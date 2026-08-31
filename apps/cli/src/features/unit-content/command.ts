import {
  InspectionCommandInputError,
  parseInspectionQuery,
  renderContentInspection,
} from "@univer-cli/content-inspection-command";
import { readFile } from "node:fs/promises";
import { Argument, Command, Option } from "commander";
import type { LocalUnitContentApplication } from "./service.js";
import type { ContentExecuteResult } from "./protocol.js";

interface JsonOptions {
  readonly json?: boolean;
}

interface ExecuteOptions extends JsonOptions {
  readonly code?: string;
  readonly script?: string;
  readonly unit: string;
  readonly worktree: string;
}

interface InspectOptions extends JsonOptions {
  readonly trunk?: boolean;
  readonly unit: string;
  readonly worksheet?: string;
  readonly worktree?: string;
}

const INSPECTION_TARGETS = [
  "workbook",
  "worksheet",
  "range",
  "document",
  "paragraph",
  "presentation",
  "slide",
  "base",
  "board",
  "board-element",
] as const;

type InspectionTarget = (typeof INSPECTION_TARGETS)[number];

export function createUnitContentCommands(
  application: LocalUnitContentApplication,
): readonly Command[] {
  return [createExecuteCommand(application), createInspectCommand(application)];
}

function createExecuteCommand(application: LocalUnitContentApplication): Command {
  const command = new Command("execute")
    .description("Execute trusted Facade code and commit captured mutations")
    .argument("<file.univer>", "local .univer file path")
    .requiredOption("--worktree <id>", "writable Worktree ID")
    .requiredOption("--unit <id>", "Unit ID")
    .option("-e, --code <code>", "inline Facade code; use --script for multiline code")
    .option("--script <path>", "read multiline Facade code from a local file")
    .option("--json", "write structured JSON")
    .addHelpText(
      "after",
      [
        "",
        "Execution notes:",
        "  Explicitly return readback values; bare expressions and console.log do not populate value.",
        "  The execution sandbox has no Node.js require. Read-only code creates no revision.",
        "",
      ].join("\n"),
    )
    .action(async (path: string, options: ExecuteOptions) => {
      const code = await run(command, async () => await readCode(options));
      const result = await run(command, async () =>
        application.execute({
          code,
          path,
          unitId: options.unit,
          worktreeId: options.worktree,
        }),
      );
      present(command, options, result, renderExecute(result));
    });
  return command;
}

function createInspectCommand(application: LocalUnitContentApplication): Command {
  const command = new Command("inspect")
    .description("Inspect structured Univer content")
    .addArgument(new Argument("<target>", "content target").choices(INSPECTION_TARGETS))
    .argument("<arguments...>", "selectors followed by the local .univer file path")
    .requiredOption("--unit <unit-id>", "Unit to inspect")
    .option("--worksheet <selector>", "worksheet selector for range")
    .addOption(new Option("--trunk", "inspect the trunk").conflicts("worktree"))
    .addOption(new Option("--worktree <id>", "inspect a Worktree").conflicts("trunk"))
    .option("--json", "write the complete structured result as JSON")
    .action(async (target: InspectionTarget, arguments_: string[], options: InspectOptions) => {
      if (options.trunk !== true && options.worktree === undefined) {
        fail(
          command,
          codedError("INSPECTION_SCOPE_REQUIRED", "Specify --trunk or --worktree <id>"),
        );
      }
      const path = arguments_.at(-1);
      if (path === undefined) {
        fail(command, codedError("INSPECTION_INPUT_INVALID", "A local .univer file is required"));
      }
      const selectors = arguments_.slice(0, -1);
      const query = await run(command, async () => {
        try {
          return parseInspectionQuery(
            target === "range" ? "worksheet-range" : target,
            selectors,
            options,
          );
        } catch (error) {
          if (error instanceof InspectionCommandInputError) {
            throw codedError("INSPECTION_INPUT_INVALID", error.message);
          }
          throw error;
        }
      });
      const result = await run(command, async () =>
        application.inspect({
          path,
          query,
          unitId: options.unit,
          ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
        }),
      );
      present(command, options, result, [renderContentInspection(result)]);
    });
  return command;
}

async function readCode(options: ExecuteOptions): Promise<string> {
  const hasCode = options.code !== undefined;
  const hasScript = options.script !== undefined;
  if (hasCode === hasScript) {
    throw codedError(
      "CONTENT_CODE_REQUIRED",
      "Specify exactly one of --code <code> or --script <path>",
    );
  }
  if (options.code !== undefined) return options.code;
  try {
    return await readFile(options.script!, "utf8");
  } catch (error) {
    throw Object.assign(
      new Error(
        `Cannot read content script ${options.script}: ${error instanceof Error ? error.message : String(error)}`,
      ),
      { code: "CONTENT_SCRIPT_READ_FAILED" },
    );
  }
}

async function run<Result>(command: Command, operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    fail(command, error);
  }
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

function renderExecute(result: ContentExecuteResult): readonly string[] {
  return [
    JSON.stringify(result.value, null, 2),
    ...(result.committed ? [`committed revision ${String(result.revision)}`] : []),
  ];
}

function errorCode(error: Error): string {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : "UNIT_CONTENT_COMMAND_FAILED";
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
