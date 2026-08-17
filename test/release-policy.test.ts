import { describe, expect, it } from "vitest";
import {
  assertReleaseContext,
  npmTagForRelease,
  parseReleaseArguments,
  RELEASE_PACKAGE_NAME,
  RELEASE_REGISTRY,
  validateReleaseManifest,
} from "../scripts/release/policy.mjs";

describe("release policy", () => {
  it("admits exactly 0.5.x alpha, insiders, and dev version contracts", () => {
    expect(npmTagForRelease("alpha", "0.5.0-alpha.1")).toBe("alpha");
    expect(npmTagForRelease("insiders", "0.5.0-insider.20260817-a1b2c3d")).toBe("insiders");
    expect(npmTagForRelease("dev", "0.5.0-dev.feature-a1b2c3d")).toBe("dev");
    expect(() => npmTagForRelease("alpha", "0.5.0")).toThrow(/-alpha/u);
    expect(() => npmTagForRelease("alpha", "0.5.0-beta.1")).toThrow(/-alpha/u);
    expect(() => npmTagForRelease("insiders", "0.5.0-insiders.1")).toThrow(/-insider/u);
    expect(() => npmTagForRelease("dev", "0.5.0")).toThrow(/-dev/u);
    expect(() => npmTagForRelease("latest", "0.5.0")).toThrow(/Unsupported/u);
    expect(() => npmTagForRelease("insiders", "0.4.9-insider.1")).toThrow(/0\.5\.x/u);
  });

  it("parses one explicit release mode", () => {
    expect(
      parseReleaseArguments([
        "--channel=insiders",
        "--version",
        "0.5.0-insider.test",
        "--prepare-only",
      ]),
    ).toEqual({ channel: "insiders", mode: "prepare-only", version: "0.5.0-insider.test" });
    expect(() => parseReleaseArguments(["--channel=dev", "--version=0.5.0-dev.test"])).toThrow(
      /exactly one/u,
    );
    expect(() =>
      parseReleaseArguments([
        "--channel=dev",
        "--version=0.5.0-dev.test",
        "--dry-run",
        "--publish",
      ]),
    ).toThrow(/exactly one/u);
  });

  it("gates alpha to a matching tag push from GitHub Actions", () => {
    const env = {
      BASE_BRANCH: "main",
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_NAME: "v0.5.0-alpha.1",
      GITHUB_REF_TYPE: "tag",
    };
    expect(() => assertReleaseContext("alpha", "0.5.0-alpha.1", env)).not.toThrow();
    expect(() => assertReleaseContext("alpha", "0.5.0-alpha.2", env)).toThrow(
      /tag v0\.5\.0-alpha\.2/u,
    );
    expect(() =>
      assertReleaseContext("alpha", "0.5.0-alpha.1", { ...env, GITHUB_ACTIONS: "false" }),
    ).toThrow(/only in GitHub Actions/u);
  });

  it("gates insiders to a manual dispatch from the base branch", () => {
    const env = {
      BASE_BRANCH: "main",
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF_NAME: "main",
      GITHUB_REF_TYPE: "branch",
    };
    expect(() => assertReleaseContext("insiders", "0.5.0-insider.test", env)).not.toThrow();
    expect(() =>
      assertReleaseContext("insiders", "0.5.0-insider.test", {
        ...env,
        GITHUB_REF_NAME: "feature/release",
      }),
    ).toThrow(/manually dispatched from main/u);
  });

  it("allows dev only outside CI", () => {
    expect(() => assertReleaseContext("dev", "0.5.0-dev.local", {})).not.toThrow();
    expect(() => assertReleaseContext("dev", "0.5.0-dev.local", { CI: "true" })).toThrow(
      /local-only/u,
    );
  });

  it("validates the reviewed release manifest", () => {
    const manifest = {
      channel: "insiders",
      dependencies: { conditional: [], required: ["libsql"] },
      integrity: "sha512-dGVzdA==",
      npmTag: "insiders",
      package: RELEASE_PACKAGE_NAME,
      packageMetrics: { entryCount: 2, packedSize: 10, unpackedSize: 20 },
      registry: RELEASE_REGISTRY,
      schemaVersion: 1,
      sdkVersion: "1.0.0-insiders.sdk",
      sourceDirty: false,
      sourceSha: "a".repeat(40),
      tarball: "univer-cli-0.5.0-insider.test.tgz",
      version: "0.5.0-insider.test",
    };
    expect(validateReleaseManifest(manifest)).toBe(manifest);
    expect(() =>
      validateReleaseManifest({ ...manifest, registry: "https://registry.npmjs.org/" }),
    ).toThrow(/registry/u);
    expect(() => validateReleaseManifest({ ...manifest, tarball: "../release.tgz" })).toThrow(
      /basename/u,
    );
  });
});
