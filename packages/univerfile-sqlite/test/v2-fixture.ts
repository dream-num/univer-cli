import { readFileSync } from "node:fs";
import Database from "libsql";

export type V2FixtureVariant = "authoring" | "millisecond-change-times" | "without-history";

export const V2_FIXTURE = {
  sheetUnitId: "u-muf7cuin-elnecc",
  docUnitId: "u-muf7cun8-pkk687",
  slideUnitId: "u-muf7cxxj-lm7xb7",
  mergedWorktreeIds: ["wt-muf7cue3-rslzv0", "wt-muf7cw1x-8t444b"],
  draftWorktreeId: "wt-muf7cxbv-whq02h",
  discardedWorktreeId: "wt-muf7cy22-z847ls",
  legacyChangeTimeBaseMs: 1_786_708_207_407,
} as const;

export function writeV2Fixture(filename: string, variant: V2FixtureVariant = "authoring"): void {
  const database = new Database(filename);
  try {
    database.exec(readFileSync(new URL("./fixtures/v2-authoring.sql", import.meta.url), "utf8"));
    if (variant === "millisecond-change-times") applyMillisecondChangeTimes(database);
    if (variant === "without-history") removeHistory(database);
  } finally {
    database.close();
  }
}

// Earlier CLI releases stored Worktree changeset `createTime` as Unix milliseconds.
function applyMillisecondChangeTimes(database: Database.Database): void {
  database
    .prepare(
      `UPDATE collaboration_worktree_changesets
       SET payload_json = json_set(payload_json, '$.createTime', ? + revision * 1000)`,
    )
    .run(V2_FIXTURE.legacyChangeTimeBaseMs);
}

function removeHistory(database: Database.Database): void {
  database.exec(`
    DROP TABLE collaboration_history_revisions;
    DELETE FROM collaboration_schema_versions WHERE component = 'history';
  `);
}
