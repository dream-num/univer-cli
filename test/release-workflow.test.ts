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

describe("release workflow contract", () => {
  it("keeps the source version as a sentinel and one release entry point", () => {
    expect(rootManifest).toMatchObject({ license: "Apache-2.0" });
    expect(cliManifest).toMatchObject({ license: "Apache-2.0", private: true, version: "0.0.0" });
    expect(rootManifest.scripts["release:cli"]).toBe("node scripts/release/release-cli.mjs");
    expect(rootManifest.scripts["release:pack"]).toBeUndefined();
    expect(rootManifest.scripts["release:pack-local"]).toBeUndefined();
  });

  it("releases every channel through one manual dispatch workflow", () => {
    expect(releaseWorkflow).toMatch(/^name: Release CLI to insider-npm$/mu);
    expect(releaseWorkflow).toMatch(/workflow_dispatch:/u);
    expect(releaseWorkflow).not.toMatch(/push:/u);
    expect(releaseWorkflow).toMatch(/channelForVersion/u);
    expect(releaseWorkflow).toMatch(/^  prepare:$/mu);
    expect(releaseWorkflow).toMatch(/^  publish:$/mu);
    expect(releaseWorkflow).toMatch(/include-hidden-files: true/u);
    expect(releaseWorkflow).toMatch(/actions\/download-artifact@v4/u);
    expect(releaseWorkflow).toMatch(/node scripts\/release\/publish-cli\.mjs/u);
    expect(releaseWorkflow).not.toMatch(/Promotion|registry\.npmjs\.org/u);
  });
});

const publicPromotionWorkflow = await readFile(
  new URL("../.github/workflows/promote-cli-public.yml", import.meta.url),
  "utf8",
);

describe("public promotion workflow contract", () => {
  it("preserves the aligned manual parameters and uses the same inputs in validation and submit", () => {
    const schema = publicPromotionWorkflow.split("    inputs:\n")[1].split("\npermissions:")[0];
    expect([...schema.matchAll(/^      ([^:\n ]+):/gmu)].map((match) => match[1])).toEqual([
      "package",
      "latest",
      "version",
      "dry_run",
    ]);
    expect(schema).toMatch(/options:\s+- univer-cli/u);
    expect(schema).toMatch(/latest:[\s\S]*type: boolean\s+default: true/u);
    expect(schema).toMatch(/dry_run:[\s\S]*type: boolean\s+default: true/u);
    expect(publicPromotionWorkflow).toMatch(/inputs\.latest && 'latest' \|\| 'promoted'/u);
    expect(publicPromotionWorkflow).toMatch(/inputs\.dry_run && 'validate' \|\| 'submit'/u);
  });

  it("uses shared metadata and promotion actions without moving the Insider publisher", () => {
    expect(publicPromotionWorkflow).toMatch(/github.event_name == 'workflow_dispatch'/u);
    expect(publicPromotionWorkflow).toMatch(/github.event.repository.default_branch/u);
    expect(publicPromotionWorkflow).toMatch(/id-token: write/u);
    expect(publicPromotionWorkflow).toMatch(
      /assemble-npm-batch@([0-9a-f]{40})[\s\S]*promote-npm@\1/u,
    );
    expect(publicPromotionWorkflow).toMatch(/batch: \$\{\{ steps.resolve.outputs.batch \}\}/u);
    expect(publicPromotionWorkflow).not.toMatch(
      /push:|allowed_packages|reviewed_batch|node scripts/u,
    );
    expect(releaseWorkflow).not.toMatch(/registry\.npmjs\.org/u);
  });
});
