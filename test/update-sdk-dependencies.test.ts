import { describe, expect, it } from "vitest";
import {
  alignManifestSdkDependencies,
  discoverWorkspacePackages,
  parseSdkUpdateVersion,
  resolveWorkspaceSdkBaseline,
  stripWorkspaceSdkOverrides,
  validateWorkspaceSdkDependencies,
} from "../scripts/update-sdk-dependencies.mjs";

describe("update:univer-sdk dependency alignment", () => {
  it("requires one exact SDK version", () => {
    expect(parseSdkUpdateVersion(["--sdk_version", "1.0.0-insiders.20260822-0c0c0dd"])).toBe(
      "1.0.0-insiders.20260822-0c0c0dd",
    );
    expect(parseSdkUpdateVersion(["--sdk_version=1.0.0-beta.2"])).toBe("1.0.0-beta.2");
    expect(() => parseSdkUpdateVersion([])).toThrow(/--sdk_version/u);
    expect(() => parseSdkUpdateVersion(["^1.0.0"])).toThrow(/--sdk_version/u);
  });

  it("aligns every SDK-prefixed dependency except self-versioned packages", () => {
    const manifest = {
      name: "consumer",
      dependencies: {
        "@univer-cli/config": "1.0.0-insiders.old",
        "@univerjs-pro/collaboration-service": "1.0.0-insiders.old",
        "@univerjs/core": "1.0.0-insiders.old",
        "@univerjs/icons": "1.34.0",
        "@univer/local": "workspace:*",
        react: "^19.0.0",
      },
      peerDependencies: {
        "@univerjs-pro/embed": "1.0.0-insiders.old",
      },
      devDependencies: {
        "@univer-cli/univer-render-runtime": "1.0.0-insiders.old",
        "@univerjs-pro/doc-typst-native-binding": "1.0.0-insiders.formula",
        "@univerjs/docs": "1.0.0-insiders.old",
      },
      optionalDependencies: {
        "@univerjs-pro/cli-assets": "0.1.0",
        "@univerjs/sheets": "1.0.0-insiders.old",
      },
    };
    const changed = alignManifestSdkDependencies(
      manifest,
      "1.0.0-insiders.new",
      new Set(["@univer/local"]),
    );
    expect(changed).toBe(7);
    expect(manifest.dependencies["@univer-cli/config"]).toBe("1.0.0-insiders.new");
    expect(manifest.dependencies["@univerjs-pro/collaboration-service"]).toBe("1.0.0-insiders.new");
    expect(manifest.dependencies["@univerjs/core"]).toBe("1.0.0-insiders.new");
    expect(manifest.peerDependencies["@univerjs-pro/embed"]).toBe("1.0.0-insiders.new");
    expect(manifest.devDependencies["@univerjs/docs"]).toBe("1.0.0-insiders.new");
    expect(manifest.devDependencies["@univer-cli/univer-render-runtime"]).toBe(
      "1.0.0-insiders.new",
    );
    expect(manifest.optionalDependencies["@univerjs/sheets"]).toBe("1.0.0-insiders.new");
    expect(manifest.dependencies["@univerjs/icons"]).toBe("1.34.0");
    expect(manifest.optionalDependencies["@univerjs-pro/cli-assets"]).toBe("0.1.0");
    expect(manifest.devDependencies["@univerjs-pro/doc-typst-native-binding"]).toBe(
      "1.0.0-insiders.formula",
    );
    expect(manifest.dependencies["@univer/local"]).toBe("workspace:*");
    expect(manifest.dependencies.react).toBe("^19.0.0");
  });

  it("strips SDK overrides and keeps unrelated overrides", () => {
    const source = [
      "packages:",
      '  - "apps/*"',
      "overrides:",
      '  "@univerjs/core": "1.0.0-rc.0"',
      '  "@univer-cli/config": "1.0.0-rc.0"',
      '  "some-other-package": "1.2.3"',
      "",
    ].join("\n");
    expect(stripWorkspaceSdkOverrides(source)).toEqual({
      changed: 2,
      source: [
        "packages:",
        '  - "apps/*"',
        "overrides:",
        '  "some-other-package": "1.2.3"',
        "",
      ].join("\n"),
    });
  });

  it("drops the overrides key once no unrelated overrides remain", () => {
    const source = 'overrides:\n  "@univerjs-pro/embed": "1.0.0-rc.0"\n';
    expect(stripWorkspaceSdkOverrides(source)).toEqual({
      changed: 1,
      source: "",
    });
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

  it("every workspace consumer uses one exact SDK baseline", async () => {
    const packages = await discoverWorkspacePackages();
    const baseline = resolveWorkspaceSdkBaseline(packages);
    expect(validateWorkspaceSdkDependencies(packages, baseline)).toBeGreaterThan(0);
  });
});
