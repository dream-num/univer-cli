import type { DaemonClient } from "@univer-cli/daemon";
import type { OptimizeUniverfileReport } from "@univer/collab-gateway-contract";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";
import { parseOptimizeResult, UNIVERFILE_OPTIMIZE_METHOD } from "./protocol.js";

export interface LocalOptimizeApplication {
  optimize(input: {
    readonly cwd?: string;
    readonly dryRun: boolean;
    readonly history?: "reset";
    readonly images?: "externalize";
    readonly outputPath?: string;
    readonly path: string;
    readonly worktrees?: "clean";
  }): Promise<OptimizeUniverfileReport>;
}

export function createLocalOptimizeApplication(daemon: DaemonClient): LocalOptimizeApplication {
  return {
    async optimize(input) {
      const cwd = input.cwd ?? process.cwd();
      return parseOptimizeResult(
        await daemon.request(UNIVERFILE_OPTIMIZE_METHOD, {
          dryRun: input.dryRun,
          path: resolveLocalUniverfile(input.path, cwd),
          ...(input.outputPath === undefined
            ? {}
            : { outputPath: resolveLocalUniverfile(input.outputPath, cwd) }),
          ...(input.images === undefined ? {} : { images: input.images }),
          ...(input.worktrees === undefined ? {} : { worktrees: input.worktrees }),
          ...(input.history === undefined ? {} : { history: input.history }),
        }),
      );
    },
  };
}
