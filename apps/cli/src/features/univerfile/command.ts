import { Command } from "commander";
import type { LocalUniverfileApplication, OpenUniverfileResult } from "./service.js";
import type { UniverfileStatusResult } from "./protocol.js";

interface JsonOptions {
  readonly json?: boolean;
}

interface OpenOptions extends JsonOptions {
  readonly unit?: string;
  readonly viewerUrl?: string;
  readonly worktree?: string;
}

interface StatusOptions extends JsonOptions {
  readonly unit?: string;
  readonly worktree?: string;
}

export function createUniverfileCommands(
  application: LocalUniverfileApplication,
): readonly Command[] {
  const create = new Command("new")
    .description("Create an empty .univer file")
    .argument("<file.univer>", "local .univer file path")
    .option("--name <name>", "compatibility placeholder; empty containers have no Unit")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: JsonOptions) => {
      const result = await execute(create, async () => await application.create({ path }));
      writeOutput(create, options, result, `created ${result.filePath}`);
    });

  const open = new Command("open")
    .description("Print the Viewer URL for a local .univer file")
    .argument("<file.univer>", "local .univer file path")
    .option("--worktree <id>", "open a Worktree")
    .option("--unit <id>", "select one Unit")
    .option("--viewer-url <url>", "viewer base URL override")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: OpenOptions) => {
      const result = await execute(
        open,
        async () =>
          await application.open({
            path,
            ...(options.unit === undefined ? {} : { unitId: options.unit }),
            ...(options.viewerUrl === undefined ? {} : { viewerUrl: options.viewerUrl }),
            ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
          }),
      );
      writeUpgradeNotice(open, options, result);
      writeOutput(open, options, openJson(result), renderOpen(result));
    });

  const status = new Command("status")
    .description("Show Unit and Worktree status for a local .univer file")
    .argument("<file.univer>", "local .univer file path")
    .option("--unit <id>", "filter to one Unit")
    .option("--worktree <id>", "inspect one Worktree")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: StatusOptions) => {
      const result = await execute(
        status,
        async () =>
          await application.status({
            path,
            ...(options.unit === undefined ? {} : { unitId: options.unit }),
            ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
          }),
      );
      writeUpgradeNotice(status, options, result);
      writeOutput(status, options, statusJson(result), renderStatus(result));
    });

  return [create, open, status];
}

async function execute<Result>(
  command: Command,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      command.error(error.message, {
        code: errorCode(error),
        exitCode: 1,
      });
    }
    throw error;
  }
}

function writeOutput(command: Command, options: JsonOptions, value: unknown, text: string): void {
  command
    .configureOutput()
    .writeOut?.(`${options.json === true ? JSON.stringify(value, null, 2) : text}\n`);
}

function writeUpgradeNotice(
  command: Command,
  options: JsonOptions,
  result: Pick<OpenUniverfileResult, "upgrade">,
): void {
  if (options.json === true || result.upgrade.status !== "upgraded") return;
  command
    .configureOutput()
    .writeErr?.(
      `Upgraded ${result.upgrade.sourceFormat} -> v2; backup: ${result.upgrade.backupPath}\n`,
    );
}

function openJson(result: OpenUniverfileResult): unknown {
  return {
    openUrl: result.openUrl,
    target: { type: "local-univerfile", path: result.filePath },
    ...(result.worktreeId === undefined
      ? {}
      : { scope: { kind: "worktree", worktreeId: result.worktreeId } }),
    ...(result.unitId === undefined ? {} : { unitId: result.unitId }),
    upgrade: result.upgrade,
  };
}

function errorCode(error: Error): string {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : "UNIVERFILE_FAILED";
}

function statusJson(result: UniverfileStatusResult): unknown {
  return {
    filePath: result.filePath,
    scope: result.scope,
    units: result.units,
    ...(result.worktree === undefined ? {} : { worktree: result.worktree }),
    upgrade: result.upgrade,
  };
}

function renderOpen(result: OpenUniverfileResult): string {
  return [
    "Open URL:",
    `  ${result.openUrl}`,
    "",
    `Target: ${result.filePath}`,
    ...(result.worktreeId === undefined ? [] : [`Worktree: ${result.worktreeId}`]),
    ...(result.unitId === undefined ? [] : [`Unit: ${result.unitId}`]),
    "",
    "Open this URL in a browser.",
  ].join("\n");
}

function renderStatus(result: UniverfileStatusResult): string {
  const lines = [`univerfile: ${result.filePath}`, `scope: ${result.scope}`];
  if (result.worktree !== undefined) {
    lines.push(
      `worktree: ${result.worktree.worktreeId}`,
      `worktree status: ${result.worktree.status}`,
      `worktree name: ${result.worktree.name}`,
    );
  }
  lines.push(`units: ${String(result.units.length)}`);
  for (const unit of result.units) {
    lines.push(
      "",
      `unitId: ${unit.unitId}`,
      `type: ${String(unit.type)}`,
      `name: ${unit.name}`,
      `headRev: ${String(unit.headRev)}`,
    );
  }
  return lines.join("\n");
}
