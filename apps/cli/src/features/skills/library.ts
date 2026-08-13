import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface SkillMetadata {
  readonly description: string;
  readonly hidden: boolean;
  readonly name: string;
}

export interface SkillFile {
  readonly content: string;
  readonly path: string;
}

export interface SkillSnapshot {
  readonly content: string;
  readonly directory: string;
  readonly files?: readonly SkillFile[];
  readonly metadata: SkillMetadata;
}

export interface SkillLibrary {
  readonly names: readonly string[];
  list(): Promise<readonly SkillMetadata[]>;
  read(input: { readonly full?: boolean; readonly name: string }): Promise<SkillSnapshot>;
  roots(): { readonly discoveryRoot: string; readonly skillDataRoot: string };
}

export type SkillErrorCode =
  | "SKILL_INVALID_CONFIGURATION"
  | "SKILL_INVALID_RESOURCE"
  | "SKILL_NOT_FOUND";

export class SkillError extends Error {
  public readonly code: SkillErrorCode;

  public constructor(code: SkillErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SkillError";
    this.code = code;
  }
}

export const APPLICATION_SKILL_NAMES = [
  "core",
  "sheet",
  "doc",
  "slide",
  "base",
  "board",
  "embed",
  "cross-unit-formula",
] as const;

const DISCOVERY_SKILL_NAME = "univer-cli";
const SUPPLEMENTAL_DIRECTORIES = ["references", "templates"] as const;

/** Read the application-owned, version-matched Skill assets. */
export function createApplicationSkillLibrary(assetsRoot: string): SkillLibrary {
  const discoveryRoot = join(assetsRoot, "discovery");
  const skillDataRoot = join(assetsRoot, "runtime");
  const names = [...APPLICATION_SKILL_NAMES];

  return {
    names,
    async list() {
      const snapshots = await Promise.all(
        names.map(async (name) => await readSnapshot(name, false, discoveryRoot, skillDataRoot)),
      );
      return snapshots.map((snapshot) => snapshot.metadata);
    },
    async read(input) {
      return await readSnapshot(
        validateRequestedName(input.name, names),
        input.full === true,
        discoveryRoot,
        skillDataRoot,
      );
    },
    roots() {
      return { discoveryRoot, skillDataRoot };
    },
  };
}

function validateRequestedName(name: string, runtimeNames: readonly string[]): string {
  const normalized = name.trim();
  if (normalized !== DISCOVERY_SKILL_NAME && !runtimeNames.includes(normalized)) {
    throw new SkillError("SKILL_NOT_FOUND", `Unknown Skill: ${name}.`);
  }
  return normalized;
}

async function readSnapshot(
  name: string,
  full: boolean,
  discoveryRoot: string,
  skillDataRoot: string,
): Promise<SkillSnapshot> {
  const directory = join(name === DISCOVERY_SKILL_NAME ? discoveryRoot : skillDataRoot, name);
  const skillPath = join(directory, "SKILL.md");
  let content: string;
  try {
    content = await readFile(skillPath, "utf8");
  } catch (error) {
    throw new SkillError(
      "SKILL_INVALID_RESOURCE",
      `Skill resource is missing or unreadable: ${skillPath}.`,
      error instanceof Error ? { cause: error } : undefined,
    );
  }
  const metadata = parseSkillMetadata(content, skillPath);
  if (metadata.name !== name) {
    throw new SkillError(
      "SKILL_INVALID_RESOURCE",
      `Skill metadata name mismatch in ${skillPath}: expected ${name}, received ${metadata.name}.`,
    );
  }
  return {
    content,
    directory,
    ...(full ? { files: await readSupplementalFiles(directory) } : {}),
    metadata,
  };
}

function parseSkillMetadata(content: string, path: string): SkillMetadata {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(content);
  if (match === null) invalidResource(`Invalid Skill frontmatter: ${path}.`);
  const fields = new Map<string, string>();
  for (const line of match[1]!.split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    fields.set(line.slice(0, separator).trim(), unquote(line.slice(separator + 1).trim()));
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (
    name === undefined ||
    name.length === 0 ||
    description === undefined ||
    description.length === 0
  ) {
    invalidResource(`Skill frontmatter requires non-empty name and description: ${path}.`);
  }
  return { description, hidden: fields.get("hidden") === "true", name };
}

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function readSupplementalFiles(directory: string): Promise<readonly SkillFile[]> {
  const files: SkillFile[] = [];
  for (const child of SUPPLEMENTAL_DIRECTORIES) {
    const childRoot = join(directory, child);
    let entries;
    try {
      entries = await readdir(childRoot, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error, "ENOENT")) continue;
      throw new SkillError(
        "SKILL_INVALID_RESOURCE",
        `Unable to read Skill supplemental directory: ${childRoot}.`,
        error instanceof Error ? { cause: error } : undefined,
      );
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const absolutePath = join(childRoot, entry.name);
      if (!(await stat(absolutePath)).isFile()) continue;
      files.push({ content: await readFile(absolutePath, "utf8"), path: `${child}/${entry.name}` });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function invalidResource(message: string): never {
  throw new SkillError("SKILL_INVALID_RESOURCE", message);
}
