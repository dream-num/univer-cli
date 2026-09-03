import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertExactSemver } from "./policy.mjs";

export const SDK_PREFIXES = ["@univer-cli/", "@univerjs/", "@univerjs-pro/"];
export const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
export const INDEPENDENT_PACKAGES = new Set([
  "@univerjs/icons",
  "@univerjs-pro/cli-assets",
  "@univerjs-pro/doc-typst-native-binding",
  "@univerjs-pro/engine-formula-rust-binding",
  "@univerjs-pro/exchange-node-binding",
]);
export const COLLABORATION_SERVER_PACKAGES = new Set([
  "@univerjs-pro/collaboration-endpoint",
  "@univerjs-pro/collaboration-history-endpoint",
  "@univerjs-pro/collaboration-history-service",
  "@univerjs-pro/collaboration-server",
  "@univerjs-pro/collaboration-service",
  "@univerjs-pro/collaboration-transport-node",
  "@univerjs-pro/collaboration-worktree-endpoint",
  "@univerjs-pro/collaboration-worktree-service",
  "@univerjs-pro/computing-delegation-client",
  "@univerjs-pro/computing-delegation-server",
  "@univerjs-pro/exchange-node",
  "@univerjs-pro/ssc",
  "@univerjs-pro/ssr",
  "@univerjs-pro/ssr-client",
  "@univerjs-pro/ssr-server",
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
  const cohortVersions = new Map();
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
        const cohort = sdkCohort(name);
        if (cohort === undefined) continue;
        const cohortVersion = cohortVersions.get(cohort);
        if (cohortVersion === undefined) cohortVersions.set(cohort, version);
        else if (cohortVersion !== version) {
          throw new Error(
            `SDK ${cohort} cohort mismatch: ${name} uses ${version}, expected ${cohortVersion}.`,
          );
        }
      }
    }
  }
  const sdkVersion = cohortVersions.get("univer");
  if (sdkVersion === undefined) {
    throw new Error("Workspace does not declare a main Univer SDK cohort.");
  }
  return {
    dependencyCount: versions.size,
    sdkVersion,
    cohorts: Object.fromEntries(
      [...cohortVersions].sort(([left], [right]) => left.localeCompare(right)),
    ),
    versions: Object.fromEntries(
      [...versions].sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

export function sdkCohort(name) {
  if (INDEPENDENT_PACKAGES.has(name)) return undefined;
  if (name.startsWith("@univer-cli/")) return "cli";
  if (COLLABORATION_SERVER_PACKAGES.has(name)) return "collaboration-server";
  if (name.startsWith("@univerjs/") || name.startsWith("@univerjs-pro/")) return "univer";
  return undefined;
}
