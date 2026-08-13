import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { UniverCollaborationRuntimePool } from "@univer-cli/univer-collaboration-runtime-pool";
import { UniverInstanceType } from "@univerjs/core";
import {
  createApplicationConfig,
  resolveGatewayPort,
  resolveRuntimeLicense,
} from "../src/environment/config.js";
import { UNIVER_LICENSE } from "../src/license.js";
import { readApplicationDaemonStatus } from "../src/daemon/status.js";
import { createDaemonControlWithLegacyTakeover } from "../src/daemon/control.js";
import { resolveApplicationPaths, resolveDaemonSocketPath } from "../src/environment/paths.js";
import {
  createLocalCollaborationRuntimePool,
  type LocalRuntimeWorkerInit,
} from "../src/daemon/collaboration-runtime-pool.js";
import { resolveLocalUniverfile } from "../src/environment/univerfile-path.js";
import type { DaemonControl, DaemonStatus } from "@univer-cli/daemon";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(async (directory) => await rm(directory, { recursive: true, force: true })),
  );
});

describe("Local Univer application adapters", () => {
  it("uses the shared UNIVER_HOME paths and preserves unknown config fields", async () => {
    const home = await temporaryDirectory();
    const paths = resolveApplicationPaths({ UNIVER_HOME: home });
    await writeFile(paths.configPath, JSON.stringify({ future: { flag: true } }), { mode: 0o600 });
    const config = createApplicationConfig(paths);

    expect(await resolveRuntimeLicense(config, {})).toBe(UNIVER_LICENSE);

    await config.setFromText({ key: "collabGateway.port", text: "9234" });
    await config.setFromText({ key: "univerRuntime.license", text: "config-license" });

    expect(await resolveGatewayPort(config, {})).toBe(9234);
    expect(await resolveGatewayPort(config, { UNIVER_COLLAB_GATEWAY_PORT: "9345" })).toBe(9345);
    expect(await resolveRuntimeLicense(config, {})).toBe("config-license");
    expect(await resolveRuntimeLicense(config, { UNIVER_LICENSE: "env-license" })).toBe(
      "env-license",
    );
    expect(JSON.parse(await readFile(paths.configPath, "utf8"))).toMatchObject({
      collabGateway: { port: 9234 },
      future: { flag: true },
    });
    expect(paths.socketPath).toBe(resolveDaemonSocketPath(home));
  });

  it("does not rewrite existing cache, update, or telemetry identity state", async () => {
    const home = await temporaryDirectory();
    const paths = resolveApplicationPaths({ UNIVER_HOME: home });
    const sentinels = new Map([
      [join(home, "browsers", "state.json"), '{"browser":"existing"}\n'],
      [join(home, "cache", "resources", "index.json"), '{"cache":"existing"}\n'],
      [join(home, "updates", "latest.json"), '{"version":"existing"}\n'],
      [
        join(home, "telemetry", "state.json"),
        '{"anonymousInstallId":"existing-install","firstOpen":true}\n',
      ],
    ]);
    for (const [path, contents] of sentinels) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, { mode: 0o600 });
    }

    await createApplicationConfig(paths).setFromText({
      key: "collabGateway.port",
      text: "9234",
    });

    for (const [path, contents] of sentinels) {
      expect(await readFile(path, "utf8")).toBe(contents);
    }
  });

  it("matches the legacy long-path socket fallback", () => {
    const path = resolveDaemonSocketPath(`/tmp/${"a".repeat(100)}`);
    expect(path).toMatch(/^\/tmp\/univer-[a-f0-9]{16}\.sock$/u);
  });

  it("accepts local paths and file URLs but rejects remote targets", () => {
    expect(resolveLocalUniverfile("book.univer", "/tmp")).toBe("/tmp/book.univer");
    expect(resolveLocalUniverfile("file:///tmp/book.univer")).toBe("/tmp/book.univer");
    expect(() => resolveLocalUniverfile("https://example.com/book.univer")).toThrow(
      /local path or file: URL/,
    );
  });

  it("takes over only a verified legacy univer-cli daemon", async () => {
    const events: string[] = [];
    let current: DaemonStatus = incompatibleLegacyStatus();
    const base = fakeControl({
      async start() {
        events.push("start");
        current = runningStatus(200);
        return { ...current, started: true };
      },
      async status() {
        return current;
      },
    });
    const control = createDaemonControlWithLegacyTakeover({
      control: base,
      identity: { id: "univer-cli", version: "0.5.0" },
      legacy: {
        async health() {
          return {
            distributionId: "univer-cli",
            pid: 100,
            socketPath: "/tmp/univer.sock",
            startedAt: new Date(0).toISOString(),
          };
        },
        async shutdown() {
          events.push("legacy-stop");
          current = { socketPath: "/tmp/univer.sock", state: "stopped" };
        },
      },
      socketPath: "/tmp/univer.sock",
    });

    const result = await control.start();

    expect(events).toEqual(["legacy-stop", "start"]);
    expect(result.pid).toBe(200);
  });

  it("does not stop or attach a daemon with another identity", async () => {
    const events: string[] = [];
    const control = createDaemonControlWithLegacyTakeover({
      control: fakeControl({
        async status() {
          return incompatibleLegacyStatus();
        },
      }),
      identity: { id: "univer-cli", version: "0.5.0" },
      legacy: {
        async health() {
          return {
            distributionId: "another-product",
            pid: 100,
            socketPath: "/tmp/univer.sock",
            startedAt: new Date(0).toISOString(),
          };
        },
        async shutdown() {
          events.push("foreign-stop");
        },
      },
      socketPath: "/tmp/univer.sock",
    });

    await expect(control.status()).resolves.toMatchObject({
      actual: { identity: { id: "another-product" } },
      reason: "identity-mismatch",
      state: "incompatible",
    });
    expect(events).toEqual([]);
  });

  it("surfaces the daemon startup cause instead of a generic timeout", async () => {
    const home = await temporaryDirectory();
    const socketPath = join(home, "daemon", "daemon.sock");
    const control = createDaemonControlWithLegacyTakeover({
      control: fakeControl({
        async start() {
          await mkdir(dirname(socketPath), { recursive: true });
          await writeFile(
            join(dirname(socketPath), "startup-error.json"),
            '{"code":"EADDRINUSE","message":"listen EADDRINUSE: 127.0.0.1:9123"}\n',
          );
          throw Object.assign(new Error("Daemon did not start within 10000ms"), {
            code: "DAEMON_START_TIMEOUT",
          });
        },
        async status() {
          return { socketPath, state: "stopped" };
        },
      }),
      identity: { id: "univer-cli", version: "0.5.0" },
      legacy: {
        async health() {
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
        async shutdown() {},
      },
      socketPath,
    });

    await expect(control.start()).rejects.toMatchObject({
      code: "EADDRINUSE",
      message: "listen EADDRINUSE: 127.0.0.1:9123",
    });
  });

  it("combines running daemon health with application Gateway information", async () => {
    await expect(
      readApplicationDaemonStatus(
        fakeControl({ status: async () => runningStatus(42) }),
        async () => ({
          origin: "http://127.0.0.1:9234",
          port: 9234,
          viewUrl: "http://127.0.0.1:9234/",
        }),
      ),
    ).resolves.toEqual({
      daemon: runningStatus(42),
      gateway: {
        origin: "http://127.0.0.1:9234",
        port: 9234,
        state: "running",
        viewUrl: "http://127.0.0.1:9234/",
      },
    });
  });

  it("reports a Gateway diagnostic without changing running daemon health", async () => {
    await expect(
      readApplicationDaemonStatus(
        fakeControl({ status: async () => runningStatus(42) }),
        async () => {
          throw Object.assign(new Error("Gateway RPC failed"), { code: "ECONNRESET" });
        },
      ),
    ).resolves.toEqual({
      daemon: runningStatus(42),
      gateway: {
        diagnostic: { code: "ECONNRESET", message: "Gateway RPC failed" },
        state: "unreachable",
      },
    });
  });

  it("does not probe or start Gateway when the daemon is stopped", async () => {
    let probes = 0;
    const result = await readApplicationDaemonStatus(fakeControl({}), async () => {
      probes += 1;
      throw new Error("unexpected");
    });

    expect(result).toEqual({
      daemon: { socketPath: "/tmp/univer.sock", state: "stopped" },
      gateway: { state: "stopped" },
    });
    expect(probes).toBe(0);
  });

  it("maps Local targets to opaque CLI SDK runtime-pool leases", async () => {
    let acquired: unknown;
    let released = false;
    let closed = false;
    const pool = {
      async acquire(input: unknown) {
        acquired = input;
        return {
          async getState() {
            return runtimeState();
          },
          async release() {
            released = true;
          },
        };
      },
      async close() {
        closed = true;
      },
    } as unknown as UniverCollaborationRuntimePool<LocalRuntimeWorkerInit>;
    const runtimes = createLocalCollaborationRuntimePool({
      entry: new URL("file:///tmp/runtime-worker.js"),
      origin: "http://127.0.0.1:9123",
      pool,
    });

    await expect(
      runtimes.probe({
        filePath: "/tmp/book.univer",
        unitId: "unit-1",
        unitType: UniverInstanceType.UNIVER_SHEET,
        worktreeId: "wt-1",
      }),
    ).resolves.toEqual(runtimeState());
    expect(acquired).toMatchObject({
      init: {
        unitId: "unit-1",
        unitType: UniverInstanceType.UNIVER_SHEET,
        server: {
          snapshotServerUrl:
            "http://127.0.0.1:9123/uf/L3RtcC9ib29rLnVuaXZlcg/worktrees/wt-1/universer-api/snapshot",
        },
      },
    });
    expect(released).toBe(true);

    await runtimes.close();
    expect(closed).toBe(true);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "univer-cli-app-"));
  directories.push(directory);
  return directory;
}

function fakeControl(overrides: Partial<DaemonControl>): DaemonControl {
  return {
    async restart() {
      return { ...runningStatus(1), restarted: true };
    },
    async start() {
      return { ...runningStatus(1), started: true };
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

function runningStatus(pid: number) {
  return {
    identity: { id: "univer-cli", version: "0.5.0" },
    pid,
    protocolVersion: 1,
    socketPath: "/tmp/univer.sock",
    startedAt: new Date(0).toISOString(),
    state: "running" as const,
  };
}

function incompatibleLegacyStatus(): DaemonStatus {
  return {
    actual: {
      identity: { id: "univer-cli", version: "legacy" },
      pid: 100,
      protocolVersion: 0,
      socketPath: "/tmp/univer.sock",
      startedAt: new Date(0).toISOString(),
    },
    expected: {
      identity: { id: "univer-cli", version: "0.5.0" },
      protocolVersion: 1,
    },
    reason: "legacy-protocol",
    socketPath: "/tmp/univer.sock",
    state: "incompatible",
  };
}

function runtimeState() {
  return {
    awaitingChangeset: null,
    baseRevision: 1,
    bufferedChangesetCount: 0,
    conflict: null,
    connection: "online" as const,
    knownHeadRevision: 1,
    pendingMutationCount: 0,
  };
}
