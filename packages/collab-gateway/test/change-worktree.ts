import type { IMutation } from "@univerjs/protocol";
import type { CollabService } from "../src/collab-service.js";

interface CreateUnitOperation {
  readonly type: number;
  readonly name: string;
  readonly unitId?: string;
  readonly snapshot?: object;
}

interface WorktreeChangeOperations {
  readonly create?: readonly CreateUnitOperation[];
  readonly modify?: Readonly<Record<string, readonly IMutation[]>>;
  readonly delete?: readonly string[];
}

interface WorktreeChangeResult {
  readonly units: Readonly<Record<string, number>>;
  readonly created: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
}

/** Test arrangement helper built from the Gateway's focused Worktree operations. */
export async function changeWorktree(
  service: CollabService,
  worktreeId: string,
  _description: string,
  operations: WorktreeChangeOperations,
  _tag?: string,
): Promise<WorktreeChangeResult> {
  const units: Record<string, number> = {};
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const operation of operations.create ?? []) {
    const unit = await service.createWorktreeUnit(
      worktreeId,
      operation.type,
      operation.name,
      operation.unitId,
      operation.snapshot,
    );
    created.push(unit.unitId);
    units[unit.unitId] = 1;
  }

  for (const [unitId, mutations] of Object.entries(operations.modify ?? {})) {
    const unit = service.worktreeUnits(worktreeId).find((candidate) => candidate.unitId === unitId);
    if (!unit) throw new Error(`Missing Unit ${unitId} in Worktree ${worktreeId}`);
    const result = await service.runtime.worktreeService.submitChangeset(
      {
        worktreeID: worktreeId,
        changeset: {
          unitID: unitId,
          type: unit.type,
          baseRev: unit.headRev,
          revision: 0,
          userID: "local",
          memberID: "test",
          sid: `test:${worktreeId}:${unitId}`,
          reqId: unit.headRev,
          mutations: [...mutations],
        },
      },
      { userID: "local", memberID: "test" },
    );
    if (result.status === "rejected" || result.status === "retry") throw result.error;
    modified.push(unitId);
    units[unitId] = result.changeset.revision;
  }

  for (const unitId of operations.delete ?? []) {
    service.deleteWorktreeUnit(worktreeId, unitId);
    deleted.push(unitId);
    units[unitId] = 0;
  }

  return { units, created, modified, deleted };
}
