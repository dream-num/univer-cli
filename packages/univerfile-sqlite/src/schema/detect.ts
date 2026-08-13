import Database from "libsql";
import { UniverfileSQLiteError } from "../errors.js";

export type UniverfileSQLiteFormat = "v0" | "v1" | "v2";

const V0_TABLES = [
  "units",
  "changesets",
  "snapshots",
  "sheet_blocks",
  "worktrees",
  "worktree_commits",
  "worktree_changesets",
  "worktree_snapshots",
] as const;

const CORE_TABLES = [
  "collaboration_units",
  "collaboration_unit_tombstones",
  "collaboration_snapshots",
  "collaboration_changesets",
  "collaboration_sheet_blocks",
  "collaboration_resources",
] as const;

const WORKTREE_COMMON_TABLES = [
  "collaboration_worktrees",
  "collaboration_worktree_units",
  "collaboration_worktree_changesets",
  "collaboration_worktree_unit_seeds",
  "collaboration_worktree_unit_merge_artifacts",
  "collaboration_worktree_deleted_units",
] as const;

const ASSET_TABLES = ["collaboration_asset_blobs", "collaboration_assets"] as const;

interface NameRow {
  readonly name: string;
}

interface VersionRow {
  readonly component: string;
  readonly version: number;
}

interface ColumnRow {
  readonly name: string;
}

export function detectUniverfileSQLiteFormat(filename: string): UniverfileSQLiteFormat {
  let database: Database.Database | undefined;
  try {
    database = new Database(filename, { readonly: true, fileMustExist: true });
    const tables = new Set(
      (
        database
          .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
          .all() as unknown as NameRow[]
      ).map(({ name }) => name),
    );
    const presentV0 = V0_TABLES.filter((table) => tables.has(table));
    const collaborationTables = [...tables].filter((table) => table.startsWith("collaboration_"));

    if (presentV0.length > 0) {
      if (presentV0.length !== V0_TABLES.length || collaborationTables.length > 0) {
        throw unsupported("legacy v0 schema is partial or mixed with component tables");
      }
      return "v0";
    }

    if (!tables.has("collaboration_schema_versions")) {
      throw unsupported("component schema versions table is missing");
    }
    const versions = new Map(
      (
        database
          .prepare("SELECT component, version FROM collaboration_schema_versions")
          .all() as unknown as VersionRow[]
      ).map(({ component, version }) => [component, version]),
    );
    const known = new Set(["core", "worktree", "assets"]);
    const unknown = [...versions.keys()].filter((component) => !known.has(component));
    if (unknown.length > 0) {
      throw unsupported(`unknown schema components: ${unknown.join(", ")}`);
    }
    if (versions.get("core") !== 1) throw unsupported("core schema version must be v1");
    const worktreeVersion = versions.get("worktree");
    if (worktreeVersion !== 1 && worktreeVersion !== 2) {
      throw unsupported(`worktree schema version ${String(worktreeVersion)} is not supported`);
    }

    const assetVersion = versions.get("assets");
    const presentAssetTables = ASSET_TABLES.filter((table) => tables.has(table));
    const hasCompleteAssetSchema =
      assetVersion === 1 && presentAssetTables.length === ASSET_TABLES.length;
    const hasNoAssetSchema = assetVersion === undefined && presentAssetTables.length === 0;
    if (!hasCompleteAssetSchema && !(worktreeVersion === 1 && hasNoAssetSchema)) {
      throw unsupported("assets schema must be complete, or absent on a Gateway v1 file");
    }

    const required: string[] = [...CORE_TABLES, ...WORKTREE_COMMON_TABLES];
    if (hasCompleteAssetSchema) required.push(...ASSET_TABLES);
    if (worktreeVersion === 1) required.push("collaboration_worktree_commits");
    const missing = required.filter((table) => !tables.has(table));
    if (missing.length > 0) {
      throw unsupported(`schema is incomplete: missing ${missing.join(", ")}`);
    }

    const worktreeColumns = columns(database, "collaboration_worktrees");
    const hasHeadCommit = worktreeColumns.has("head_commit");
    const hasCommitTable = tables.has("collaboration_worktree_commits");
    if (worktreeVersion === 1 && (!hasHeadCommit || !hasCommitTable)) {
      throw unsupported("worktree v1 logical commit storage is incomplete");
    }
    if (worktreeVersion === 2 && (hasHeadCommit || hasCommitTable)) {
      throw unsupported("worktree v2 is mixed with logical commit storage");
    }
    return worktreeVersion === 1 ? "v1" : "v2";
  } catch (error) {
    if (error instanceof UniverfileSQLiteError) throw error;
    throw new UniverfileSQLiteError(
      "UNSUPPORTED_SCHEMA",
      `cannot identify .univer schema: ${message(error)}`,
      { cause: error },
    );
  } finally {
    database?.close();
  }
}

function columns(database: Database.Database, table: string): ReadonlySet<string> {
  return new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnRow[]).map(
      ({ name }) => name,
    ),
  );
}

function unsupported(message: string): UniverfileSQLiteError {
  return new UniverfileSQLiteError("UNSUPPORTED_SCHEMA", message);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
