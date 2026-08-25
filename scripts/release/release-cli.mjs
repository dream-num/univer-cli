import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReleaseContext,
  npmTagForRelease,
  parseReleaseArguments,
  RELEASE_PACKAGE_NAME,
  RELEASE_REGISTRY,
  SOURCE_PACKAGE_VERSION,
  validateReleaseManifest,
} from "./policy.mjs";
import { publishPreparedRelease } from "./publisher.mjs";
import { stageReleasePackage } from "./release-package.mjs";
import { validateWorkspaceSdkDependencies } from "./sdk-graph.mjs";
import { verifyReleaseTarball } from "./verify-tarball.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const appRoot = join(repoRoot, "apps", "cli");
const releaseRoot = join(repoRoot, ".release");
const releaseManifestPath = join(releaseRoot, "release-manifest.json");
const options = parseReleaseArguments(process.argv.slice(2));
const npmTag = npmTagForRelease(options.channel, options.version);

assertReleaseContext(options.channel, options.version, process.env);
await assertSourceManifest();
const sourceSha = capture("git", ["rev-parse", "HEAD"], repoRoot);
const sourceStatus = capture("git", ["status", "--porcelain", "--untracked-files=all"], repoRoot);
const sourceDirty = sourceStatus.length > 0;
let sdkAudit;
if (options.channel !== "dev") {
  assertStrictReleaseSource(process.env.BASE_BRANCH, sourceStatus);
  sdkAudit = await validateWorkspaceSdkDependencies(repoRoot);
}

await rm(releaseRoot, { force: true, recursive: true });
await mkdir(releaseRoot, { recursive: true });
run("pnpm", ["--filter", RELEASE_PACKAGE_NAME, "build"], repoRoot, {
  ...process.env,
  UNIVER_CLI_BUILD_VERSION: options.version,
});
const staged = await stageReleasePackage({
  dependencyAuditPath: join(appRoot, "dist", "release-dependencies.json"),
  distPath: join(appRoot, "dist"),
  licensePath: join(appRoot, "LICENSE"),
  outputRoot: releaseRoot,
  publishConfig: { registry: RELEASE_REGISTRY, tag: npmTag },
  readmePath: join(appRoot, "README.md"),
  readmeZhCnPath: join(appRoot, "README.zh-CN.md"),
  sourceManifestPath: join(appRoot, "package.json"),
  version: options.version,
});
const packed = JSON.parse(
  capture(
    "npm",
    [
      "pack",
      staged.stagingDirectory,
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      releaseRoot,
    ],
    repoRoot,
    { ...process.env, npm_config_cache: join(releaseRoot, "npm-cache") },
  ),
);
if (!Array.isArray(packed) || packed.length !== 1 || typeof packed[0]?.filename !== "string") {
  throw new Error("npm pack must report exactly one release tarball.");
}
assertReleaseFiles(packed[0].files);
const tarballPath = join(releaseRoot, packed[0].filename);
const tarball = await readFile(tarballPath);
const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
if (typeof packed[0].integrity === "string" && packed[0].integrity !== integrity) {
  throw new Error("npm pack integrity differs from the generated tarball.");
}
const packageManifest = JSON.parse(
  await readFile(join(staged.stagingDirectory, "package.json"), "utf8"),
);
if (packageManifest.name !== RELEASE_PACKAGE_NAME || packageManifest.version !== options.version) {
  throw new Error("Packaged CLI identity does not match the requested release.");
}

const packageAudit = await auditPackage(staged.stagingDirectory, packed[0]);
await writeFile(
  join(releaseRoot, "package-audit.json"),
  `${JSON.stringify(packageAudit, null, 2)}\n`,
  "utf8",
);
const releaseManifest = validateReleaseManifest({
  channel: options.channel,
  dependencies: {
    conditional: staged.externalDependencyAudit.conditional,
    required: staged.externalDependencyAudit.required,
  },
  integrity,
  npmTag,
  package: RELEASE_PACKAGE_NAME,
  packageMetrics: {
    entryCount: packed[0].entryCount,
    packedSize: packed[0].size,
    unpackedSize: packed[0].unpackedSize,
  },
  registry: RELEASE_REGISTRY,
  schemaVersion: 1,
  sourceDirty,
  sourceSha,
  tarball: packed[0].filename,
  version: options.version,
  ...(sdkAudit === undefined ? {} : { sdkVersion: sdkAudit.sdkVersion }),
});
await writeFile(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");

const verification = await verifyReleaseTarball({
  expectedVersion: options.version,
  registry: RELEASE_REGISTRY,
  tarballPath,
  workspaceRoot: repoRoot,
});
await writeFile(
  join(releaseRoot, `verification-${options.version}.json`),
  `${JSON.stringify(verification, null, 2)}\n`,
  "utf8",
);
const dryRun = runResult(
  "npm",
  [
    "publish",
    "--dry-run",
    tarballPath,
    "--ignore-scripts",
    "--json",
    "--registry",
    RELEASE_REGISTRY,
    "--tag",
    npmTag,
  ],
  repoRoot,
  { ...process.env, npm_config_cache: join(releaseRoot, "npm-cache") },
);
if (dryRun.status !== 0) {
  throw new Error(`npm publish --dry-run failed:\n${dryRun.stderr || dryRun.stdout}`);
}
if (dryRun.stderr.includes("npm auto-corrected")) {
  throw new Error(`npm publish --dry-run modified the staged manifest:\n${dryRun.stderr}`);
}

if (options.mode === "publish") await publishPreparedRelease(releaseManifestPath);
process.stdout.write(
  `${JSON.stringify({ ...releaseManifest, packageAudit, verification }, null, 2)}\n`,
);

async function assertSourceManifest() {
  const manifest = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
  if (manifest.name !== RELEASE_PACKAGE_NAME) {
    throw new Error(`Source package must be ${RELEASE_PACKAGE_NAME}.`);
  }
  if (manifest.version !== SOURCE_PACKAGE_VERSION) {
    throw new Error(
      `Source package version must remain ${SOURCE_PACKAGE_VERSION}, got ${String(manifest.version)}.`,
    );
  }
  if (manifest.private !== true) throw new Error("Source package must remain private.");
}

function assertStrictReleaseSource(baseBranch, sourceStatus) {
  if (sourceStatus.length > 0) {
    throw new Error("alpha and insiders releases require a clean Git worktree.");
  }
  const baseRef = `refs/remotes/origin/${baseBranch}`;
  const result = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", baseRef], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Release commit must be contained in origin/${baseBranch}.`);
  }
}

function assertReleaseFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("npm pack did not report release files.");
  }
  const paths = new Set(files.map((file) => file?.path));
  for (const required of ["LICENSE", "README.md", "README.zh-CN.md", "package.json"]) {
    if (!paths.has(required)) {
      throw new Error(`Release tarball is missing required file ${required}.`);
    }
  }
  for (const file of files) {
    const path = file?.path;
    if (typeof path !== "string") throw new Error("npm pack reported an invalid file path.");
    if (
      path.endsWith(".map") ||
      path === "dist/release-dependencies.json" ||
      path.startsWith("src/") ||
      path.startsWith("test/") ||
      path.startsWith("scripts/")
    ) {
      throw new Error(`Release tarball contains non-distribution file ${path}.`);
    }
  }
}

async function auditPackage(stagingDirectory, packedMetadata) {
  const hashes = new Map();
  const files = [];
  for (const entry of packedMetadata.files) {
    const content = await readFile(join(stagingDirectory, entry.path));
    const hash = createHash("sha256").update(content).digest("hex");
    const group = hashes.get(hash) ?? [];
    group.push({ path: entry.path, size: entry.size });
    hashes.set(hash, group);
    files.push({ path: entry.path, size: entry.size });
  }
  const duplicateGroups = [...hashes.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([sha256, group]) => ({ files: group, sha256 }))
    .sort((left, right) => right.files[0].size - left.files[0].size);
  return {
    applicationCodeObfuscated: false,
    applicationSourcePolicy: "open-source",
    duplicateBytes: duplicateGroups.reduce(
      (total, group) => total + group.files[0].size * (group.files.length - 1),
      0,
    ),
    duplicateFileCount: duplicateGroups.reduce((total, group) => total + group.files.length - 1, 0),
    duplicateGroups,
    entryCount: packedMetadata.entryCount,
    largestFiles: [...files].sort((left, right) => right.size - left.size).slice(0, 20),
    packedSize: packedMetadata.size,
    unpackedSize: packedMetadata.unpackedSize,
  };
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error !== undefined) {
    throw new Error(`Unable to run ${command}.`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${String(result.status)}.`);
  }
}

function capture(command, args, cwd, env = process.env) {
  const result = runResult(command, args, cwd, env);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${String(result.status)}:\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function runResult(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env });
  if (result.error !== undefined) {
    throw new Error(`Unable to run ${command}.`, { cause: result.error });
  }
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}
