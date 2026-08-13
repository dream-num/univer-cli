import type { Config } from "@univer-cli/config";
import type { DaemonControl, DaemonStatus } from "@univer-cli/daemon";
import type { UniverRenderBrowserSetupCommandDependencies } from "@univer-cli/unit-screenshot-command";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDoctor } from "../src/features/doctor/model.js";
import { createLocalDoctor } from "../src/features/doctor/service.js";
import type { ApplicationPaths } from "../src/environment/paths.js";

describe("Local doctor", () => {
  it("normalizes the default collection scope and rejects conflicting windows", async () => {
    const scopes: unknown[] = [];
    const doctor = createDoctor({
      checks: [],
      collector: {
        async collect(scope) {
          scopes.push(scope);
          return { files: [], outputPath: "/tmp/diagnostics", warnings: [] };
        },
      },
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });

    await doctor.collect();

    expect(scopes).toEqual([
      {
        all: false,
        createdAt: "2026-08-13T00:00:00.000Z",
        defaultWindow: true,
        last: "2h",
        since: "2026-08-12T22:00:00.000Z",
      },
    ]);
    await expect(doctor.collect({ all: true, last: "1h" })).rejects.toMatchObject({
      code: "DOCTOR_INVALID_COLLECT_SCOPE",
    });
  });

  it("reports application checks without making an optional browser a global failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-doctor-check-"));
    try {
      const doctor = createLocalDoctor({
        browserSetup: missingBrowser(),
        config: fakeConfig(join(root, "config.json")),
        control: fakeControl({ socketPath: join(root, "daemon.sock"), state: "stopped" }),
        cwd: root,
        paths: applicationPaths(root),
        version: "test-version",
      });

      await expect(doctor.check()).resolves.toMatchObject({
        checks: [
          { name: "config", ok: true },
          { message: "stopped", name: "daemon", ok: true },
          {
            message: "missing; run `univer screenshot setup`",
            name: "screenshot-browser",
            ok: true,
          },
        ],
        ok: true,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("collects a private, redacted diagnostic bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-doctor-collect-"));
    try {
      const status = {
        diagnostic: {
          message:
            "Bearer top-secret https://user:password@example.test/health?token=top-secret#private",
        },
        privateToken: "top-secret",
        socketPath: join(root, "daemon.sock"),
        state: "unreachable",
      } as unknown as DaemonStatus;
      const doctor = createLocalDoctor({
        browserSetup: missingBrowser(),
        config: fakeConfig(join(root, "config.json")),
        control: fakeControl(status),
        cwd: root,
        paths: applicationPaths(root),
        version: "test-version",
      });

      const result = await doctor.collect({ all: true, output: "diagnostics" });
      const contents = await Promise.all(
        result.files.map(async (path) => await readFile(path, "utf8")),
      );

      expect(result.outputPath).toBe(join(root, "diagnostics"));
      expect(result.files).toHaveLength(4);
      expect((await stat(result.outputPath)).mode & 0o777).toBe(0o700);
      for (const path of result.files) expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(contents.join("\n")).not.toContain("top-secret");
      expect(contents.join("\n")).not.toContain("user:password");
      expect(contents.join("\n")).toContain("<redacted>");
      expect(contents.join("\n")).toContain("https://example.test/health");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

function applicationPaths(root: string): ApplicationPaths {
  return {
    configPath: join(root, "config.json"),
    daemonDir: join(root, "daemon"),
    homeDir: root,
    socketPath: join(root, "daemon", "daemon.sock"),
  };
}

function fakeConfig(path: string): Config {
  return {
    async get() {
      throw new Error("unused");
    },
    async list() {
      return [
        {
          defaultValue: 9123,
          description: "Gateway port",
          key: "collabGateway.port",
          source: "default" as const,
          value: 9123,
        },
      ];
    },
    path,
    async set() {
      throw new Error("unused");
    },
    async setFromText() {
      throw new Error("unused");
    },
    async unset() {
      throw new Error("unused");
    },
  };
}

function fakeControl(status: DaemonStatus): DaemonControl {
  return {
    async restart() {
      throw new Error("unused");
    },
    async start() {
      throw new Error("unused");
    },
    async status() {
      return status;
    },
    async stop() {
      throw new Error("unused");
    },
  };
}

function missingBrowser(): UniverRenderBrowserSetupCommandDependencies {
  return {
    async install() {
      throw new Error("unused");
    },
    async probe() {},
    async resolve() {
      return {
        cacheDir: "/tmp/univer-browsers",
        checkedPaths: [],
        envVar: "UNIVER_RENDER_BROWSER",
        status: "missing",
      };
    },
  };
}
