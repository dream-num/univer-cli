import type { DaemonControl } from "@univer-cli/daemon";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { createApplicationConfig } from "../src/environment/config.js";
import { resolveApplicationPaths } from "../src/environment/paths.js";
import {
  createLocalUpdateApplication,
  isDevelopmentInstallation,
  isNewerVersion,
  readUpdateCache,
  resolveUpdateTarget,
} from "../src/features/update/service.js";
import { checkForUpdateAtStartup } from "../src/features/update/startup.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })),
  );
});

describe("channel-aware CLI update", () => {
  it("routes installed versions to their release channel and insider-npm tag", () => {
    expect(resolveUpdateTarget("0.5.0-insider.20260813-deadbee")).toEqual({
      channel: "insiders",
      distTag: "insiders",
      packageName: "univer-cli",
      registryUrl: "https://insider-npm-registry.univer.work/",
    });
    expect(resolveUpdateTarget("0.5.1-insiders.20260901-abc1234")).toEqual({
      channel: "insiders",
      distTag: "insiders",
      packageName: "univer-cli",
      registryUrl: "https://insider-npm-registry.univer.work/",
    });
    expect(resolveUpdateTarget("0.5.0")).toEqual({
      channel: "stable",
      distTag: "latest",
      packageName: "univer-cli",
      registryUrl: "https://insider-npm-registry.univer.work/",
    });
  });

  it("uses semver ordering within the selected channel", () => {
    expect(isNewerVersion("1.0.0-insider.20260813-a", "1.0.0-insider.20260814-b")).toBe(true);
    expect(isNewerVersion("1.0.0-insider.20260814-b", "1.0.0-insider.20260813-a")).toBe(false);
    expect(isNewerVersion("0.5.0-alpha.1", "0.5.0-alpha.2")).toBe(true);
    expect(isNewerVersion("1.0.0-insider.20260813-fffffff", "1.0.0-insider.20260813-0000000")).toBe(
      true,
    );
  });

  it("checks insiders metadata and installs the exact verified version", async () => {
    const homeDir = await temporaryRoot();
    const invocations: Array<{ readonly packageSpec: string; readonly registryUrl: string }> = [];
    let stopped = 0;
    const application = createLocalUpdateApplication({
      control: fakeControl({
        async status() {
          return runningStatus();
        },
        async stop() {
          stopped += 1;
          return { socketPath: "/tmp/univer.sock", state: "stopped", stopped: true };
        },
      }),
      fetchRegistry: async (url) => {
        expect(url).toBe("https://insider-npm-registry.univer.work/univer-cli");
        return registryMetadata("insiders", "0.5.0-insiders.20260814-next");
      },
      homeDir,
      now: () => new Date("2026-08-13T00:00:00.000Z"),
      packageRoot: homeDir,
      runInstaller: async (invocation) => {
        invocations.push(invocation);
        return { exitCode: 0 };
      },
      version: "0.5.0-insider.20260813-current",
    });

    await expect(
      application.update({ force: false, progress: () => undefined }),
    ).rejects.toMatchObject({ code: "CLI_UPDATE_FORCE_REQUIRED" });
    const result = await application.update({ force: true, progress: () => undefined });

    expect(result).toMatchObject({
      channel: "insiders",
      latestVersion: "0.5.0-insiders.20260814-next",
      status: "updated",
    });
    expect(stopped).toBe(1);
    expect(invocations).toEqual([
      {
        packageSpec: "univer-cli@0.5.0-insiders.20260814-next",
        registryUrl: "https://insider-npm-registry.univer.work/",
      },
    ]);
    await expect(readUpdateCache(homeDir)).resolves.toMatchObject({
      distTag: "insiders",
      latestVersion: "0.5.0-insiders.20260814-next",
    });
  });

  it("checks stable metadata on the latest dist-tag and installs the exact verified version", async () => {
    const homeDir = await temporaryRoot();
    const invocations: Array<{ readonly packageSpec: string; readonly registryUrl: string }> = [];
    const application = createLocalUpdateApplication({
      control: fakeControl(),
      fetchRegistry: async (url) => {
        expect(url).toBe("https://insider-npm-registry.univer.work/univer-cli");
        return registryMetadata("latest", "0.5.1");
      },
      homeDir,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      packageRoot: homeDir,
      runInstaller: async (invocation) => {
        invocations.push(invocation);
        return { exitCode: 0 };
      },
      version: "0.5.0",
    });

    const result = await application.update({ force: false, progress: () => undefined });

    expect(result).toMatchObject({
      channel: "stable",
      latestVersion: "0.5.1",
      status: "updated",
    });
    expect(invocations).toEqual([
      {
        packageSpec: "univer-cli@0.5.1",
        registryUrl: "https://insider-npm-registry.univer.work/",
      },
    ]);
    await expect(readUpdateCache(homeDir)).resolves.toMatchObject({
      distTag: "latest",
      latestVersion: "0.5.1",
    });
  });

  it("returns one JSON document for an up-to-date update command", async () => {
    const stdout: string[] = [];
    const exitCode = await runCli(["update", "--json"], {
      program: {
        updateApplication: {
          async check() {
            throw new Error("unused");
          },
          async update() {
            return {
              channel: "alpha",
              checkedAt: "2026-08-13T00:00:00.000Z",
              currentVersion: "0.5.0-alpha.1",
              latestVersion: "0.5.0-alpha.1",
              status: "up-to-date",
              target: resolveUpdateTarget("0.5.0-alpha.1"),
              updateAvailable: false,
            };
          },
        },
      },
      streams: { writeErr: () => undefined, writeOut: (text) => stdout.push(text) },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      channel: "alpha",
      status: "up-to-date",
      updateAvailable: false,
    });
  });

  it("blocks linked development checkouts before registry or daemon access", async () => {
    const packageRoot = await temporaryRoot();
    await writeFile(
      join(packageRoot, "package.json"),
      `${JSON.stringify({ name: "univer-cli", private: true, version: "0.5.0" })}\n`,
      "utf8",
    );
    let registryReads = 0;
    let daemonReads = 0;
    const application = createLocalUpdateApplication({
      control: fakeControl({
        async status() {
          daemonReads += 1;
          return { socketPath: "/tmp/univer.sock", state: "stopped" };
        },
      }),
      fetchRegistry: async () => {
        registryReads += 1;
        return registryMetadata("alpha", "0.5.0-alpha.2");
      },
      homeDir: await temporaryRoot(),
      packageRoot,
      version: "0.5.0",
    });

    await expect(
      application.update({ force: true, progress: () => undefined }),
    ).rejects.toMatchObject({ code: "CLI_UPDATE_DEVELOPMENT_LINK" });
    expect(registryReads).toBe(0);
    expect(daemonReads).toBe(0);
  });

  it("recognizes source checkouts as development and packed roots as release", async () => {
    const checkout = await temporaryRoot();
    await mkdir(join(checkout, "src"));
    await mkdir(join(checkout, "scripts"));
    await writeFile(join(checkout, "scripts", "build.mjs"), "", "utf8");
    const packed = await temporaryRoot();

    await expect(isDevelopmentInstallation(checkout)).resolves.toBe(true);
    await expect(isDevelopmentInstallation(packed)).resolves.toBe(false);
  });

  it("preserves a coded machine failure from the update application", async () => {
    const stderr: string[] = [];
    const exitCode = await runCli(["update", "--json"], {
      program: {
        updateApplication: {
          async check() {
            throw new Error("unused");
          },
          async update() {
            throw Object.assign(new Error("daemon must stop"), {
              code: "CLI_UPDATE_FORCE_REQUIRED",
            });
          },
        },
      },
      streams: { writeErr: (text) => stderr.push(text), writeOut: () => undefined },
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stderr.join(""))).toEqual({
      error: { code: "CLI_UPDATE_FORCE_REQUIRED", message: "daemon must stop" },
      ok: false,
    });
  });

  it("shows a fresh cached update once and does not spawn a checker", async () => {
    const homeDir = await temporaryRoot();
    const now = new Date("2026-08-13T12:00:00.000Z");
    await writeCache(homeDir, {
      checkedAt: now.toISOString(),
      distTag: "alpha",
      latestVersion: "0.5.0-alpha.2",
      packageName: "univer-cli",
      registryUrl: "https://insider-npm-registry.univer.work/",
      schemaVersion: 1,
    });
    const messages: string[] = [];
    let spawns = 0;
    const options = startupOptions(homeDir, now, {
      spawnChecker: () => {
        spawns += 1;
      },
      writeErr: (text) => messages.push(text),
    });

    await checkForUpdateAtStartup(options);
    await checkForUpdateAtStartup(options);

    expect(spawns).toBe(0);
    expect(messages).toEqual([
      "Newer Univer CLI v0.5.0-alpha.2 is available on the alpha channel; run `univer update`.\n",
    ]);
  });

  it("wires the cached startup tip into interactive text commands", async () => {
    const homeDir = await temporaryRoot();
    await writeCache(homeDir, {
      checkedAt: new Date().toISOString(),
      distTag: "alpha",
      latestVersion: "0.5.0-alpha.2",
      packageName: "univer-cli",
      registryUrl: "https://insider-npm-registry.univer.work/",
      schemaVersion: 1,
    });
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["doctor"], {
      program: {
        doctor: {
          async check() {
            return { checks: [], ok: true };
          },
          async collect() {
            throw new Error("unused");
          },
        },
        env: { UNIVER_HOME: homeDir },
        interactive: true,
        packageRoot: homeDir,
        version: "0.5.0-alpha.1",
      },
      streams: {
        writeErr: (text) => stderr.push(text),
        writeOut: (text) => stdout.push(text),
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Doctor: ready");
    expect(stderr.join("")).toBe(
      "Newer Univer CLI v0.5.0-alpha.2 is available on the alpha channel; run `univer update`.\n",
    );
  });

  it("starts one detached refresh for stale cache and skips machine-readable invocations", async () => {
    const homeDir = await temporaryRoot();
    const spawns: Array<{
      readonly args: readonly string[];
      readonly command: string;
      readonly env: NodeJS.ProcessEnv;
    }> = [];
    const now = new Date("2026-08-13T12:00:00.000Z");
    const options = startupOptions(homeDir, now, {
      spawnChecker: (command, args, env) => spawns.push({ args, command, env }),
    });

    await checkForUpdateAtStartup({ ...options, json: true });
    await checkForUpdateAtStartup(options);
    await checkForUpdateAtStartup(options);

    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toMatchObject({ args: ["/tmp/univer-bin.js"], command: process.execPath });
    expect(spawns[0]?.env).toMatchObject({
      UNIVER_CLI_INTERNAL_UPDATE_CHECK: "1",
      UNIVER_CLI_UPDATE_CHECK_LOCK: join(homeDir, "updates", "check.lock"),
    });
  });

  it("does not start a background checker for a development checkout", async () => {
    const homeDir = await temporaryRoot();
    const packageRoot = await temporaryRoot();
    await writeFile(
      join(packageRoot, "package.json"),
      `${JSON.stringify({ name: "univer-cli", private: true, version: "0.5.0" })}\n`,
      "utf8",
    );
    let spawns = 0;

    await checkForUpdateAtStartup(
      startupOptions(homeDir, new Date(), {
        packageRoot,
        spawnChecker: () => {
          spawns += 1;
        },
      }),
    );

    expect(spawns).toBe(0);
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "univer-update-test-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "univer-cli", private: false, version: "0.5.0" })}\n`,
    "utf8",
  );
  return root;
}

function startupOptions(
  homeDir: string,
  now: Date,
  overrides: Partial<Parameters<typeof checkForUpdateAtStartup>[0]> = {},
): Parameters<typeof checkForUpdateAtStartup>[0] {
  const env = { UNIVER_HOME: homeDir };
  return {
    config: createApplicationConfig(resolveApplicationPaths(env)),
    entryPath: "/tmp/univer-bin.js",
    env,
    homeDir,
    interactive: true,
    json: false,
    now,
    packageRoot: homeDir,
    version: "0.5.0-alpha.1",
    writeErr: () => undefined,
    ...overrides,
  };
}

async function writeCache(homeDir: string, value: unknown): Promise<void> {
  const directory = join(homeDir, "updates");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "latest.json"), `${JSON.stringify(value)}\n`, "utf8");
}

function registryMetadata(tag: "alpha" | "insiders" | "latest", version: string): unknown {
  return {
    "dist-tags": { [tag]: version },
    versions: { [version]: { dist: { tarball: `https://example.test/${version}.tgz` } } },
  };
}

function fakeControl(overrides: Partial<DaemonControl> = {}): DaemonControl {
  return {
    async restart() {
      return { ...runningStatus(), restarted: true };
    },
    async start() {
      return { ...runningStatus(), started: true };
    },
    async status() {
      return { socketPath: "/tmp/univer.sock", state: "stopped" };
    },
    async stop() {
      return { socketPath: "/tmp/univer.sock", state: "stopped", stopped: true };
    },
    ...overrides,
  };
}

function runningStatus() {
  return {
    identity: { id: "univer-cli", version: "0.5.0" },
    pid: 42,
    protocolVersion: 1,
    socketPath: "/tmp/univer.sock",
    startedAt: new Date(0).toISOString(),
    state: "running" as const,
  };
}
