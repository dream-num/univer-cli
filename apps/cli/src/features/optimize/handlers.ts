import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import { optimizeUniverfilePath } from "@univer/collab-gateway";
import { parseUniverfileOptimizeRequest, UNIVERFILE_OPTIMIZE_METHOD } from "./protocol.js";

export function registerOptimizeHandlers(daemon: DaemonServer): void {
  daemon.handle(UNIVERFILE_OPTIMIZE_METHOD, async (payload) => {
    const request = parseUniverfileOptimizeRequest(payload);
    return (await optimizeUniverfilePath({
      dryRun: request.dryRun,
      sourcePath: request.path,
      ...(request.outputPath === undefined ? {} : { outputPath: request.outputPath }),
      ...(request.images === undefined ? {} : { images: request.images }),
      ...(request.worktrees === undefined ? {} : { worktrees: request.worktrees }),
      ...(request.history === undefined ? {} : { history: request.history }),
    })) as unknown as JsonValue;
  });
}
