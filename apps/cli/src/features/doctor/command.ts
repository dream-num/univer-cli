import { Command } from "commander";
import {
  DoctorError,
  type Doctor,
  type DoctorCollectionResult,
  type DoctorReport,
} from "./model.js";

interface OutputOptions {
  readonly json?: boolean;
}

interface CollectOptions extends OutputOptions {
  readonly all?: boolean;
  readonly last?: string;
  readonly output?: string;
  readonly since?: string;
  readonly traceId?: string;
}

export function createDoctorCommand(doctor: Doctor): Command {
  const command = new Command("doctor")
    .description("Check application readiness")
    .option("--json", "write structured JSON")
    .action(async (options: OutputOptions) => {
      const report = await execute(command, async () => await doctor.check());
      writeOutput(command, options, report, renderReport(report));
    });

  const collect = command
    .command("collect")
    .description("Collect bounded application diagnostics")
    .option("--last <duration>", "collect a recent duration such as 30m, 2h, or 1d")
    .option("--since <timestamp>", "collect events since an ISO timestamp")
    .option("--all", "collect all available diagnostics")
    .option("--trace-id <id>", "restrict collected events to a trace ID")
    .option("--output <path>", "output directory")
    .option("--json", "write structured JSON")
    .action(async () => {
      const options = collect.optsWithGlobals<CollectOptions>();
      const result = await execute(
        collect,
        async () =>
          await doctor.collect({
            ...(options.all === undefined ? {} : { all: options.all }),
            ...(options.last === undefined ? {} : { last: options.last }),
            ...(options.output === undefined ? {} : { output: options.output }),
            ...(options.since === undefined ? {} : { since: options.since }),
            ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
          }),
      );
      writeOutput(collect, options, result, renderCollection(result));
    });

  return command;
}

async function execute<Result>(
  command: Command,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DoctorError || isCodedError(error)) {
      command.error(`${error.code}: ${error.message}`, {
        code: "doctor.failed",
        exitCode: 1,
      });
    }
    throw error;
  }
}

function writeOutput(command: Command, options: OutputOptions, value: unknown, text: string): void {
  command
    .configureOutput()
    .writeOut?.(`${options.json === true ? JSON.stringify(value, null, 2) : text}\n`);
}

function renderReport(report: DoctorReport): string {
  return [
    `Doctor: ${report.ok ? "ready" : "blocked"}`,
    ...report.checks.map(
      (check) =>
        `${check.ok ? "[ok]" : "[failed]"} ${check.name}${check.message === undefined ? "" : ` - ${check.message}`}`,
    ),
  ].join("\n");
}

function renderCollection(result: DoctorCollectionResult): string {
  return [
    `Diagnostics: ${result.outputPath}`,
    `Files: ${String(result.files.length)}`,
    ...result.warnings.map((warning) => `Warning: ${warning}`),
  ].join("\n");
}

function isCodedError(error: unknown): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
