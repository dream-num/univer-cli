#!/usr/bin/env node
import packageMetadata from "../package.json" with { type: "json" };
import { fileURLToPath } from "node:url";
import { runCli } from "./cli.js";
import { resolveApplicationPaths } from "./environment/paths.js";
import {
  isDevelopmentInstallation,
  refreshUpdateCache,
  releaseBackgroundUpdateLock,
} from "./features/update/service.js";

const env = process.env;
if (env["UNIVER_CLI_INTERNAL_UPDATE_CHECK"] === "1") {
  try {
    const packageRoot = fileURLToPath(new URL("../", import.meta.url));
    if (!(await isDevelopmentInstallation(packageRoot))) {
      await refreshUpdateCache({
        homeDir: resolveApplicationPaths(env).homeDir,
        version: packageMetadata.version,
      });
    }
  } finally {
    await releaseBackgroundUpdateLock(env);
  }
} else {
  process.exitCode = await runCli(process.argv.slice(2));
}
