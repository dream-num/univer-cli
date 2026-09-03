import { describe, expect, it } from "vitest";
import { validateSdkDependencyGraph } from "../scripts/release/sdk-graph.mjs";

describe("release SDK graph", () => {
  const univer = "1.0.0-insiders.20260831-796c4f4";
  const cli = "1.0.0-insiders.20260830-cli";
  const collaborationServer = "1.0.0-insiders.20260829-collaboration";

  it("accepts independently versioned SDK cohorts and independent packages", () => {
    expect(
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: {
            dependencies: {
              "@univer-cli/headless-univer": cli,
              "@univerjs-pro/collaboration-service": collaborationServer,
              "@univerjs-pro/engine-formula-rust-binding": "1.0.0-insiders.20260819-8209aa8",
              "@univerjs/core": univer,
            },
          },
        },
        {
          manifestPath: "packages/runtime/package.json",
          manifest: { dependencies: { "@univerjs-pro/embed": univer } },
        },
      ]),
    ).toMatchObject({
      dependencyCount: 5,
      sdkVersion: univer,
      cohorts: { "collaboration-server": collaborationServer, cli, univer },
    });
  });

  it("rejects ranges and splits inside one cohort", () => {
    expect(() =>
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: { dependencies: { "@univerjs/core": `^${univer}` } },
        },
      ]),
    ).toThrow(/exact SemVer/u);
    expect(() =>
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: {
            dependencies: {
              "@univerjs/core": univer,
              "@univerjs/docs": "1.0.0-insiders.other",
            },
          },
        },
      ]),
    ).toThrow(/cohort mismatch/u);
    expect(
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: {
            dependencies: {
              "@univer-cli/headless-univer": cli,
              "@univerjs/core": univer,
            },
          },
        },
      ]),
    ).toMatchObject({ cohorts: { cli, univer } });
    expect(() =>
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: {
            dependencies: {
              "@univer-cli/headless-univer": cli,
              "@univer-cli/config": "1.0.0-insiders.other",
            },
          },
        },
        {
          manifestPath: "packages/runtime/package.json",
          manifest: { dependencies: { "@univerjs/core": univer } },
        },
      ]),
    ).toThrow(/cohort mismatch/u);
    expect(() =>
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: { dependencies: { "@univerjs/icons": "1.34.0" } },
        },
        {
          manifestPath: "packages/view/package.json",
          manifest: {
            dependencies: { "@univerjs/icons": "1.35.0", "@univerjs/core": univer },
          },
        },
      ]),
    ).toThrow(/resolves to both/u);
  });
});
