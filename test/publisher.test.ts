import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RELEASE_PACKAGE_NAME, RELEASE_REGISTRY } from "../scripts/release/policy.mjs";
import { publishPreparedRelease } from "../scripts/release/publisher.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })),
  );
});

describe("release publisher", () => {
  it("rejects a tarball changed after review before contacting the registry", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-cli-publisher-"));
    roots.push(root);
    const tarball = "univer-cli-0.5.0-dev.test.tgz";
    const manifestPath = join(root, "release-manifest.json");
    await writeFile(join(root, tarball), "changed tarball", "utf8");
    await writeFile(
      manifestPath,
      JSON.stringify({
        channel: "dev",
        dependencies: { conditional: [], required: [] },
        integrity: `sha512-${createHash("sha512").update("reviewed tarball").digest("base64")}`,
        npmTag: "dev",
        package: RELEASE_PACKAGE_NAME,
        packageMetrics: { entryCount: 1, packedSize: 1, unpackedSize: 1 },
        registry: RELEASE_REGISTRY,
        schemaVersion: 1,
        sourceDirty: true,
        sourceSha: "a".repeat(40),
        tarball,
        version: "0.5.0-dev.test",
      }),
      "utf8",
    );

    await expect(publishPreparedRelease(manifestPath, {})).rejects.toThrow(
      /integrity differs from the reviewed release manifest/u,
    );
  });

  it("rejects a reviewed CI artifact from a different workflow source", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-cli-publisher-"));
    roots.push(root);
    const tarball = "univer-cli-0.5.0-insiders.test.tgz";
    const manifestPath = join(root, "release-manifest.json");
    const tarballContents = "reviewed tarball";
    await writeFile(join(root, tarball), tarballContents, "utf8");
    await writeFile(
      manifestPath,
      JSON.stringify({
        channel: "insiders",
        dependencies: { conditional: [], required: [] },
        integrity: `sha512-${createHash("sha512").update(tarballContents).digest("base64")}`,
        npmTag: "insiders",
        package: RELEASE_PACKAGE_NAME,
        packageMetrics: { entryCount: 1, packedSize: 1, unpackedSize: 1 },
        registry: RELEASE_REGISTRY,
        schemaVersion: 1,
        sdkVersion: "1.0.0-insiders.sdk",
        sourceDirty: false,
        sourceSha: "a".repeat(40),
        tarball,
        version: "0.5.0-insiders.test",
      }),
      "utf8",
    );

    await expect(
      publishPreparedRelease(manifestPath, {
        BASE_BRANCH: "main",
        CI: "true",
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_REF_NAME: "main",
        GITHUB_REF_TYPE: "branch",
        GITHUB_SHA: "b".repeat(40),
      }),
    ).rejects.toThrow(/does not match workflow source/u);
  });
});
