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
    const changeset = await service.submitWorktreeMutations(
      worktreeId,
      unitId,
      mutations,
    );
    modified.push(unitId);
    units[unitId] = changeset.revision;
  }

  for (const unitId of operations.delete ?? []) {
    service.deleteWorktreeUnit(worktreeId, unitId);
    deleted.push(unitId);
    units[unitId] = 0;
  }

  return { units, created, modified, deleted };
}
