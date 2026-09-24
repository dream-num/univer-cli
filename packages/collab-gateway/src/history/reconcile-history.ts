import type {
  UniverfileSQLiteDatabaseAdapter,
  UniverfileSQLiteHistoryDatabaseAdapter,
} from "@univer/univerfile-sqlite";

interface ReconcileHistoryOptions {
  readonly trunkAdapter: UniverfileSQLiteDatabaseAdapter;
  readonly historyAdapter: UniverfileSQLiteHistoryDatabaseAdapter;
}

/**
 * Drop History boundaries that trunk no longer backs, such as after an optimized copy squashed
 * revisions. History Service rebuilds an empty Unit on its next read and catches up a lagging
 * Unit on its next commit, but rejects a boundary beyond the Core head.
 */
export async function reconcileUniverfileHistory(options: ReconcileHistoryOptions): Promise<void> {
  for (const unit of options.trunkAdapter.listUnits()) {
    const latest = options.historyAdapter.latestStartRevision(unit.unitId);
    if (latest !== null && latest > unit.headRev) {
      options.historyAdapter.resetUnit(unit.unitId);
    }
  }
}
