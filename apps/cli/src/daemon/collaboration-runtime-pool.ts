import {
  createUniverCollaborationRuntimePool,
  type CollaborationRuntimeState,
  type UniverCollaborationRuntimeLease,
  type UniverCollaborationRuntimePool,
} from "@univer-cli/univer-collaboration-runtime-pool";
import { buildRuntimeConfig } from "@univer/collab-gateway-contract";
import type { UniverInstanceType } from "@univerjs/core";

export interface LocalRuntimeTarget {
  readonly filePath: string;
  readonly unitId: string;
  readonly unitType: UniverInstanceType;
  readonly worktreeId?: string;
}

export interface LocalRuntimeWorkerInit {
  readonly server: {
    readonly collabSubmitChangesetUrl: string;
    readonly collabWebSocketUrl: string;
    readonly snapshotServerUrl: string;
    readonly wsSessionTicketUrl: string;
  };
  readonly unitId: string;
  readonly unitType: UniverInstanceType;
}

export interface LocalCollaborationRuntimePool {
  acquire(target: LocalRuntimeTarget): Promise<UniverCollaborationRuntimeLease>;
  close(): Promise<void>;
  probe(target: LocalRuntimeTarget): Promise<CollaborationRuntimeState>;
}

export interface CreateLocalCollaborationRuntimePoolOptions {
  readonly entry: string | URL;
  readonly env?: NodeJS.ProcessEnv;
  readonly origin: string;
  readonly pool?: UniverCollaborationRuntimePool<LocalRuntimeWorkerInit>;
}

/** Map application-owned Local targets to opaque CLI SDK runtime-pool leases. */
export function createLocalCollaborationRuntimePool(
  options: CreateLocalCollaborationRuntimePoolOptions,
): LocalCollaborationRuntimePool {
  const pool =
    options.pool ??
    createUniverCollaborationRuntimePool<LocalRuntimeWorkerInit>({
      entry: options.entry,
      ...(options.env === undefined ? {} : { env: options.env }),
    });

  return {
    async acquire(target): Promise<UniverCollaborationRuntimeLease> {
      const runtimeConfig = buildRuntimeConfig({
        origin: options.origin,
        univerfile: target.filePath,
        ...(target.worktreeId === undefined ? {} : { worktreeId: target.worktreeId }),
      });
      return await pool.acquire({
        key: runtimeKey(target),
        init: {
          server: {
            collabSubmitChangesetUrl: runtimeConfig.collabSubmitChangesetUrl,
            collabWebSocketUrl: runtimeConfig.collabWebSocketUrl,
            snapshotServerUrl: runtimeConfig.snapshotServerUrl,
            wsSessionTicketUrl: runtimeConfig.wsSessionTicketUrl,
          },
          unitId: target.unitId,
          unitType: target.unitType,
        },
      });
    },
    async close(): Promise<void> {
      await pool.close();
    },
    async probe(target): Promise<CollaborationRuntimeState> {
      const lease = await this.acquire(target);
      try {
        return await lease.getState();
      } finally {
        await lease.release();
      }
    },
  };
}

function runtimeKey(target: LocalRuntimeTarget): string {
  return JSON.stringify([
    target.filePath,
    target.worktreeId === undefined ? ["trunk"] : ["worktree", target.worktreeId],
    target.unitId,
    target.unitType,
  ]);
}
