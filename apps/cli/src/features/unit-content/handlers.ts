import { prepareContentExecutionProgram } from "@univer-cli/content-execution";
import { inspectContent } from "@univer-cli/content-inspection";
import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import type { CollaborationCommitResult } from "@univer-cli/univer-collaboration-runtime";
import type { UniverCollaborationRuntimeLease } from "@univer-cli/univer-collaboration-runtime-pool";
import type { StartedServer } from "@univer/collab-gateway";
import { UniverInstanceType } from "@univerjs/core";
import {
  codedError,
  pullCurrent,
  requireDraftWorktree,
  requireUnit,
  requireWorktree,
} from "../../daemon/collaboration-access.js";
import type { LocalCollaborationRuntimePool } from "../../daemon/collaboration-runtime-pool.js";
import { unitKindFromType } from "../unit/protocol.js";
import {
  CONTENT_EXECUTE_METHOD,
  CONTENT_INSPECT_METHOD,
  parseExecuteRequest,
  parseInspectRequest,
} from "./protocol.js";

export function registerUnitContentHandlers(input: {
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
  readonly runtimes: LocalCollaborationRuntimePool;
}): void {
  input.daemon.handle(CONTENT_EXECUTE_METHOD, async (payload) => {
    const request = parseExecuteRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireDraftWorktree(univerfile.collab, request.worktreeId);
    const unit = requireUnit(univerfile.collab, request.worktreeId, request.unitId);
    const program = prepareContentExecutionProgram({
      code: request.code,
      unitId: unit.unitId,
      unitType: unitKindFromType(unit.type),
    });
    const lease = await input.runtimes.acquire({
      filePath: univerfile.path,
      unitId: unit.unitId,
      unitType: unit.type as UniverInstanceType,
      worktreeId: request.worktreeId,
    });
    let reusable = false;
    try {
      await pullCurrent(lease);
      const execution = await lease.execute({ code: program, mode: "write" });
      if (execution.mutations.length === 0) {
        reusable = true;
        return executeResult(univerfile.path, request, execution.value, false);
      }
      const committed = await commitAll(lease);
      reusable = true;
      return executeResult(
        univerfile.path,
        request,
        execution.value,
        true,
        committed.state.baseRevision,
      );
    } finally {
      if (reusable) await lease.release();
      else await lease.invalidate();
    }
  });
  input.daemon.handle(CONTENT_INSPECT_METHOD, async (payload) => {
    const request = parseInspectRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    if (request.worktreeId !== undefined) {
      requireWorktree(univerfile.collab, request.worktreeId);
    }
    const unit =
      request.worktreeId === undefined
        ? univerfile.collab.listUnits().find((candidate) => candidate.unitId === request.unitId)
        : univerfile.collab
            .worktreeUnits(request.worktreeId)
            .find((candidate) => candidate.unitId === request.unitId);
    if (unit === undefined) {
      throw codedError("UNIT_NOT_FOUND", `Unit ${request.unitId} not found in ${univerfile.path}`);
    }
    const lease = await input.runtimes.acquire({
      filePath: univerfile.path,
      unitId: unit.unitId,
      unitType: unit.type as UniverInstanceType,
      ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
    });
    let pulled = false;
    try {
      await pullCurrent(lease);
      pulled = true;
      const inspection = await inspectContent(
        {
          async execute(executeInput) {
            const result = await lease.execute(executeInput);
            return { value: result.value };
          },
          unitId: unit.unitId,
          unitType: unitKindFromType(unit.type),
        },
        request.query,
      );
      return { inspection } as unknown as JsonValue;
    } finally {
      if (pulled) await lease.release();
      else await lease.invalidate();
    }
  });
}

async function commitAll(
  lease: UniverCollaborationRuntimeLease,
): Promise<Extract<CollaborationCommitResult, { readonly status: "confirmed" }>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await lease.commit();
    if (result.status === "confirmed") return result;
    if (result.status === "retry" || result.status === "unknown") continue;
    if (result.status === "pull-required") {
      await pullCurrent(lease);
      continue;
    }
    if (result.status === "conflict") {
      throw codedError("CONTENT_RUNTIME_CONFLICT", result.conflict.message);
    }
    throw codedError(
      "CONTENT_COMMIT_INVALID",
      "Content runtime discarded pending mutations before commit",
    );
  }
  throw codedError(
    "CONTENT_COMMIT_RETRY_EXHAUSTED",
    "Content commit could not be confirmed after three attempts",
  );
}

function executeResult(
  filePath: string,
  request: ReturnType<typeof parseExecuteRequest>,
  value: JsonValue,
  committed: boolean,
  revision?: number,
): JsonValue {
  return {
    committed,
    filePath,
    ...(revision === undefined ? {} : { revision }),
    unitId: request.unitId,
    value,
    worktreeId: request.worktreeId,
  };
}
