import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { INSIDERS_REGISTRY } from "./release-package.mjs";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const latest = JSON.parse(await readFile(join(workspaceRoot, ".release", "latest.json"), "utf8"));
const tarball = process.argv[2] === undefined ? latest.tarball : resolve(process.argv[2]);
const root = await mkdtemp(join(tmpdir(), "univer-cli-release-verify-"));
const prefix = join(root, "prefix");
const home = join(root, "univer-home");
const univerfile = join(root, "verification.univer");
const executable = join(prefix, "bin", "univer");
const env = {
  ...process.env,
  npm_config_cache: join(workspaceRoot, ".release", "npm-cache"),
  PATH: `${join(prefix, "bin")}:${process.env.PATH ?? ""}`,
  UNIVER_HOME: home,
};
let daemonStarted = false;

try {
  await execFileAsync(
    "npm",
    ["install", "--global", tarball, "--prefix", prefix, "--registry", INSIDERS_REGISTRY],
    { cwd: workspaceRoot, env, maxBuffer: 32 * 1024 * 1024, timeout: 300_000 },
  );
  const version = (await run(["--version"])).stdout.trim();
  if (version !== latest.version) {
    throw new Error(`Installed CLI reported ${version}, expected ${String(latest.version)}`);
  }
  const port = await freePort();
  await run(["config", "set", "collabGateway.port", String(port), "--json"]);
  const doctor = parseJson((await run(["doctor", "--json"])).stdout, "doctor");
  await run(["new", univerfile, "--json"]);
  const status = parseJson((await run(["status", univerfile, "--json"])).stdout, "status");
  const opened = parseJson((await run(["open", univerfile, "--json"])).stdout, "open");
  daemonStarted = true;
  const response = await fetch(opened.openUrl);
  if (!response.ok) throw new Error(`Packaged Viewer returned HTTP ${String(response.status)}`);
  const daemon = parseJson((await run(["daemon", "status", "--json"])).stdout, "daemon status");
  if (daemon.state !== "running" || daemon.gateway?.state !== "running") {
    throw new Error("Packaged daemon or Gateway did not reach running state");
  }
  const update = await runAllowingFailure(["update", "--json"]);
  if (`${update.stdout}\n${update.stderr}`.includes("CLI_UPDATE_DEVELOPMENT_LINK")) {
    throw new Error("Packed installation was incorrectly classified as a development link");
  }
  await run(["daemon", "stop", "--json"]);
  daemonStarted = false;
  const report = {
    ok: true,
    version,
    tarball,
    doctorReady: doctor.ok,
    unitCount: status.units?.length,
    viewerStatus: response.status,
    daemon: { state: daemon.state, gateway: daemon.gateway.state },
    update: {
      exitCode: update.exitCode,
      result: parseOptionalJson(update.stdout) ?? parseOptionalJson(update.stderr),
    },
  };
  await writeFile(
    join(workspaceRoot, ".release", `verification-${version}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (daemonStarted) await runAllowingFailure(["daemon", "stop", "--json"]);
  await rm(root, { force: true, recursive: true });
}

async function run(args) {
  try {
    const result = await invoke(args);
    return { exitCode: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    throw new Error(`univer ${args.join(" ")} failed: ${stderr || String(error)}`);
  }
}

async function runAllowingFailure(args) {
  try {
    const result = await invoke(args);
    return { exitCode: 0, stderr: result.stderr, stdout: result.stdout };
  } catch (error) {
    return {
      exitCode: typeof error?.code === "number" ? error.code : 1,
      stderr: typeof error?.stderr === "string" ? error.stderr : String(error),
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
    };
  }
}

async function invoke(args) {
  return await execFileAsync(executable, args, {
    env,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
  });
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}

function parseOptionalJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : undefined;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error === undefined ? resolveClose() : reject(error))),
  );
  if (port === undefined) throw new Error("Could not allocate a verification port");
  return port;
}
