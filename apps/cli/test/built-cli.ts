import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";

export const projectRoot = join(import.meta.dirname, "..");
export const executable = join(projectRoot, "dist", "bin.js");
const execFileAsync = promisify(execFile);

export async function invoke(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ readonly stderr: string; readonly stdout: string }> {
  return await execFileAsync(process.execPath, [executable, ...argv], {
    cwd: projectRoot,
    encoding: "utf8",
    env,
    timeout: 180_000,
  });
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Failed to allocate a loopback port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return address.port;
}
