import { DatabaseSync } from "node:sqlite";

/** Counts stored Asset records and their content-addressed blobs straight from a `.univer` file. */
export function countAssetRows(path: string): { readonly assets: number; readonly blobs: number } {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const count = (table: string): number =>
      Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
    return { assets: count("collaboration_assets"), blobs: count("collaboration_asset_blobs") };
  } finally {
    database.close();
  }
}
