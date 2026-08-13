import { Command } from "commander";
import type { LocalWorktreeApplication } from "./service.js";
import type { WorktreeListResult, WorktreeStateResult } from "./protocol.js";

interface JsonOptions {
  readonly json?: boolean;
}

interface WorktreeOptions extends JsonOptions {
  readonly worktree: string;
}

export function createWorktreeCommand(application: LocalWorktreeApplication): Command {
  const group = new Command("worktree").description("Manage local Univerfile Worktrees");
  const add = new Command("add")
    .description("Create a Worktree from the current trunk")
    .argument("<file.univer>", "local .univer file path")
    .option("--name <name>", "Worktree label")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: JsonOptions & { readonly name?: string }) => {
      const result = await run(add, async () =>
        application.createWorktree({
          path,
          ...(options.name === undefined ? {} : { name: options.name }),
        }),
      );
      present(add, options, result, [
        `worktree: ${result.worktreeId}`,
        `status: ${result.status}`,
        `file: ${result.filePath}`,
      ]);
    });
  const list = new Command("list")
    .description("List Worktrees")
    .argument("<file.univer>", "local .univer file path")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: JsonOptions) => {
      const result = await run(list, async () => application.listWorktrees({ path }));
      present(list, options, result, renderWorktreeList(result));
    });

  group.addCommand(add).addCommand(list);
  for (const [name, description, operation] of [
    ["ready", "Mark a Worktree ready for review", application.readyWorktree],
    ["reopen", "Reopen a ready Worktree for editing", application.reopenWorktree],
    ["discard", "Discard a Worktree", application.discardWorktree],
  ] as const) {
    const command = new Command(name)
      .description(description)
      .argument("<file.univer>", "local .univer file path")
      .requiredOption("--worktree <id>", "Worktree ID")
      .option("--json", "write structured JSON")
      .action(async (path: string, options: WorktreeOptions) => {
        const result = await run(command, async () =>
          operation.call(application, { path, worktreeId: options.worktree }),
        );
        present(command, options, result, renderWorktreeState(result));
      });
    group.addCommand(command);
  }

  const merge = new Command("merge")
    .description("Merge a Worktree into trunk")
    .argument("<file.univer>", "local .univer file path")
    .requiredOption("--worktree <id>", "Worktree ID")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: WorktreeOptions) => {
      const result = await run(merge, async () =>
        application.mergeWorktree({ path, worktreeId: options.worktree }),
      );
      present(merge, options, result, [
        `worktree: ${result.worktreeId}`,
        "status: merged",
        `file: ${result.filePath}`,
        `revisions: ${JSON.stringify(result.revisions)}`,
      ]);
    });
  return group.addCommand(merge);
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

function renderWorktreeList(result: WorktreeListResult): readonly string[] {
  if (result.worktrees.length === 0) return ["(no worktrees)"];
  return result.worktrees.map(
    (worktree) =>
      `${worktree.worktreeId}  ${worktree.status}  ${worktree.name}  ${worktree.agentId}  ${worktree.createdAt}`,
  );
}

function renderWorktreeState(result: WorktreeStateResult): readonly string[] {
  return [`worktree: ${result.worktreeId}`, `status: ${result.status}`, `file: ${result.filePath}`];
}

function errorCode(error: Error): string {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : "WORKTREE_COMMAND_FAILED";
}
