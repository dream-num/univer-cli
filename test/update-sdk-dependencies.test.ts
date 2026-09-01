import { describe, expect, it } from "vitest";
import {
  alignManifestSdkDependencies,
  discoverWorkspacePackages,
  parseSdkUpdateVersion,
  resolveWorkspaceSdkBaseline,
  validateWorkspaceSdkDependencies,
} from "../scripts/update-sdk-dependencies.mjs";

describe("update:sdk dependency alignment", () => {
  it("requires one exact SDK version", () => {
    expect(parseSdkUpdateVersion(["--sdk_version", "1.0.0-insiders.20260822-0c0c0dd"])).toBe(
      "1.0.0-insiders.20260822-0c0c0dd",
    );
    expect(parseSdkUpdateVersion(["--sdk_version=1.0.0-beta.2"])).toBe("1.0.0-beta.2");
    expect(() => parseSdkUpdateVersion([])).toThrow(/--sdk_version/u);
    expect(() => parseSdkUpdateVersion(["^1.0.0"])).toThrow(/--sdk_version/u);
  });

  it("aligns Univer dependencies and preserves separately published SDK cohorts", () => {
    const manifest = {
      name: "consumer",
      dependencies: {
        "@univer-cli/config": "1.0.0-insiders.old",
        "@univerjs/core": "1.0.0-insiders.old",
        "@univerjs-pro/cli-assets": "0.1.0",
        "@univerjs-pro/collaboration-service": "1.0.0-insiders.old",
        "@univerjs-pro/engine-formula-rust-binding": "1.0.0-insiders.formula",
        "@univerjs-pro/exchange-node-binding": "0.1.0",
        "@univerjs/icons": "1.34.0",
        "@univer/local": "workspace:*",
        react: "^19.0.0",
      },
      peerDependencies: {
        "@univerjs-pro/embed": "1.0.0-insiders.old",
      },
      devDependencies: {
        "@univer-cli/univer-render-runtime": "1.0.0-insiders.old",
        "@univerjs/docs": "1.0.0-insiders.old",
      },
      optionalDependencies: {
        "@univerjs/sheets": "1.0.0-insiders.old",
      },
    };
    const changed = alignManifestSdkDependencies(
      manifest,
      "1.0.0-insiders.new",
      new Set(["@univer/local"]),
    );
    expect(changed).toBe(4);
    expect(manifest.dependencies["@univer-cli/config"]).toBe("1.0.0-insiders.old");
    expect(manifest.dependencies["@univerjs/core"]).toBe("1.0.0-insiders.new");
    expect(manifest.dependencies["@univerjs-pro/collaboration-service"]).toBe("1.0.0-insiders.old");
    expect(manifest.peerDependencies["@univerjs-pro/embed"]).toBe("1.0.0-insiders.new");
    expect(manifest.devDependencies["@univerjs/docs"]).toBe("1.0.0-insiders.new");
    expect(manifest.devDependencies["@univer-cli/univer-render-runtime"]).toBe(
      "1.0.0-insiders.old",
    );
    expect(manifest.optionalDependencies["@univerjs/sheets"]).toBe("1.0.0-insiders.new");
    expect(manifest.dependencies["@univerjs/icons"]).toBe("1.34.0");
    expect(manifest.dependencies["@univerjs-pro/cli-assets"]).toBe("0.1.0");
    expect(manifest.dependencies["@univerjs-pro/engine-formula-rust-binding"]).toBe(
      "1.0.0-insiders.formula",
    );
    expect(manifest.dependencies["@univerjs-pro/exchange-node-binding"]).toBe("0.1.0");
    expect(manifest.dependencies["@univer/local"]).toBe("workspace:*");
    expect(manifest.dependencies.react).toBe("^19.0.0");
  });

  it("rejects non-exact CLI SDK dependency versions", () => {
    const manifest = {
      name: "consumer",
      dependencies: {
        "@univer-cli/config": "^1.0.0",
      },
    };
    expect(() => alignManifestSdkDependencies(manifest, "1.0.0-insiders.new")).toThrow(
      /must use an exact SemVer/u,
    );
  });

  it("every workspace consumer uses exact internally aligned SDK cohorts", async () => {
    const packages = await discoverWorkspacePackages();
    const baseline = resolveWorkspaceSdkBaseline(packages);
    expect(validateWorkspaceSdkDependencies(packages, baseline)).toBeGreaterThan(0);
  });
});
