import Database from "libsql";

/**
 * Rewrites a file created by the current adapters into the Collaboration SDK rc layout
 * (core v1, worktree v2, no History component), which the CLI wrote as `.univer` v2.
 */
export function downgradeToRcV2Layout(filename: string): void {
  const database = new Database(filename);
  try {
    database.exec(`
      ALTER TABLE collaboration_units DROP COLUMN creator_id;
      ALTER TABLE collaboration_worktree_units DROP COLUMN creator_id;
      DROP TABLE IF EXISTS collaboration_history_records;
      DELETE FROM collaboration_schema_versions WHERE component = 'history';
      UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'core';
      UPDATE collaboration_schema_versions SET version = 2 WHERE component = 'worktree';
    `);
  } finally {
    database.close();
  }
}
