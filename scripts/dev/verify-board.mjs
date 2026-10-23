import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { verifyBoardFlow } from "./board-flow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SDK_NAME = /^@(?:univer-cli|univerjs|univerjs-pro)\/[a-z0-9][a-z0-9-]*$/u;

export function addSdkOverrides(source, overrides) {
  const entries = Object.entries(overrides);
  if (entries.some(([name]) => !SDK_NAME.test(name)))
    throw new Error("Only public SDK packages are allowed.");
  const lines = source.split(/\r?\n/u);
  const header = lines.findIndex((line) => /^overrides:\s*$/u.test(line));
  if (header < 0 && lines.some((line) => line.startsWith("overrides:"))) {
    throw new Error("Use a block-style workspace overrides mapping for local dev.");
  }
  const additions = entries.map(
    ([name, path]) =>
      `  ${JSON.stringify(name)}: ${JSON.stringify(`file:${path.replaceAll("\\", "/")}`)}`,
  );
  lines.splice(
    header < 0 ? lines.length : header + 1,
    0,
    ...(header < 0 ? ["overrides:"] : []),
    ...additions,
  );
  return lines.join("\n");
}

export function restoreOwnedFile(path, original, owned) {
  if (!readFileSync(path).equals(owned)) {
    throw new Error(
      `Concurrent edit preserved at ${path}; recover the original from the evidence directory.`,
    );
  }
  writeFileSync(path, original);
}

export function replaceOwnedConfiguration(file, replacement) {
  const temporaryPath = `${file.path}.board-dev-${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, replacement, { flag: "wx" });
    if (!readFileSync(file.path).equals(file.owned))
      throw new Error(`Concurrent edit preserved at ${file.path}`);
    renameSync(temporaryPath, file.path);
    file.owned = replacement;
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function captureInstalledLock(workspace, lock) {
  // The installer owns the lock only; never adopt another writer's workspace configuration.
  lock.owned = readFileSync(lock.path);
  if (!readFileSync(workspace.path).equals(workspace.owned)) {
    throw new Error(`Concurrent edit preserved at ${workspace.path}`);
  }
}

export function assertCompiledSdkEntry(manifest) {
  function targets(value) {
    if (typeof value === "string") return [value];
    return value && typeof value === "object" ? Object.values(value).flatMap(targets) : [];
  }
  const entries = targets(manifest.exports ?? manifest.main);
  if (
    entries.some(
      (entry) =>
        entry.includes("/src/") || (/\.[cm]?tsx?$/u.test(entry) && !/\.d\.[cm]?ts$/u.test(entry)),
    ) ||
    !entries.some((entry) => /\.[cm]?js$/u.test(entry))
  ) {
    throw new Error(
      `${manifest.name} has no compiled SDK runtime entry; use its producer's dev packaging workflow.`,
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: 600_000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.error?.message ?? result.stderr ?? "see log"}`,
    );
  }
  return result.stdout?.trim() ?? "";
}

function readTarballs(mapPath) {
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  if (!map || Array.isArray(map) || typeof map !== "object" || !Object.keys(map).length) {
    throw new Error(
      "The tarball map must contain SDK package names, tarball paths and source provenance.",
    );
  }
  return Object.entries(map)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, input]) => {
      if (
        !SDK_NAME.test(name) ||
        typeof input?.tarball !== "string" ||
        !input.tarball.endsWith(".tgz") ||
        !/^[a-f\d]{40}$/iu.test(input.sourceCommit) ||
        typeof input.sourceDirty !== "boolean"
      ) {
        throw new Error(`Invalid SDK tarball mapping: ${name}`);
      }
      const path = realpathSync(resolve(dirname(mapPath), input.tarball));
      const manifest = JSON.parse(run("tar", ["-xOf", path, "package/package.json"]));
      if (
        manifest.name !== name ||
        !/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/iu.test(manifest.version)
      ) {
        throw new Error(`Tarball name/version mismatch: ${name}`);
      }
      assertCompiledSdkEntry(manifest);
      for (const dependencies of [
        manifest.dependencies,
        manifest.optionalDependencies,
        manifest.peerDependencies,
      ]) {
        if (
          Object.values(dependencies ?? {}).some((value) =>
            /^(?:file|link|workspace):/u.test(value),
          )
        ) {
          throw new Error(
            `${name} contains a source-only dependency; use its producer's dev packaging workflow.`,
          );
        }
      }
      const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
      if (input.sha256 !== undefined && input.sha256 !== sha256)
        throw new Error(`${name} tarball SHA-256 mismatch.`);
      return {
        name,
        path,
        version: manifest.version,
        sha256,
        sourceCommit: input.sourceCommit,
        sourceDirty: input.sourceDirty,
      };
    });
}

function browserFingerprint(packages) {
  const hash = createHash("sha256").update(JSON.stringify(packages));
  for (const name of [
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "tsconfig.base.json",
  ]) {
    hash.update(name).update(readFileSync(join(ROOT, name)));
  }
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) hash.update(relative(ROOT, path)).update(readFileSync(path));
    }
  }
  for (const name of [
    "collab-web",
    "render-runtime-client",
    "render-preset",
    "unit-comparison-viewer",
  ]) {
    visit(join(ROOT, "packages", name));
  }
  return hash.digest("hex");
}

export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      map: { type: "string" },
      output: { type: "string" },
      "store-dir": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(
      "pnpm dev:board --map <sdk-tarballs.json> [--output <new-directory>] [--store-dir <path>]\n",
    );
    return;
  }
  if (!values.map) throw new Error("--map is required; no adjacent checkout is discovered.");
  const pnpm = process.env.npm_execpath;
  if (!pnpm || !/\.[cm]?js$/u.test(pnpm))
    throw new Error("Run this workflow through pnpm dev:board.");
  if (run("git", ["status", "--porcelain", "--", "pnpm-lock.yaml", "pnpm-workspace.yaml"])) {
    throw new Error("Commit or restore workspace/lock edits before local SDK validation.");
  }
  const packages = readTarballs(resolve(values.map));
  const overrides = JSON.parse(
    run(process.execPath, [pnpm, "config", "get", "overrides", "--json"]) || "{}",
  );
  if (packages.some(({ name }) => name in overrides))
    throw new Error("An SDK tarball already has a workspace override.");
  const evidence = values.output
    ? resolve(values.output)
    : mkdtempSync(join(tmpdir(), "univer-board-dev-"));
  if (values.output) mkdirSync(evidence);
  const env = {
    ...process.env,
    CI: "true",
    UNIVER_HOME: join(evidence, "home"),
    UNIVER_CLI_UPDATE_CHECK: "0",
  };
  const require = createRequire(join(ROOT, "apps/cli/package.json"));
  const cliArgs = [
    "--import",
    pathToFileURL(require.resolve("tsx")).href,
    join(ROOT, "apps/cli/src/bin.ts"),
  ];
  const files = ["pnpm-workspace.yaml", "pnpm-lock.yaml"].map((name) => ({
    path: join(ROOT, name),
    original: readFileSync(join(ROOT, name)),
  }));
  for (const file of files) file.owned = file.original;
  mkdirSync(join(ROOT, "node_modules/.cache"), { recursive: true });
  const lockPath = join(ROOT, "node_modules/.cache/board-dev.lock");
  const lock = openSync(lockPath, "wx");
  closeSync(lock);
  process.stdout.write(`Board local dev evidence: ${evidence}\n`);
  let stopFailed = false;
  let flowStarted = false;
  const failures = [];
  try {
    for (const file of files)
      writeFileSync(join(evidence, `${relative(ROOT, file.path)}.original`), file.original);
    writeFileSync(join(evidence, "packages.json"), JSON.stringify(packages, null, 2));
    replaceOwnedConfiguration(
      files[0],
      Buffer.from(
        addSdkOverrides(
          files[0].original.toString("utf8"),
          Object.fromEntries(packages.map(({ name, path }) => [name, path])),
        ),
      ),
    );
    const installLog = openSync(join(evidence, "install.log"), "w");
    try {
      run(
        process.execPath,
        [
          pnpm,
          "install",
          "--no-frozen-lockfile",
          ...(values["store-dir"] ? ["--store-dir", values["store-dir"]] : []),
        ],
        { env, stdio: ["ignore", installLog, installLog] },
      );
    } finally {
      try {
        closeSync(installLog);
      } finally {
        captureInstalledLock(files[0], files[1]);
      }
    }
    const fingerprint = browserFingerprint(packages);
    const marker = join(ROOT, "apps/cli/dist/browser/.board-dev-input.json");
    const previous = existsSync(marker) ? JSON.parse(readFileSync(marker, "utf8")) : undefined;
    if (previous?.fingerprint !== fingerprint || !existsSync(join(dirname(marker), "index.html"))) {
      const buildLog = openSync(join(evidence, "browser-build.log"), "w");
      try {
        run(process.execPath, [pnpm, "--filter", "@univer/collab-web", "build:browser"], {
          env,
          stdio: ["ignore", buildLog, buildLog],
        });
      } finally {
        closeSync(buildLog);
      }
      writeFileSync(marker, JSON.stringify({ fingerprint, packages }, null, 2));
    } else
      process.stdout.write("Reusing the browser bundle: SDK tarballs and browser sources match.\n");
    flowStarted = true;
    verifyBoardFlow({ root: ROOT, evidence, env, cliArgs });
  } catch (error) {
    failures.push(error);
  } finally {
    const stopped = flowStarted
      ? spawnSync(process.execPath, [...cliArgs, "daemon", "stop", "--json"], {
          cwd: ROOT,
          env,
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
        })
      : { status: 0, stdout: "No workflow daemon was started.\n", stderr: "" };
    stopFailed = stopped.status !== 0;
    try {
      writeFileSync(
        join(evidence, "daemon-stop.json"),
        JSON.stringify(
          { exitCode: stopped.status, stdout: stopped.stdout, stderr: stopped.stderr },
          null,
          2,
        ),
      );
    } catch (error) {
      failures.push(error);
    }
    for (const file of files) {
      try {
        restoreOwnedFile(file.path, file.original, file.owned);
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      unlinkSync(lockPath);
    } catch (error) {
      failures.push(error);
    }
  }
  if (stopFailed) failures.push(new Error(`Own daemon stop failed; inspect ${evidence}`));
  if (failures.length)
    throw new AggregateError(failures, `Board local dev verification failed; inspect ${evidence}`);
  process.stdout.write(
    "Board local dev verification passed; original workspace/lock bytes restored.\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2));
