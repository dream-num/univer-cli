import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export function createReleaseManifest(
  sourceManifest,
  version,
  externalPackageNames,
  publishConfig,
) {
  if (sourceManifest.name !== "univer-cli") {
    throw new Error(`Expected package name univer-cli, received ${String(sourceManifest.name)}`);
  }
  const sourceDependencies = sourceManifest.dependencies ?? {};
  const dependencies = {};
  for (const name of [...externalPackageNames].sort()) {
    const range = sourceDependencies[name];
    if (typeof range !== "string" || range.length === 0) {
      throw new Error(`Built output imports undeclared runtime dependency ${name}`);
    }
    if (range.startsWith("workspace:")) {
      throw new Error(`Runtime dependency ${name} still uses the workspace protocol`);
    }
    dependencies[name] = range;
  }
  const manifest = {
    name: "univer-cli",
    version,
    private: false,
    description: sourceManifest.description,
    keywords: sourceManifest.keywords,
    bin: { univer: "dist/bin.js" },
    files: ["dist", "README.md"],
    type: "module",
    dependencies,
    engines: sourceManifest.engines,
    publishConfig,
  };
  if (JSON.stringify(manifest).includes("workspace:")) {
    throw new Error("Release manifest contains a workspace protocol");
  }
  return manifest;
}

export async function stageReleasePackage(input) {
  const sourceManifest = JSON.parse(await readFile(input.sourceManifestPath, "utf8"));
  const externalDependencyAudit = JSON.parse(await readFile(input.dependencyAuditPath, "utf8"));
  if (
    !Array.isArray(externalDependencyAudit.required) ||
    !Array.isArray(externalDependencyAudit.conditional)
  ) {
    throw new Error("Build dependency audit must contain required and conditional arrays");
  }
  const manifest = createReleaseManifest(
    sourceManifest,
    input.version,
    externalDependencyAudit.required,
    input.publishConfig,
  );
  const stagingRoot = join(input.outputRoot, "staging");
  const stagingDirectory = join(stagingRoot, `univer-cli-${input.version}`);
  const temporaryDirectory = `${stagingDirectory}.tmp`;
  await mkdir(stagingRoot, { recursive: true });
  await rm(temporaryDirectory, { force: true, recursive: true });
  await mkdir(temporaryDirectory, { recursive: true });
  await cp(input.distPath, join(temporaryDirectory, "dist"), {
    filter: (source) =>
      !source.endsWith(".map") && basename(source) !== "release-dependencies.json",
    recursive: true,
  });
  await cp(input.readmePath, join(temporaryDirectory, "README.md"));
  await writeFile(
    join(temporaryDirectory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await rm(stagingDirectory, { force: true, recursive: true });
  await rename(temporaryDirectory, stagingDirectory);
  return { externalDependencyAudit, manifest, stagingDirectory };
}
