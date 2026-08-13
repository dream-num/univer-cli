import { Command } from "commander";
import {
  SkillError,
  type SkillLibrary,
  type SkillMetadata,
  type SkillSnapshot,
} from "./library.js";

interface OutputOptions {
  readonly json?: boolean;
}

interface GetOptions extends OutputOptions {
  readonly all?: boolean;
  readonly full?: boolean;
}

export function createSkillsCommand(library: SkillLibrary): Command {
  const command = new Command("skills")
    .description("Inspect installed operational Skills")
    .option("--json", "write structured JSON")
    .action(async () => {
      await listSkills(command, library, command.opts<OutputOptions>());
    });

  const list = command
    .command("list")
    .description("List installed operational Skills")
    .option("--json", "write structured JSON")
    .action(async () => {
      await listSkills(list, library, list.optsWithGlobals<OutputOptions>());
    });

  const get = command
    .command("get")
    .description("Read one or all installed operational Skills")
    .argument("[name]", "Skill name")
    .option("--all", "read every runtime Skill")
    .option("--full", "include references and templates")
    .option("--json", "write structured JSON")
    .action(async (name: string | undefined) => {
      const options = get.optsWithGlobals<GetOptions>();
      if (options.all === true && name !== undefined) {
        fail(
          get,
          codedError("SKILL_INVALID_SELECTION", "skills get accepts either <name> or --all."),
        );
      }
      if (options.all !== true && name === undefined) {
        fail(get, codedError("SKILL_INVALID_SELECTION", "skills get requires <name> or --all."));
      }
      const names = options.all === true ? library.names : [name!];
      const skills = await execute(
        get,
        async () =>
          await Promise.all(
            names.map(
              async (selected) =>
                await library.read({ full: options.full === true, name: selected }),
            ),
          ),
      );
      writeOutput(get, options, { skills: skills.map(skillOutput) }, renderSnapshots(skills));
    });

  const path = command
    .command("path")
    .description("Show installed Skill resource paths")
    .argument("[name]", "Skill name")
    .option("--json", "write structured JSON")
    .action(async (name: string | undefined) => {
      const options = path.optsWithGlobals<OutputOptions>();
      if (name === undefined) {
        const roots = library.roots();
        const paths = [roots.discoveryRoot, roots.skillDataRoot];
        writeOutput(path, options, { paths }, paths.join("\n"));
        return;
      }
      const snapshot = await execute(path, async () => await library.read({ name }));
      writeOutput(
        path,
        options,
        { name: snapshot.metadata.name, path: snapshot.directory },
        snapshot.directory,
      );
    });

  return command;
}

async function listSkills(
  command: Command,
  library: SkillLibrary,
  options: OutputOptions,
): Promise<void> {
  const skills = await execute(command, async () => await library.list());
  writeOutput(command, options, { skills }, renderList(skills));
}

async function execute<Result>(
  command: Command,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SkillError || isCodedError(error)) fail(command, error);
    throw error;
  }
}

function fail(command: Command, error: Error & { readonly code: string }): never {
  command.error(`${error.code}: ${error.message}`, { code: "skills.failed", exitCode: 1 });
}

function writeOutput(command: Command, options: OutputOptions, value: unknown, text: string): void {
  command
    .configureOutput()
    .writeOut?.(`${options.json === true ? JSON.stringify(value, null, 2) : text}\n`);
}

function renderList(skills: readonly SkillMetadata[]): string {
  return skills.map((skill) => `${skill.name}\t${skill.description}`).join("\n");
}

function renderSnapshots(skills: readonly SkillSnapshot[]): string {
  return skills.map(renderSnapshot).join("\n\n---\n\n");
}

function renderSnapshot(skill: SkillSnapshot): string {
  if (skill.files === undefined || skill.files.length === 0) return skill.content.trimEnd();
  return [
    skill.content.trimEnd(),
    ...skill.files.map((file) => `\n--- ${file.path} ---\n\n${file.content.trimEnd()}`),
  ].join("\n");
}

function skillOutput(skill: SkillSnapshot): object {
  return {
    content: skill.content,
    ...(skill.files === undefined ? {} : { files: skill.files }),
    name: skill.metadata.name,
  };
}

function codedError(code: string, message: string): Error & { readonly code: string } {
  return Object.assign(new Error(message), { code });
}

function isCodedError(error: unknown): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
