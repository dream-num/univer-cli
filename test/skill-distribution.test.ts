import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_SKILL_RELATIVE_PATH,
  RUNTIME_SKILL_NAMES,
  validateDiscoverySkill,
} from "../scripts/release/validate-skill-distribution.mjs";
import { APPLICATION_SKILL_NAMES } from "../apps/cli/src/features/skills/library.js";

describe("Skill distribution", () => {
  it("keeps the distributable discovery Skill valid and aligned with runtime routing", async () => {
    const content = await readFile(join(process.cwd(), DISCOVERY_SKILL_RELATIVE_PATH), "utf8");

    expect(validateDiscoverySkill(content)).toEqual([]);
    expect(RUNTIME_SKILL_NAMES).toEqual(APPLICATION_SKILL_NAMES);
  });

  it("syncs only the source-owned discovery Skill after a stable latest release", async () => {
    const workflow = await readFile(
      join(process.cwd(), ".github", "workflows", "sync-skills-release.yml"),
      "utf8",
    );

    expect(workflow).toContain("^v(0|[1-9][0-9]*)");
    expect(workflow).toContain('releases/latest"');
    expect(workflow).toContain(
      'source_skill_dir="$GITHUB_WORKSPACE/apps/cli/src/skills/discovery/univer-cli"',
    );
    expect(workflow).toContain('target_skill_dir="$target_dir/skills/univer-cli"');
    expect(workflow).not.toContain("src/skills/runtime");
  });
});
