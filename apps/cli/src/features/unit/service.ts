import type { DaemonClient } from "@univer-cli/daemon";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";
import type { WorktreeTargetInput } from "../worktree/service.js";
import {
  parseUnitCreateResult,
  parseUnitListResult,
  parseUnitRemoveResult,
  UNIT_CREATE_METHOD,
  UNIT_LIST_METHOD,
  UNIT_REMOVE_METHOD,
  type UnitCreateResult,
  type UnitKind,
  type UnitListResult,
  type UnitRemoveResult,
} from "./protocol.js";

export interface LocalUnitApplication {
  createUnit(
    input: WorktreeTargetInput & { readonly kind: UnitKind; readonly name: string },
  ): Promise<UnitCreateResult>;
  removeUnit(input: WorktreeTargetInput & { readonly unitId: string }): Promise<UnitRemoveResult>;
  listUnits(input: {
    readonly cwd?: string;
    readonly path: string;
    readonly worktreeId?: string;
  }): Promise<UnitListResult>;
}

export function createLocalUnitApplication(daemon: DaemonClient): LocalUnitApplication {
  return {
    async createUnit(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseUnitCreateResult(
        await daemon.request(UNIT_CREATE_METHOD, {
          kind: input.kind,
          name: input.name,
          path,
          worktreeId: input.worktreeId,
        }),
      );
    },
    async removeUnit(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseUnitRemoveResult(
        await daemon.request(UNIT_REMOVE_METHOD, {
          path,
          unitId: input.unitId,
          worktreeId: input.worktreeId,
        }),
      );
    },
    async listUnits(input) {
      const path = resolveLocalUniverfile(input.path, input.cwd);
      return parseUnitListResult(
        await daemon.request(UNIT_LIST_METHOD, {
          path,
          ...(input.worktreeId === undefined ? {} : { worktreeId: input.worktreeId }),
        }),
      );
    },
  };
}
