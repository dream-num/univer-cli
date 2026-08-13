import type { DaemonClient } from "@univer-cli/daemon";
import { encodeUniverfile } from "@univer/collab-gateway-contract";
import type { UniverfileUpgradeResult } from "@univer/univerfile-sqlite";
import { GATEWAY_INFO_METHOD, parseGatewayInfo } from "../../daemon/protocol.js";
import {
  parseUniverfileOpenResult,
  parseUniverfileStatusResult,
  UNIVERFILE_CREATE_METHOD,
  UNIVERFILE_OPEN_METHOD,
  UNIVERFILE_STATUS_METHOD,
  type UniverfileStatusResult,
} from "./protocol.js";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";

export interface CreateUniverfileResult {
  readonly filePath: string;
}

export interface OpenUniverfileResult {
  readonly filePath: string;
  readonly openUrl: string;
  readonly upgrade: UniverfileUpgradeResult;
  readonly unitId?: string;
  readonly worktreeId?: string;
}

export interface LocalUniverfileApplication {
  create(input: { readonly cwd?: string; readonly path: string }): Promise<CreateUniverfileResult>;
  open(input: {
    readonly cwd?: string;
    readonly path: string;
    readonly unitId?: string;
    readonly viewerUrl?: string;
    readonly worktreeId?: string;
  }): Promise<OpenUniverfileResult>;
  status(input: {
    readonly cwd?: string;
    readonly path: string;
    readonly unitId?: string;
    readonly worktreeId?: string;
  }): Promise<UniverfileStatusResult>;
}

export function createLocalUniverfileApplication(daemon: DaemonClient): LocalUniverfileApplication {
  return {
    async create(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      const result = parseUniverfileOpenResult(
        await daemon.request(UNIVERFILE_CREATE_METHOD, { path }),
      );
      return { filePath: result.filePath };
    },
    async open(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      const opened = parseUniverfileOpenResult(
        await daemon.request(UNIVERFILE_OPEN_METHOD, { path }),
      );
      const gateway = parseGatewayInfo(await daemon.request(GATEWAY_INFO_METHOD, null));
      const url = new URL(input.viewerUrl ?? gateway.viewUrl);
      url.searchParams.set(
        "file",
        input.viewerUrl === undefined ? encodeUniverfile(opened.filePath) : opened.filePath,
      );
      if (input.worktreeId !== undefined) url.searchParams.set("worktree", input.worktreeId);
      if (input.unitId !== undefined) url.searchParams.set("unit", input.unitId);
      return {
        ...opened,
        openUrl: url.href,
        ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
        ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
      };
    },
    async status(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseUniverfileStatusResult(
        await daemon.request(UNIVERFILE_STATUS_METHOD, {
          path,
          ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
          ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
        }),
      );
    },
  };
}
