import type Database from "libsql";
import type { UniverfileSQLiteConnection } from "../../connection.js";
import { runUniverfileSQLiteTransaction } from "../../connection.js";
import { coreUnitsTableSql } from "../../database-adapters/collaboration-database-adapter.js";
import {
  HISTORY_RECORDS_SCHEMA_SQL,
  HISTORY_SCHEMA_VERSION,
} from "../../database-adapters/history-database-adapter.js";
import { worktreeUnitsTableSql } from "../../database-adapters/worktree-database-adapter.js";

const LEGACY_HISTORY_TABLE = "collaboration_history_revisions";
/** Values at or above this are Unix milliseconds; Unix seconds stay below it until year 5138. */
const MILLISECOND_THRESHOLD = 100_000_000_000;

interface UnitRow {
  readonly unit_id: string;
  readonly head_revision: number;
  readonly creator_id: string;
  readonly created_at_ms: number;
}

interface ChangesetTimeRow {
  readonly scope_id: string;
  readonly unit_id: string;
  readonly revision: number;
  readonly create_time: unknown;
  readonly fallback_ms: number;
  readonly legacy_committed_at: number | null;
}

interface LegacyHistoryRow {
  readonly unit_id: string;
  readonly revision: number;
  readonly user_id: string;
  readonly origin: number;
  readonly history_revision: number;
  readonly additional_fields: string | null;
}

interface HistoryStart {
  readonly startRevision: number;
  readonly userID: string;
  readonly origin: number;
  readonly additionalFields: string | null;
}

/**
 * Converts a Collaboration SDK rc `.univer` layout (core v1, worktree v2, history v1) in place.
 *
 * Unit records gain their creator. Changeset `createTime` becomes Unix seconds. History keeps the
 * segment starts it can prove and leaves any other Unit to History Service's lazy initialization.
 */
export function migrateV2CandidateToV3(connection: UniverfileSQLiteConnection): void {
  const { database } = connection;
  const hasLegacyHistory = hasTable(database, LEGACY_HISTORY_TABLE);
  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    runUniverfileSQLiteTransaction(database, () => {
      rebuildCoreUnits(database, hasLegacyHistory);
      rebuildWorktreeUnits(database);
      normalizeChangesetCreateTimes(database);
      if (hasLegacyHistory) migrateHistory(database);
      database.exec(`
        UPDATE collaboration_schema_versions SET version = 2
        WHERE component = 'core' AND version = 1;
        UPDATE collaboration_schema_versions SET version = 3
        WHERE component = 'worktree' AND version = 2;
      `);
    });
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
  if (database.prepare("PRAGMA foreign_key_check").get() !== undefined) {
    throw new Error("v2 to v3 migration produced a foreign-key violation");
  }
}

function rebuildCoreUnits(database: Database.Database, hasLegacyHistory: boolean): void {
  const historyCreator = hasLegacyHistory
    ? `NULLIF((SELECT history.user_id FROM ${LEGACY_HISTORY_TABLE} AS history
               WHERE history.unit_id = units.unit_id AND history.revision = 1), ''),`
    : "";
  database.exec(`
    ${coreUnitsTableSql("collaboration_units_v3")}

    INSERT INTO collaboration_units_v3
      (unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms)
    SELECT units.unit_id, units.type, units.name, units.head_revision,
           COALESCE(
             ${historyCreator}
             NULLIF(json_extract((SELECT changesets.payload_json
                                  FROM collaboration_changesets AS changesets
                                  WHERE changesets.unit_id = units.unit_id
                                    AND changesets.revision = 2), '$.userID'), ''),
             'local'
           ),
           units.created_at_ms, units.soft_deleted_at_ms
    FROM collaboration_units AS units;

    DROP TABLE collaboration_units;
    ALTER TABLE collaboration_units_v3 RENAME TO collaboration_units;
  `);
}

/**
 * Trunk-sourced Units take their trunk creation identity. Worktree-created Units were created by
 * the Worktree's agent at the time recorded on the row.
 */
function rebuildWorktreeUnits(database: Database.Database): void {
  database.exec(`
    ${worktreeUnitsTableSql("collaboration_worktree_units_v3")}

    INSERT INTO collaboration_worktree_units_v3
      (worktree_id, unit_id, unit_order, type, name, creator_id, created_at_ms, source,
       baseline_trunk_revision, draft_head_revision, ready_draft_head_revision, merge_result_json)
    SELECT units.worktree_id, units.unit_id, units.unit_order, units.type, units.name,
           CASE
             WHEN units.source = 'trunk' THEN COALESCE(trunk.creator_id, 'local')
             ELSE COALESCE(NULLIF(worktrees.agent_id, ''), 'local')
           END,
           CASE
             WHEN units.source = 'trunk' THEN COALESCE(trunk.created_at_ms, units.created_at_ms)
             ELSE units.created_at_ms
           END,
           units.source, units.baseline_trunk_revision, units.draft_head_revision,
           units.ready_draft_head_revision, units.merge_result_json
    FROM collaboration_worktree_units AS units
    LEFT JOIN collaboration_worktrees AS worktrees ON worktrees.worktree_id = units.worktree_id
    LEFT JOIN collaboration_units AS trunk ON trunk.unit_id = units.unit_id;

    DROP TABLE collaboration_worktree_units;
    ALTER TABLE collaboration_worktree_units_v3 RENAME TO collaboration_worktree_units;
  `);
}

/**
 * History grouping reads `createTime` as Unix seconds. Earlier CLI builds wrote milliseconds or
 * nothing; missing values inherit the closest earlier time on the same Unit.
 */
export function normalizeChangesetCreateTimes(database: Database.Database): void {
  runUniverfileSQLiteTransaction(database, () => normalizeAllChangesetCreateTimes(database));
}

function normalizeAllChangesetCreateTimes(database: Database.Database): void {
  const hasLegacyHistory = hasTable(database, LEGACY_HISTORY_TABLE);
  const legacyCommittedAt = hasLegacyHistory
    ? `(SELECT history.committed_at FROM ${LEGACY_HISTORY_TABLE} AS history
        WHERE history.unit_id = changesets.unit_id AND history.revision = changesets.revision)`
    : "NULL";
  normalizeScope(
    database,
    "collaboration_changesets",
    database
      .prepare(
        `SELECT '' AS scope_id, changesets.unit_id, changesets.revision,
                json_extract(changesets.payload_json, '$.createTime') AS create_time,
                units.created_at_ms AS fallback_ms,
                ${legacyCommittedAt} AS legacy_committed_at
         FROM collaboration_changesets AS changesets
         JOIN collaboration_units AS units ON units.unit_id = changesets.unit_id
         ORDER BY changesets.unit_id ASC, changesets.revision ASC`,
      )
      .all() as unknown as ChangesetTimeRow[],
    `UPDATE collaboration_changesets
     SET payload_json = json_set(payload_json, '$.createTime', ?)
     WHERE unit_id = ? AND revision = ?`,
  );
  normalizeScope(
    database,
    "collaboration_worktree_changesets",
    database
      .prepare(
        `SELECT changesets.worktree_id AS scope_id, changesets.unit_id, changesets.revision,
                json_extract(changesets.payload_json, '$.createTime') AS create_time,
                worktrees.created_at_ms AS fallback_ms,
                NULL AS legacy_committed_at
         FROM collaboration_worktree_changesets AS changesets
         JOIN collaboration_worktrees AS worktrees
           ON worktrees.worktree_id = changesets.worktree_id
         ORDER BY changesets.worktree_id ASC, changesets.unit_id ASC, changesets.revision ASC`,
      )
      .all() as unknown as ChangesetTimeRow[],
    `UPDATE collaboration_worktree_changesets
     SET payload_json = json_set(payload_json, '$.createTime', ?)
     WHERE worktree_id = ? AND unit_id = ? AND revision = ?`,
  );
}

function normalizeScope(
  database: Database.Database,
  table: "collaboration_changesets" | "collaboration_worktree_changesets",
  rows: readonly ChangesetTimeRow[],
  updateSql: string,
): void {
  const update = database.prepare(updateSql);
  let scope: string | undefined;
  let previousSeconds = 0;
  for (const row of rows) {
    const key = `${row.scope_id}\u0000${row.unit_id}`;
    if (key !== scope) {
      scope = key;
      previousSeconds = toSeconds(row.fallback_ms) ?? 0;
    }
    const seconds =
      toSeconds(row.create_time) ?? toSeconds(row.legacy_committed_at) ?? previousSeconds;
    previousSeconds = seconds;
    if (seconds === row.create_time) continue;
    if (table === "collaboration_changesets") {
      update.run(seconds, row.unit_id, row.revision);
    } else {
      update.run(seconds, row.scope_id, row.unit_id, row.revision);
    }
  }
}

function toSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value >= MILLISECOND_THRESHOLD ? value / 1000 : value);
}

/**
 * Rc History stored every indexed revision and marked segment starts with
 * `history_revision = revision`. The SDK stores only the starts, and revision 1 belongs to the
 * creation record alone.
 */
function migrateHistory(database: Database.Database): void {
  const units = database
    .prepare(
      `SELECT unit_id, head_revision, creator_id, created_at_ms
       FROM collaboration_units
       ORDER BY unit_id ASC`,
    )
    .all() as unknown as UnitRow[];
  const legacyRows = database
    .prepare(
      `SELECT unit_id, revision, user_id, origin, history_revision, additional_fields
       FROM ${LEGACY_HISTORY_TABLE}
       ORDER BY unit_id ASC, revision ASC`,
    )
    .all() as unknown as LegacyHistoryRow[];
  const rowsByUnit = new Map<string, LegacyHistoryRow[]>();
  for (const row of legacyRows) {
    const rows = rowsByUnit.get(row.unit_id) ?? [];
    rows.push(row);
    rowsByUnit.set(row.unit_id, rows);
  }
  const createTime = database.prepare(
    `SELECT json_extract(payload_json, '$.createTime') AS create_time
     FROM collaboration_changesets
     WHERE unit_id = ? AND revision = ?`,
  );

  database.exec(`
    DROP TABLE ${LEGACY_HISTORY_TABLE};
    ${HISTORY_RECORDS_SCHEMA_SQL}
    UPDATE collaboration_schema_versions SET version = ${HISTORY_SCHEMA_VERSION}
    WHERE component = 'history';
  `);
  const insert = database.prepare(
    `INSERT INTO collaboration_history_records
       (unit_id, start_revision, user_id, created_at_ms, origin, additional_fields)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const unit of units) {
    const starts = historyStarts(unit, rowsByUnit.get(unit.unit_id) ?? []);
    if (starts === null) continue;
    insert.run(unit.unit_id, 1, unit.creator_id, unit.created_at_ms, 1, null);
    for (const start of starts) {
      const row = createTime.get(unit.unit_id, start.startRevision) as
        | { readonly create_time: unknown }
        | undefined;
      const seconds = toSeconds(row?.create_time);
      if (seconds === undefined) {
        throw new Error(`trunk changeset ${unit.unit_id}@${start.startRevision} has no createTime`);
      }
      insert.run(
        unit.unit_id,
        start.startRevision,
        start.userID,
        seconds * 1000,
        start.origin,
        start.additionalFields,
      );
    }
  }
}

/**
 * Returns the starts after revision 1, or `null` when the Unit's rc History cannot be trusted and
 * History Service should rebuild it from trunk.
 */
function historyStarts(
  unit: UnitRow,
  rows: readonly LegacyHistoryRow[],
): readonly HistoryStart[] | null {
  const indexed = rows.filter((row) => row.revision <= unit.head_revision);
  if (indexed.length === 0) return null;
  const valid = indexed.every(
    (row, index) =>
      row.revision === index + 1 &&
      row.history_revision >= 1 &&
      row.history_revision <= row.revision &&
      indexed[row.history_revision - 1]!.history_revision === row.history_revision &&
      (row.origin === 0 || row.origin === 1 || row.origin === 2) &&
      row.user_id.length > 0,
  );
  if (!valid) return null;
  return indexed
    .filter(
      (row) => row.revision >= 2 && (row.revision === 2 || row.history_revision === row.revision),
    )
    .map((row) => ({
      startRevision: row.revision,
      userID: row.user_id,
      origin: row.origin,
      additionalFields: row.additional_fields,
    }));
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return (
    database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  );
}
