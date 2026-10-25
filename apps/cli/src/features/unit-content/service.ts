import type {
  ContentInspectionQuery,
  ContentInspectionResult,
} from "@univer-cli/content-inspection";
import type { DaemonClient } from "@univer-cli/daemon";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";
import {
  CONTENT_EXECUTE_METHOD,
  CONTENT_INSPECT_METHOD,
  CONTENT_READ_METHOD,
  CONTENT_READ_ASSET_METHOD,
  parseContentReadAssetResult,
  type ContentReadAssetResult,
  parseContentExecuteResult,
  parseContentInspectResult,
  parseContentReadResult,
  type ContentExecuteResult,
  type ContentReadResult,
} from "./protocol.js";

export interface LocalUnitContentApplication {
  readAsset(input: {
    readonly cwd?: string;
    readonly path: string;
    readonly unitId: string;
    readonly worktreeId: string;
    readonly reference: string;
  }): Promise<ContentReadAssetResult>;
  read(input: {
    readonly code: string;
    readonly cwd?: string;
    readonly path: string;
    readonly unitId: string;
    readonly worktreeId: string;
  }): Promise<ContentReadResult>;
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
    async readAsset(input) {
      return parseContentReadAssetResult(
        await daemon.request(CONTENT_READ_ASSET_METHOD, {
          path: resolveLocalUniverfile(input.path, input.cwd),
          unitId: input.unitId,
          worktreeId: input.worktreeId,
          reference: input.reference,
        }),
      );
    },
    async read(input) {
      return parseContentReadResult(
        await daemon.request(CONTENT_READ_METHOD, {
          code: input.code,
          path: resolveLocalUniverfile(input.path, input.cwd),
          unitId: input.unitId,
          worktreeId: input.worktreeId,
        }),
      );
    },
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
