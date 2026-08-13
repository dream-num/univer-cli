import { Command } from "commander";
import type { LocalOptimizeApplication } from "./service.js";

interface OptimizeOptions {
  readonly dryRun?: boolean;
  readonly history?: boolean;
  readonly images?: boolean;
  readonly json?: boolean;
  readonly out?: string;
  readonly worktrees?: boolean;
}

export function createOptimizeCommand(application: LocalOptimizeApplication): Command {
  const command = new Command("optimize")
    .description("Write a copy-only optimized .univer file")
    .argument("<file.univer>", "source local .univer file")
    .option("--out <file.univer>", "optimized copy path")
    .option("--images", "externalize embedded images")
    .option("--worktrees", "remove merged and discarded Worktrees")
    .option("--history", "materialize heads and reset Collaboration history")
    .option("--dry-run", "analyze without writing the optimized copy")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: OptimizeOptions) => {
      if (options.dryRun !== true && options.out === undefined) {
        fail(
          command,
          codedError(
            "OPTIMIZE_OUTPUT_REQUIRED",
            "--out <file.univer> is required without --dry-run",
          ),
        );
      }
      const result = await execute(command, async () =>
        application.optimize({
          dryRun: options.dryRun === true,
          path,
          ...(options.out === undefined ? {} : { outputPath: options.out }),
          ...(options.images === true ? { images: "externalize" as const } : {}),
          ...(options.worktrees === true ? { worktrees: "clean" as const } : {}),
          ...(options.history === true ? { history: "reset" as const } : {}),
        }),
      );
      const text = [
        `source: ${result.sourcePath}`,
        ...(result.outputPath === undefined ? [] : [`output: ${result.outputPath}`]),
        `size: ${String(result.beforeBytes)} -> ${String(result.afterBytes ?? result.beforeBytes)} bytes`,
        `images: ${String(result.images.uniqueBlobs)} blobs`,
        `worktrees removed: ${String(result.worktrees.removedWorktrees)}`,
        `changesets removed: ${String(result.history.removedChangesets)}`,
      ];
      command
        .configureOutput()
        .writeOut?.(
          `${options.json === true ? JSON.stringify(result, null, 2) : text.join("\n")}\n`,
        );
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
    fail(command, error);
  }
}

function fail(command: Command, error: unknown): never {
  if (!(error instanceof Error)) throw error;
  const code = (error as Error & { readonly code?: unknown }).code;
  command.error(error.message, {
    code: typeof code === "string" && code.length > 0 ? code : "OPTIMIZE_FAILED",
    exitCode: 1,
  });
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
