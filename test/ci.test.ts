import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CI quality gate", () => {
  it("runs the repository checks for pull requests and main", async () => {
    const workflow = await readFile(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("      - main");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm format:check");
    expect(workflow).toContain("pnpm lint");
    expect(workflow).toContain("pnpm typecheck");
    expect(workflow).toContain("pnpm check:locales");
    expect(workflow).toContain("pnpm test");
    expect(workflow).toContain("pnpm --filter univer-cli pack:check");
  });

  it("keeps locale freshness in the local aggregate check", async () => {
    const manifest = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(manifest.scripts?.check).toContain("pnpm check:locales");
    expect(manifest.scripts?.["check:locales"]).toContain(
      "pnpm --filter @univer/render-preset check:locales",
    );
    expect(manifest.scripts?.["check:locales"]).toContain(
      "pnpm --filter @univer/collab-web check:locales",
    );
  });
});
