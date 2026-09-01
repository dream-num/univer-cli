import { describe, expect, it } from "vitest";
import {
  assertReleaseContext,
  parseReleaseArguments,
  RELEASE_PACKAGE_NAME,
  RELEASE_REGISTRY,
  validateReleaseManifest,
} from "../scripts/release/policy.mjs";

describe("release policy", () => {
  it("parses one explicit release mode", () => {
    expect(
      parseReleaseArguments([
        "--channel=insiders",
        "--version",
        "0.5.0-insiders.test",
        "--prepare-only",
      ]),
    ).toEqual({ channel: "insiders", mode: "prepare-only", version: "0.5.0-insiders.test" });
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

  it("gates every published channel to a manual dispatch from the base branch", () => {
    const env = {
      BASE_BRANCH: "main",
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF_NAME: "main",
      GITHUB_REF_TYPE: "branch",
    };
    for (const channel of ["alpha", "insiders", "stable"] as const) {
      expect(() => assertReleaseContext(channel, fixtureVersion(channel), env)).not.toThrow();
    }
    for (const overrides of [
      { GITHUB_REF_NAME: "feature/release" },
      { GITHUB_EVENT_NAME: "push", GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v0.5.0" },
      { GITHUB_ACTIONS: "false" },
      { CI: "false" },
    ]) {
      expect(() => assertReleaseContext("stable", "0.5.0", { ...env, ...overrides })).toThrow();
    }
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
      tarball: "univer-cli-0.5.0-insiders.test.tgz",
      version: "0.5.0-insiders.test",
    };
    expect(validateReleaseManifest(manifest)).toBe(manifest);
    expect(() =>
      validateReleaseManifest({ ...manifest, registry: "https://registry.npmjs.org/" }),
    ).toThrow(/registry/u);
    expect(() => validateReleaseManifest({ ...manifest, tarball: "../release.tgz" })).toThrow(
      /basename/u,
    );
    expect(() =>
      validateReleaseManifest({
        ...manifest,
        channel: "stable",
        npmTag: "insiders",
        tarball: "univer-cli-0.5.0.tgz",
        version: "0.5.0",
      }),
    ).toThrow(/npmTag/u);
    expect(
      validateReleaseManifest({
        ...manifest,
        channel: "stable",
        npmTag: "latest",
        tarball: "univer-cli-0.5.0.tgz",
        version: "0.5.0",
      }),
    ).toMatchObject({ npmTag: "latest" });
  });
});

function fixtureVersion(channel: "alpha" | "insiders" | "stable"): string {
  if (channel === "alpha") return "0.5.0-alpha.1";
  if (channel === "insiders") return "0.5.0-insiders.test";
  return "0.5.0";
}
