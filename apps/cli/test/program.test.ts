import { describe, expect, it } from "vitest";
import type { DaemonControl } from "@univer-cli/daemon";
import packageMetadata from "../package.json" with { type: "json" };
import type { LocalUniverfileApplication } from "../src/features/univerfile/service.js";
import { runCli } from "../src/cli.js";
import { createProgram, PROGRAM_NAME } from "../src/program.js";

describe("univer local CLI composition", () => {
  it("provides symmetric development link scripts", () => {
    expect(packageMetadata.scripts["link:cli"]).toBe("pnpm build && npm link");
    expect(packageMetadata.scripts["unlink:cli"]).toBe("npm unlink --global univer-cli");
  });

  it("does not depend on retired SDK feature packages", () => {
    for (const name of [
      "@univer-cli/doctor",
      "@univer-cli/doctor-command",
      "@univer-cli/skills",
      "@univer-cli/skills-command",
      "@univer-cli/unit-exchange",
      "@univerjs-pro/uexcli",
    ]) {
      expect(packageMetadata.dependencies, name).not.toHaveProperty(name);
    }
  });

  it("keeps the production program name and exposes only the Lite composition", () => {
    const program = createProgram();

    expect(PROGRAM_NAME).toBe("univer");
    expect(program.name()).toBe("univer");
    expect(program.description()).toBe(
      "Agent-friendly authoring and verification for office content",
    );
    expect(program.version()).toBe("0.0.0");
    expect(program.commands.map((command) => command.name())).toEqual([
      "new",
      "open",
      "status",
      "import",
      "export",
      "worktree",
      "unit",
      "execute",
      "inspect",
      "lint",
      "screenshot",
      "print",
      "compile-svg",
      "compile-typst",
      "resources",
      "api",
      "optimize",
      "config",
      "doctor",
      "skills",
      "update",
      "daemon",
    ]);
  });

  it("groups root help by user workflow while preserving native Commander help", () => {
    const help = createProgram().helpInformation();
    const sections = [
      ["Univerfile:", ["new", "open", "status"]],
      ["Data Exchange:", ["import", "export"]],
      ["Collaboration:", ["worktree"]],
      ["Unit Operations:", ["unit", "execute", "inspect", "lint"]],
      ["Rendering:", ["screenshot", "print"]],
      ["Authoring:", ["compile-svg", "compile-typst"]],
      ["Resources & Reference:", ["resources", "api"]],
      ["Data Maintenance:", ["optimize"]],
      ["System:", ["config", "doctor", "skills", "update", "daemon", "help"]],
    ] as const;

    let sectionStart = -1;
    for (const [heading, commands] of sections) {
      const nextSectionStart = help.indexOf(heading);
      expect(nextSectionStart, `${heading} should follow the previous help group`).toBeGreaterThan(
        sectionStart,
      );
      sectionStart = nextSectionStart;
      for (const command of commands) {
        expect(help.slice(sectionStart), `${command} should appear in ${heading}`).toMatch(
          new RegExp(`^  ${command}(?: |$)`, "mu"),
        );
      }
    }
  });

  it("composes the version-matched application Skill library", async () => {
    const output: string[] = [];
    const program = createProgram({
      output: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    }).exitOverride();

    await program.parseAsync(["skills", "list", "--json"], { from: "user" });

    expect(JSON.parse(output.join(""))).toMatchObject({
      skills: [
        { name: "core" },
        { name: "sheet" },
        { name: "doc" },
        { name: "slide" },
        { name: "base" },
        { name: "board" },
        { name: "embed" },
        { name: "cross-unit-formula" },
      ],
    });
  });

  it("composes the application-owned doctor command", async () => {
    const output: string[] = [];
    const program = createProgram({
      doctor: {
        async check() {
          return { checks: [{ message: "ready", name: "application", ok: true }], ok: true };
        },
        async collect() {
          throw new Error("unused");
        },
      },
      output: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    }).exitOverride();

    await program.parseAsync(["doctor", "--json"], { from: "user" });

    expect(JSON.parse(output.join(""))).toEqual({
      checks: [{ message: "ready", name: "application", ok: true }],
      ok: true,
    });
  });

  it("adds application Gateway information to daemon status text", async () => {
    const output: string[] = [];
    let starts = 0;
    const program = createProgram({
      daemonControl: fakeDaemonControl({
        async start() {
          starts += 1;
          return { ...runningDaemonStatus(), started: true };
        },
        async status() {
          return runningDaemonStatus();
        },
      }),
      daemonGatewayInfo: async () => ({
        origin: "http://127.0.0.1:9234",
        port: 9234,
        viewUrl: "http://127.0.0.1:9234/",
      }),
      output: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    }).exitOverride();

    await program.parseAsync(["daemon", "status"], { from: "user" });

    expect(output.join("")).toContain("Daemon: running\nIdentity: univer-cli");
    expect(output.join("")).toContain(
      "Gateway: running\nGateway origin: http://127.0.0.1:9234\nGateway view: http://127.0.0.1:9234/",
    );
    expect(starts).toBe(0);
  });

  it("adds a non-fatal Gateway diagnostic to daemon status JSON", async () => {
    const output: string[] = [];
    const program = createProgram({
      daemonControl: fakeDaemonControl({
        async status() {
          return runningDaemonStatus();
        },
      }),
      daemonGatewayInfo: async () => {
        throw Object.assign(new Error("Gateway RPC failed"), { code: "ECONNRESET" });
      },
      output: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    }).exitOverride();

    await program.parseAsync(["daemon", "status", "--json"], { from: "user" });

    expect(JSON.parse(output.join(""))).toMatchObject({
      state: "running",
      gateway: {
        diagnostic: { code: "ECONNRESET", message: "Gateway RPC failed" },
        state: "unreachable",
      },
    });
  });

  it("composes the CLI SDK API reference command", async () => {
    const output: string[] = [];
    const program = createProgram({
      output: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    }).exitOverride();

    await program.parseAsync(["api", "find", "setValues"], { from: "user" });

    expect(output.join("\n")).toContain("FRange.setValues");
  });

  it("composes the SDK resource catalog from the published CLI asset manifest", async () => {
    const output: string[] = [];
    const program = createProgram({
      env: { UNIVER_HOME: "/tmp/univer-cli-resource-test" },
      output: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    }).exitOverride();

    await program.parseAsync(["resources", "registries", "--json"], { from: "user" });

    expect(JSON.parse(output.join(""))).toMatchObject({
      registries: [
        { id: "boards-local-svgl" },
        { id: "example-tabler-outline" },
        { id: "example-tabler-filled" },
        { id: "example-openmoji-color" },
        { id: "example-openmoji-black" },
        { id: "example-undraw-illustrations" },
      ],
    });
  });

  it("does not advertise legacy interface selectors", () => {
    const help = createProgram().helpInformation();

    expect(help).toContain("Usage: univer");
    expect(help).toContain("api");
    expect(help).not.toContain("SAC");
    expect(help).not.toContain("univer-sac");
    expect(help).not.toContain("univer-lite");
  });

  it("composes the Local Univerfile application commands", async () => {
    const output: string[] = [];
    const created: string[] = [];
    const application = fakeApplication({
      async create({ path }) {
        created.push(path);
        return { filePath: "/tmp/book.univer" };
      },
    });
    const program = createProgram({
      univerfileApplication: application,
      output: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    }).exitOverride();

    await program.parseAsync(["new", "book.univer", "--json"], { from: "user" });

    expect(created).toEqual(["book.univer"]);
    expect(JSON.parse(output.join(""))).toEqual({ filePath: "/tmp/book.univer" });
  });

  it("accepts an explicit trunk scope for status", async () => {
    const output: string[] = [];
    let statusInput: unknown;
    const exitCode = await runCli(["status", "book.univer", "--trunk", "--json"], {
      program: {
        univerfileApplication: fakeApplication({
          async status(input) {
            statusInput = input;
            return {
              filePath: input.path,
              scope: "trunk",
              units: [],
              upgrade: { status: "unchanged", format: "v2" },
            };
          },
        }),
      },
      streams: {
        writeErr: (text) => output.push(text),
        writeOut: (text) => output.push(text),
      },
    });

    expect(exitCode).toBe(0);
    expect(statusInput).toEqual({ path: "book.univer" });
    expect(JSON.parse(output.join(""))).toMatchObject({ scope: "trunk", units: [] });
  });

  it("writes one machine failure document to stderr", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const failure = Object.assign(new Error("missing file"), {
      code: "UNIVERFILE_NOT_FOUND",
    });

    const exitCode = await runCli(["status", "missing.univer", "--json"], {
      program: {
        univerfileApplication: fakeApplication({
          async status() {
            throw failure;
          },
        }),
      },
      streams: {
        writeErr: (text) => stderr.push(text),
        writeOut: (text) => stdout.push(text),
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(JSON.parse(stderr.join(""))).toEqual({
      ok: false,
      error: { code: "UNIVERFILE_NOT_FOUND", message: "missing file" },
    });
  });

  it("keeps Commander text errors when --json was not a recognized command option", async () => {
    const stderr: string[] = [];

    const exitCode = await runCli(["--json"], {
      streams: {
        writeErr: (text) => stderr.push(text),
        writeOut: () => undefined,
      },
    });

    expect(exitCode).toBeGreaterThan(0);
    expect(stderr.join("")).toContain("unknown option '--json'");
    expect(() => JSON.parse(stderr.join(""))).toThrow();
  });
});

function fakeApplication(
  overrides: Partial<LocalUniverfileApplication> = {},
): LocalUniverfileApplication {
  return {
    async create({ path }) {
      return { filePath: path };
    },
    async open({ path }) {
      return {
        filePath: path,
        openUrl: "http://127.0.0.1/",
        upgrade: { status: "unchanged", format: "v2" },
      };
    },
    async status({ path }) {
      return {
        filePath: path,
        scope: "trunk",
        units: [],
        upgrade: { status: "unchanged", format: "v2" },
      };
    },
    ...overrides,
  };
}

function fakeDaemonControl(overrides: Partial<DaemonControl> = {}): DaemonControl {
  return {
    async restart() {
      return { ...runningDaemonStatus(), restarted: true };
    },
    async start() {
      return { ...runningDaemonStatus(), started: true };
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

function runningDaemonStatus() {
  return {
    identity: { id: "univer-cli", version: "0.5.0" },
    pid: 42,
    protocolVersion: 1,
    socketPath: "/tmp/univer.sock",
    startedAt: new Date(0).toISOString(),
    state: "running" as const,
  };
}
