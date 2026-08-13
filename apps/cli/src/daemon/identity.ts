import type { DaemonIdentity } from "@univer-cli/daemon";
import packageMetadata from "../../package.json" with { type: "json" };

export function applicationDaemonIdentity(env: NodeJS.ProcessEnv = process.env): DaemonIdentity {
  const buildId = env["UNIVER_CLI_BUILD_ID"]?.trim();
  return {
    ...(buildId === undefined || buildId.length === 0 ? {} : { buildId }),
    id: "univer-cli",
    version: packageMetadata.version,
  };
}
