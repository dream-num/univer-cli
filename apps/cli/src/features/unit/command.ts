import { basename } from "node:path";
import { Command, Option } from "commander";
import type { LocalUnitApplication } from "./service.js";
import type { UnitKind, UnitListResult } from "./protocol.js";

interface JsonOptions {
  readonly json?: boolean;
}

interface UnitOptions extends JsonOptions {
  readonly name?: string;
  readonly type: UnitKind;
  readonly unit: string;
  readonly worktree?: string;
}

const UNIT_KINDS = ["sheet", "doc", "slide", "base", "board"] as const;

export function createUnitCommand(application: LocalUnitApplication): Command {
  const group = new Command("unit").description("Manage Units in a local Univerfile");
  const add = new Command("add")
    .description("Create a Unit in a writable Worktree")
    .argument("<file.univer>", "local .univer file path")
    .requiredOption("--worktree <id>", "writable Worktree ID")
    .addOption(new Option("--type <kind>", "Unit kind").choices(UNIT_KINDS).makeOptionMandatory())
    .option("--name <name>", "Unit name")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: UnitOptions) => {
      const result = await run(add, async () =>
        application.createUnit({
          kind: options.type,
          name: options.name ?? defaultUnitName(path),
          path,
          worktreeId: requireOption(options.worktree, "--worktree <id>"),
        }),
      );
      present(add, options, result, [
        `unit: ${result.unitId}`,
        `type: ${result.kind}`,
        `name: ${result.name}`,
        `worktree: ${result.worktreeId}`,
      ]);
    });
  const remove = new Command("remove")
    .description("Remove a Unit in a writable Worktree")
    .argument("<file.univer>", "local .univer file path")
    .requiredOption("--worktree <id>", "writable Worktree ID")
    .requiredOption("--unit <id>", "Unit ID")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: UnitOptions) => {
      const result = await run(remove, async () =>
        application.removeUnit({
          path,
          unitId: options.unit,
          worktreeId: requireOption(options.worktree, "--worktree <id>"),
        }),
      );
      present(remove, options, result, [
        `removed unit: ${result.unitId}`,
        `worktree: ${result.worktreeId}`,
      ]);
    });
  const list = new Command("list")
    .description("List Units in trunk or a Worktree")
    .argument("<file.univer>", "local .univer file path")
    .option("--worktree <id>", "read a Worktree; defaults to trunk")
    .option("--json", "write structured JSON")
    .action(async (path: string, options: JsonOptions & { readonly worktree?: string }) => {
      const result = await run(list, async () =>
        application.listUnits({
          path,
          ...(options.worktree === undefined ? {} : { worktreeId: options.worktree }),
        }),
      );
      present(list, options, result, renderUnitList(result));
    });
  return group.addCommand(add).addCommand(remove).addCommand(list);
}

async function run<Result>(command: Command, operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    command.error(error.message, { code: errorCode(error), exitCode: 1 });
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

function renderUnitList(result: UnitListResult): readonly string[] {
  if (result.units.length === 0) return ["(no units)"];
  return result.units.map((unit) => `${unit.unitId}  ${unit.kind}  ${unit.name}`);
}

function defaultUnitName(path: string): string {
  const name = basename(path).replace(/\.univer$/u, "");
  return name === "" ? "Untitled" : name;
}

function requireOption(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw Object.assign(new Error(`Missing ${label}`), { code: "COMMAND_INPUT_INVALID" });
  }
  return value;
}

function errorCode(error: Error): string {
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : "UNIT_COMMAND_FAILED";
}
