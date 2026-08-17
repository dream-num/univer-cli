import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function verifyReleaseTarball(input) {
  const root = await mkdtemp(join(tmpdir(), "univer-cli-release-verify-"));
  const prefix = join(root, "prefix");
  const home = join(root, "univer-home");
  const univerfile = join(root, "verification.univer");
  const executable = join(prefix, "bin", "univer");
  const env = {
    ...process.env,
    npm_config_cache: join(input.workspaceRoot, ".release", "npm-cache"),
    PATH: `${join(prefix, "bin")}:${process.env.PATH ?? ""}`,
    UNIVER_HOME: home,
  };
  let daemonStarted = false;
  const invoke = async (args) =>
    await execFileAsync(executable, args, {
      env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
    });
  const run = async (args) => {
    try {
      const result = await invoke(args);
      return { exitCode: 0, stderr: result.stderr, stdout: result.stdout };
    } catch (error) {
      const stderr = typeof error?.stderr === "string" ? error.stderr : "";
      throw new Error(`univer ${args.join(" ")} failed: ${stderr || String(error)}`);
    }
  };
  const runAllowingFailure = async (args) => {
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
  };

  try {
    await execFileAsync(
      "npm",
      ["install", "--global", input.tarballPath, "--prefix", prefix, "--registry", input.registry],
      { cwd: input.workspaceRoot, env, maxBuffer: 32 * 1024 * 1024, timeout: 300_000 },
    );
    const version = (await run(["--version"])).stdout.trim();
    if (version !== input.expectedVersion) {
      throw new Error(`Installed CLI reported ${version}, expected ${input.expectedVersion}`);
    }
    const skills = parseJson((await run(["skills", "list", "--json"])).stdout, "skills list");
    const coreSkill = parseJson(
      (await run(["skills", "get", "core", "--json"])).stdout,
      "skills get core",
    );
    if (!Array.isArray(skills.skills) || skills.skills.length === 0) {
      throw new Error("Packaged CLI did not expose runtime Skills.");
    }
    if (coreSkill.skills?.[0]?.name !== "core") {
      throw new Error("Packaged CLI did not expose the core Skill.");
    }
    const port = await freePort();
    await run(["config", "set", "collabGateway.port", String(port), "--json"]);
    const doctor = parseJson((await run(["doctor", "--json"])).stdout, "doctor");
    if (doctor.ok !== true) throw new Error("Packaged CLI doctor did not report ready.");
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
    return {
      ok: true,
      version,
      tarball: input.tarballPath,
      doctorReady: doctor.ok,
      skillCount: skills.skills.length,
      coreSkill: coreSkill.skills[0].name,
      unitCount: status.units?.length,
      viewerStatus: response.status,
      daemon: { state: daemon.state, gateway: daemon.gateway.state },
      update: {
        exitCode: update.exitCode,
        result: parseOptionalJson(update.stdout) ?? parseOptionalJson(update.stderr),
      },
    };
  } finally {
    if (daemonStarted) await runAllowingFailure(["daemon", "stop", "--json"]);
    await rm(root, { force: true, recursive: true });
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}

function parseOptionalJson(value) {
  try {
    return JSON.parse(value);
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
