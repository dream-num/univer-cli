import type {
  ContentInspectionQuery,
  ContentInspectionResult,
} from "@univer-cli/content-inspection";
import type { DaemonClient } from "@univer-cli/daemon";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";
import {
  CONTENT_EXECUTE_METHOD,
  CONTENT_INSPECT_METHOD,
  parseContentExecuteResult,
  parseContentInspectResult,
  type ContentExecuteResult,
} from "./protocol.js";

export interface LocalUnitContentApplication {
  execute(input: {
    readonly code: string;
    readonly cwd?: string;
    readonly path: string;
    readonly unitId: string;
    readonly worktreeId: string;
  }): Promise<ContentExecuteResult>;
  inspect(input: {
    readonly cwd?: string;
    readonly path: string;
    readonly query: ContentInspectionQuery;
    readonly unitId: string;
    readonly worktreeId?: string;
  }): Promise<ContentInspectionResult>;
}

export function createLocalUnitContentApplication(
  daemon: DaemonClient,
): LocalUnitContentApplication {
  return {
    async execute(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseContentExecuteResult(
        await daemon.request(CONTENT_EXECUTE_METHOD, {
          code: input.code,
          path,
          unitId: input.unitId,
          worktreeId: input.worktreeId,
        }),
      );
    },
    async inspect(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseContentInspectResult(
        await daemon.request(CONTENT_INSPECT_METHOD, {
          path,
          query: input.query as never,
          unitId: input.unitId,
          ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
        }),
      ).inspection;
    },
  };
}
