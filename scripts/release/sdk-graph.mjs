import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertExactSemver } from "./policy.mjs";

const SDK_PREFIXES = ["@univer-cli/", "@univerjs/", "@univerjs-pro/"];
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const INDEPENDENT_PACKAGES = new Set([
  "@univerjs/icons",
  "@univerjs-pro/cli-assets",
  "@univerjs-pro/engine-formula-rust-binding",
  "@univerjs-pro/uexcli",
]);

export async function validateWorkspaceSdkDependencies(repoRoot) {
  const entries = [];
  for (const parent of ["apps", "packages"]) {
    const root = join(repoRoot, parent);
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(root, entry.name, "package.json");
      entries.push({
        manifest: JSON.parse(await readFile(manifestPath, "utf8")),
        manifestPath,
      });
    }
  }
  return validateSdkDependencyGraph(entries);
}

export function validateSdkDependencyGraph(entries) {
  const versions = new Map();
  let sdkVersion;
  for (const entry of entries) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, version] of Object.entries(entry.manifest[field] ?? {})) {
        if (!SDK_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
        assertExactSemver(version, `${name} in ${entry.manifestPath}`);
        const existing = versions.get(name);
        if (existing !== undefined && existing !== version) {
          throw new Error(
            `${name} resolves to both ${existing} and ${version} across workspace manifests.`,
          );
        }
        versions.set(name, version);
        if (INDEPENDENT_PACKAGES.has(name)) continue;
        if (sdkVersion === undefined) sdkVersion = version;
        else if (sdkVersion !== version) {
          throw new Error(`SDK cohort mismatch: ${name} uses ${version}, expected ${sdkVersion}.`);
        }
      }
    }
  }
  if (sdkVersion === undefined) {
    throw new Error("Workspace does not declare a main Univer SDK cohort.");
  }
  return {
    dependencyCount: versions.size,
    sdkVersion,
    versions: Object.fromEntries(
      [...versions].sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}
