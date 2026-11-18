import { readdir, readFile } from "node:fs/promises";
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

  it("packages only the runtime Skills", async () => {
    const skillsRoot = join(process.cwd(), "apps/cli/dist/skills");
    expect(await readdir(skillsRoot)).toEqual(["runtime"]);
    expect((await readdir(join(skillsRoot, "runtime"))).sort()).toEqual(
      [...APPLICATION_SKILL_NAMES].sort(),
    );
  });
});
