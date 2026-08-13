import { CommanderError, type OutputConfiguration } from "commander";
import { createProgram, type UniverLocalProgramOptions } from "./program.js";

export interface CliStreams {
  readonly writeErr: (text: string) => void;
  readonly writeOut: (text: string) => void;
}

export interface RunCliOptions {
  readonly program?: Omit<UniverLocalProgramOptions, "output">;
  readonly streams?: CliStreams;
}

/** Run one CLI invocation while preserving the single-document machine-output contract. */
export async function runCli(
  argv: readonly string[],
  options: RunCliOptions = {},
): Promise<number> {
  const streams = options.streams ?? {
    writeErr: (text: string): void => {
      process.stderr.write(text);
    },
    writeOut: (text: string): void => {
      process.stdout.write(text);
    },
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const output: OutputConfiguration = {
    writeErr: (text: string): boolean => push(stderr, text),
    writeOut: (text: string): boolean => push(stdout, text),
  };
  const program = createProgram({ ...options.program, output });
  enableExitOverride(program);

  try {
    if (argv.length === 0) {
      program.outputHelp();
    } else {
      await program.parseAsync([...argv], { from: "user" });
    }
    flush(stdout, streams.writeOut);
    flush(stderr, streams.writeErr);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      flush(stdout, streams.writeOut);
      flush(stderr, streams.writeErr);
      return 0;
    }

    if (hasRecognizedJsonOption(argv, program)) {
      streams.writeErr(`${JSON.stringify(machineFailure(error))}\n`);
    } else {
      flush(stdout, streams.writeOut);
      flush(stderr, streams.writeErr);
      if (stderr.length === 0) streams.writeErr(`${errorMessage(error)}\n`);
    }
    return errorExitCode(error);
  }
}

function push(target: string[], text: string): boolean {
  target.push(text);
  return true;
}

function hasRecognizedJsonOption(
  argv: readonly string[],
  program: ReturnType<typeof createProgram>,
): boolean {
  let command = program;
  for (const argument of argv) {
    if (argument === "--json") {
      return command.options.some((option) => option.long === "--json");
    }
    if (argument.startsWith("-")) continue;
    const child = command.commands.find((candidate) => candidate.name() === argument);
    if (child !== undefined) command = child;
  }
  return false;
}

function enableExitOverride(command: ReturnType<typeof createProgram>): void {
  command.exitOverride();
  for (const child of command.commands) enableExitOverride(child);
}

function flush(chunks: readonly string[], write: (text: string) => void): void {
  for (const chunk of chunks) write(chunk);
}

function machineFailure(error: unknown): {
  readonly error: {
    readonly code: string;
    readonly details?: unknown;
    readonly message: string;
  };
  readonly ok: false;
} {
  const details = errorDetails(error);
  return {
    ok: false,
    error: {
      code: errorCode(error),
      message: errorMessage(error),
      ...(details === undefined ? {} : { details }),
    },
  };
}

function errorCode(error: unknown): string {
  if (isRecord(error) && typeof error["code"] === "string" && error["code"].length > 0) {
    return error["code"];
  }
  return "UNIVER_CLI_FAILED";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Univer CLI failed";
}

function errorDetails(error: unknown): unknown {
  if (!isRecord(error) || error["details"] === undefined) return undefined;
  try {
    JSON.stringify(error["details"]);
    return error["details"];
  } catch {
    return undefined;
  }
}

function errorExitCode(error: unknown): number {
  if (error instanceof CommanderError && Number.isInteger(error.exitCode) && error.exitCode > 0) {
    return error.exitCode;
  }
  return 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
