import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const rootManifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const cliManifest = JSON.parse(
  await readFile(new URL("../apps/cli/package.json", import.meta.url), "utf8"),
);
const releaseWorkflow = await readFile(
  new URL("../.github/workflows/release-cli.yml", import.meta.url),
  "utf8",
);
const updateService = await readFile(
  new URL("../apps/cli/src/features/update/service.ts", import.meta.url),
  "utf8",
);

describe("release workflow contract", () => {
  it("keeps the source version as a sentinel and one release entry point", () => {
    expect(cliManifest).toMatchObject({ private: true, version: "0.0.0" });
    expect(rootManifest.scripts["release:cli"]).toBe("node scripts/release/release-cli.mjs");
    expect(rootManifest.scripts["release:pack"]).toBeUndefined();
    expect(rootManifest.scripts["release:pack-local"]).toBeUndefined();
  });

  it("defines one CI workflow for alpha and insiders", () => {
    expect(releaseWorkflow).toMatch(/^name: Release CLI to insider-npm$/mu);
    expect(releaseWorkflow).toMatch(/tags:\n\s+- "v0\.5\.\*-alpha\.\*"/u);
    expect(releaseWorkflow).toMatch(/workflow_dispatch:/u);
    expect(releaseWorkflow).toMatch(/CHANNEL="alpha"/u);
    expect(releaseWorkflow).toMatch(/CHANNEL="insiders"/u);
    expect(releaseWorkflow).toMatch(/GITHUB_REF_NAME.*BASE_BRANCH/u);
    expect(releaseWorkflow).toMatch(/^  prepare:$/mu);
    expect(releaseWorkflow).toMatch(/^  publish:$/mu);
    expect(releaseWorkflow).toMatch(/include-hidden-files: true/u);
    expect(releaseWorkflow).toMatch(/actions\/download-artifact@v4/u);
    expect(releaseWorkflow).toMatch(/node scripts\/release\/publish-cli\.mjs/u);
    expect(releaseWorkflow).not.toMatch(/CHANNEL="latest"|Promotion|registry\.npmjs\.org/u);
  });

  it("routes only the singular insider version suffix to the insiders update channel", () => {
    expect(updateService).toContain(String.raw`-insider\.`);
    expect(updateService).not.toContain(String.raw`-insiders\.`);
  });
});
