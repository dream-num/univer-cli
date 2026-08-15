import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DISCOVERY_SKILL_RELATIVE_PATH = "apps/cli/src/skills/discovery/univer-cli/SKILL.md";
export const DISTRIBUTED_SKILL_NAME = "univer-cli";
export const RUNTIME_SKILL_NAMES = [
  "core",
  "sheet",
  "doc",
  "slide",
  "base",
  "board",
  "embed",
  "cross-unit-formula",
];

export function validateDiscoverySkill(content) {
  const errors = [];
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(content);
  if (frontmatter === null) return ["Skill must start with YAML frontmatter."];

  const fields = new Map();
  for (const line of frontmatter[1].split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      errors.push(`Invalid frontmatter line: ${line}`);
      continue;
    }
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const unexpectedFields = [...fields.keys()].filter(
    (field) => field !== "name" && field !== "description",
  );
  if (unexpectedFields.length > 0) {
    errors.push(`Unexpected frontmatter fields: ${unexpectedFields.join(", ")}.`);
  }
  if (fields.get("name") !== DISTRIBUTED_SKILL_NAME) {
    errors.push(`Skill name must be ${DISTRIBUTED_SKILL_NAME}.`);
  }
  if ((fields.get("description") ?? "").replace(/^['"]|['"]$/gu, "").trim().length === 0) {
    errors.push("Skill description must not be empty.");
  }

  for (const command of [
    "npm install -g univer-cli",
    "univer doctor",
    "univer skills get core",
    "univer skills list",
    ...RUNTIME_SKILL_NAMES.map((name) => `univer skills get ${name}`),
  ]) {
    if (!content.includes(command)) errors.push(`Skill must include command: ${command}`);
  }

  return errors;
}

async function main() {
  const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const skillPath = resolve(workspaceRoot, DISCOVERY_SKILL_RELATIVE_PATH);
  const errors = validateDiscoverySkill(await readFile(skillPath, "utf8"));
  if (errors.length > 0) throw new Error(errors.join("\n"));
  process.stdout.write(`Validated ${DISCOVERY_SKILL_RELATIVE_PATH}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
