import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createInsidersVersion, stageReleasePackage } from "./release-package.mjs";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const applicationRoot = join(workspaceRoot, "apps", "cli");
const outputRoot = join(workspaceRoot, ".release");
const sourceManifestPath = join(applicationRoot, "package.json");
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const worktreeStatus = (
  await execFileAsync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: workspaceRoot,
  })
).stdout.trim();
if (worktreeStatus.length > 0) {
  throw new Error(
    "Release staging requires a clean Git worktree; commit all candidate changes first.",
  );
}
const commit = (
  await execFileAsync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: workspaceRoot })
).stdout.trim();
const now = new Date();
const date = [
  String(now.getFullYear()).padStart(4, "0"),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("");
const version = createInsidersVersion(sourceManifest.version, date, commit);

await execFileAsync("pnpm", ["--filter", "univer-cli", "build"], {
  cwd: workspaceRoot,
  env: { ...process.env, UNIVER_CLI_BUILD_VERSION: version },
  maxBuffer: 16 * 1024 * 1024,
});
const staged = await stageReleasePackage({
  dependencyAuditPath: join(applicationRoot, "dist", "release-dependencies.json"),
  distPath: join(applicationRoot, "dist"),
  outputRoot,
  readmePath: join(applicationRoot, "README.md"),
  sourceManifestPath,
  version,
});
await mkdir(outputRoot, { recursive: true });
const packed = JSON.parse(
  (
    await execFileAsync(
      "npm",
      [
        "pack",
        staged.stagingDirectory,
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        outputRoot,
      ],
      {
        cwd: workspaceRoot,
        env: { ...process.env, npm_config_cache: join(outputRoot, "npm-cache") },
        maxBuffer: 16 * 1024 * 1024,
      },
    )
  ).stdout,
);
const filename = packed[0]?.filename;
if (typeof filename !== "string" || filename.length === 0) {
  throw new Error("npm pack did not report a tarball filename");
}
const tarball = join(outputRoot, filename);
const publishDryRun = await execFileAsync(
  "npm",
  [
    "publish",
    "--dry-run",
    tarball,
    "--ignore-scripts",
    "--json",
    "--registry",
    staged.manifest.publishConfig.registry,
    "--tag",
    staged.manifest.publishConfig.tag,
  ],
  {
    cwd: workspaceRoot,
    env: { ...process.env, npm_config_cache: join(outputRoot, "npm-cache") },
    maxBuffer: 16 * 1024 * 1024,
  },
);
if (publishDryRun.stderr.includes("npm auto-corrected")) {
  throw new Error(`npm publish --dry-run modified the staged manifest:\n${publishDryRun.stderr}`);
}
const result = {
  version,
  commit,
  registry: staged.manifest.publishConfig.registry,
  tag: staged.manifest.publishConfig.tag,
  dependencies: staged.externalDependencyAudit.required,
  conditionalDependencies: staged.externalDependencyAudit.conditional,
  stagingDirectory: staged.stagingDirectory,
  publishDryRun: true,
  tarball,
};
await writeFile(join(outputRoot, "latest.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
