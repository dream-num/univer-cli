import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDaemonClient, createDaemonControl } from "@univer-cli/daemon";
import { expect, it } from "vitest";
import { applicationDaemonIdentity } from "../src/daemon/identity.js";
import { resolveApplicationPaths } from "../src/environment/paths.js";
import { CONTENT_CREATE_DOCUMENT_METHOD } from "../src/features/typst/protocol.js";

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  await new Promise<void>((closed, reject) =>
    server.close((error) => (error ? reject(error) : closed())),
  );
  return address.port;
}

it.each([true, false])(
  "defers source daemon headless imports until document authoring (unavailable: %s)",
  async (unavailable) => {
    const directory = await mkdtemp(join(tmpdir(), "univer-cli-daemon-startup-"));
    const assets = join(directory, "assets");
    const marker = join(directory, "headless-imported.txt");
    const loader = join(directory, "headless-loader.mjs");
    const tracker = join(directory, "track-exit.mjs");
    await mkdir(join(assets, "collab-web"), { recursive: true });
    await mkdir(join(assets, "assets"));
    await writeFile(join(assets, "index.html"), "<!doctype html><title>Render entry</title>");
    await writeFile(
      join(assets, "collab-web/index.html"),
      "<!doctype html><title>Viewer entry</title>",
    );
    await writeFile(
      loader,
      `
import { writeFileSync } from 'node:fs';
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@univer-cli/headless-univer') {
    writeFileSync(${JSON.stringify(marker)}, 'headless requested');
    ${unavailable ? "throw new Error('LOCAL_DAEMON_HEADLESS_IMPORT_PROBE');" : ""}
  }
  return await nextResolve(specifier, context);
}
`,
    );
    await writeFile(
      tracker,
      `
import { writeFileSync } from 'node:fs';
import { isMainThread } from 'node:worker_threads';
if (isMainThread) process.once('exit', exitCode => writeFileSync(new URL('./exit-' + process.pid + '.json', import.meta.url), JSON.stringify({ exitCode })));
if (isMainThread) process.on('uncaughtExceptionMonitor', error => writeFileSync(new URL('./startup-error.json', import.meta.url), JSON.stringify({ message: error.message, stack: error.stack })));
`,
    );
    const require = createRequire(import.meta.url);
    const env = {
      ...process.env,
      UNIVER_HOME: directory,
      UNIVER_COLLAB_GATEWAY_PORT: String(await availablePort()),
      UNIVER_CLI_DAEMON_ENTRY: new URL("../src/daemon-entry.ts", import.meta.url).href,
      UNIVER_CLI_VIEW_ASSETS_ROOT: assets,
      UNIVER_CLI_UPDATE_CHECK: "0",
      NODE_OPTIONS: `--import=${pathToFileURL(require.resolve("tsx")).href} --import=${pathToFileURL(tracker).href} --loader=${pathToFileURL(loader).href}`,
    };
    const options = {
      entry: new URL("../src/daemon-entry.ts", import.meta.url),
      env,
      identity: applicationDaemonIdentity(env),
      socketPath: resolveApplicationPaths(env).socketPath,
      requestTimeoutMs: 180_000,
    };
    const control = createDaemonControl(options);
    const client = createDaemonClient(options);
    async function run(args: readonly string[]): Promise<unknown> {
      return await new Promise((resolveResult, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(new URL("../src/bin.ts", import.meta.url)), ...args],
          {
            env,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.once("error", reject);
        child.once("close", (code) => {
          if (code !== 0) reject(new Error(`Source CLI exited ${String(code)}: ${stderr}`));
          else {
            try {
              resolveResult(JSON.parse(stdout));
            } catch (error) {
              reject(error);
            }
          }
        });
      });
    }
    try {
      const started = await control.start().catch(async (error: unknown) => {
        const diagnostic = await readFile(join(directory, "startup-error.json"), "utf8").catch(
          () => undefined,
        );
        if (diagnostic) throw new Error(diagnostic, { cause: error });
        throw error;
      });
      expect(started.state).toBe("running");
      expect((await control.status()).state).toBe("running");
      await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      const file = join(directory, "probe.univer");
      await run(["new", file, "--json"]);
      const worktree = (await run([
        "worktree",
        "add",
        file,
        "--name",
        "Startup probe",
        "--json",
      ])) as { worktreeId: string };
      await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      const request = {
        path: file,
        worktreeId: worktree.worktreeId,
        unitId: "startup-doc",
        name: "Startup document",
        code: `univerAPI.createDocument(${JSON.stringify({ id: "startup-doc", body: { dataStream: "Probe\r\n" } })});`,
      };
      if (unavailable) {
        await expect(client.request(CONTENT_CREATE_DOCUMENT_METHOD, request)).rejects.toThrow(
          "LOCAL_DAEMON_HEADLESS_IMPORT_PROBE",
        );
        await expect(client.request(CONTENT_CREATE_DOCUMENT_METHOD, request)).rejects.toThrow(
          "LOCAL_DAEMON_HEADLESS_IMPORT_PROBE",
        );
      } else {
        expect(await client.request(CONTENT_CREATE_DOCUMENT_METHOD, request)).toMatchObject({
          unitId: "startup-doc",
          kind: "doc",
        });
      }
      expect(await readFile(marker, "utf8")).toBe("headless requested");
      await control.stop();
      await expect
        .poll(
          async () =>
            JSON.parse(await readFile(join(directory, `exit-${started.pid}.json`), "utf8"))
              .exitCode,
        )
        .toBe(0);
    } finally {
      await control.stop();
      expect(resolve(directory).startsWith(resolve(tmpdir()) + sep)).toBe(true);
      await rm(directory, { recursive: true, force: true });
    }
  },
  120_000,
);
