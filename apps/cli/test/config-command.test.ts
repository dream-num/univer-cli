import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(async (directory) => await rm(directory, { recursive: true, force: true })),
  );
});

describe("application config command", () => {
  it("composes the SDK path/list contract without creating config on read", async () => {
    const home = await temporaryHome();
    const configPath = join(home, "config.json");

    const path = await invoke(["config", "path", "--json"], home);
    expect(path.exitCode).toBe(0);
    expect(JSON.parse(path.stdout)).toEqual({ path: configPath });
    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });

    const listed = await invoke(["config", "list", "--json"], home);
    expect(listed.exitCode).toBe(0);
    const entries = (JSON.parse(listed.stdout) as { readonly entries: readonly unknown[] }).entries;
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "collabGateway.port", source: "default", value: 9123 }),
        expect.objectContaining({ key: "screenshot.maxPages", source: "unset" }),
        expect.objectContaining({ key: "screenshot.maxPixels", source: "unset" }),
        expect.objectContaining({ key: "update.checkOnStartup", source: "unset" }),
        expect.objectContaining({ key: "univerRuntime.license", source: "unset" }),
      ]),
    );
    expect(JSON.stringify(entries)).not.toContain("univerHost");
    expect(JSON.stringify(entries)).not.toContain("defaultInterface");
    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("sets, gets, and unsets registered values while preserving unknown fields", async () => {
    const home = await temporaryHome();
    const configPath = join(home, "config.json");
    await writeFile(configPath, JSON.stringify({ future: { enabled: true } }), { mode: 0o600 });

    const set = await invoke(["config", "set", "collabGateway.port", "9234", "--json"], home);
    expect(set.exitCode).toBe(0);
    expect(JSON.parse(set.stdout)).toMatchObject({
      entry: { key: "collabGateway.port", source: "config", value: 9234 },
    });
    const get = await invoke(["config", "get", "collabGateway.port", "--json"], home);
    expect(JSON.parse(get.stdout)).toMatchObject({
      entry: { key: "collabGateway.port", source: "config", value: 9234 },
    });
    expect(JSON.parse(await readFile(configPath, "utf8"))).toMatchObject({
      collabGateway: { port: 9234 },
      future: { enabled: true },
    });

    const unset = await invoke(["config", "unset", "collabGateway.port", "--json"], home);
    expect(JSON.parse(unset.stdout)).toMatchObject({
      entry: { key: "collabGateway.port", source: "default", value: 9123 },
    });
    expect(JSON.parse(await readFile(configPath, "utf8"))).toMatchObject({
      future: { enabled: true },
    });
  });

  it("uses SDK validation and returns one machine failure for retired keys", async () => {
    const home = await temporaryHome();
    const result = await invoke(
      ["config", "set", "univerHost", "https://example.com", "--json"],
      home,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: {
        code: "config.failed",
        message: expect.stringContaining("CONFIG_UNKNOWN_KEY"),
      },
    });
  });
});

async function invoke(
  argv: readonly string[],
  home: string,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const exitCode = await runCli(argv, {
    program: { env: { UNIVER_HOME: home } },
    streams: {
      writeErr: (text) => stderr.push(text),
      writeOut: (text) => stdout.push(text),
    },
  });
  return { exitCode, stderr: stderr.join(""), stdout: stdout.join("") };
}

async function temporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "univer-config-command-"));
  directories.push(home);
  await chmod(home, 0o700);
  expect((await stat(home)).mode & 0o777).toBe(0o700);
  return home;
}
