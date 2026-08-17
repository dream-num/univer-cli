import { describe, expect, it } from "vitest";
import { validateSdkDependencyGraph } from "../scripts/release/sdk-graph.mjs";

describe("release SDK graph", () => {
  const cohort = "1.0.0-insiders.20260813-7c9aa50";

  it("accepts one exact SDK cohort and exact independent chains", () => {
    expect(
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: {
            dependencies: {
              "@univer-cli/headless-univer": cohort,
              "@univerjs-pro/engine-formula-rust-binding": "1.0.0-insiders.20260811-001a0e5",
              "@univerjs/core": cohort,
            },
          },
        },
        {
          manifestPath: "packages/runtime/package.json",
          manifest: { dependencies: { "@univerjs-pro/embed": cohort } },
        },
      ]),
    ).toMatchObject({ dependencyCount: 4, sdkVersion: cohort });
  });

  it("rejects ranges, split cohorts, and inconsistent package versions", () => {
    expect(() =>
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: { dependencies: { "@univerjs/core": `^${cohort}` } },
        },
      ]),
    ).toThrow(/exact SemVer/u);
    expect(() =>
      validateSdkDependencyGraph([
        {
          manifestPath: "apps/cli/package.json",
          manifest: {
            dependencies: {
              "@univer-cli/headless-univer": cohort,
              "@univerjs/core": "1.0.0-insiders.other",
            },
          },
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
            dependencies: { "@univerjs/icons": "1.35.0", "@univerjs/core": cohort },
          },
        },
      ]),
    ).toThrow(/resolves to both/u);
  });
});
