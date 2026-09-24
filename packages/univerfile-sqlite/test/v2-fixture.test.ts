import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseContext } from "@univerjs-pro/collaboration-service";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../src/migration/backup.js";
import { openUniverfileSQLite } from "../src/open.js";
import { detectUniverfileSQLiteFormat } from "../src/schema/detect.js";
import { V2_FIXTURE, writeV2Fixture, type V2FixtureVariant } from "./v2-fixture.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("v2 .univer fixtures", () => {
  it.each<V2FixtureVariant>(["authoring", "millisecond-change-times", "without-history"])(
    "identifies the %s fixture as v2",
    (variant) => {
      const filename = databasePath();
      writeV2Fixture(filename, variant);

      expect(detectUniverfileSQLiteFormat(filename)).toBe("v2");
    },
  );

  it("opens the authoring fixture without upgrade side effects", async () => {
    const filename = databasePath();
    writeV2Fixture(filename);
    const originalHash = sha256(filename);

    const univerfile = openUniverfileSQLite(filename);
    try {
      expect(univerfile.upgrade).toEqual({ status: "unchanged", format: "v2" });
      expect(univerfile.databaseAdapter.listUnits()).toEqual([
        expect.objectContaining({ unitId: V2_FIXTURE.sheetUnitId, name: "Plan", headRev: 2 }),
        expect.objectContaining({ unitId: V2_FIXTURE.docUnitId, name: "Notes", headRev: 1 }),
      ]);
      expect(
        univerfile.worktreeDatabaseAdapter
          .listWorktrees()
          .map(({ worktreeId, status }) => ({ worktreeId, status })),
      ).toEqual(
        expect.arrayContaining([
          { worktreeId: V2_FIXTURE.mergedWorktreeIds[0], status: "merged" },
          { worktreeId: V2_FIXTURE.mergedWorktreeIds[1], status: "merged" },
          { worktreeId: V2_FIXTURE.draftWorktreeId, status: "draft" },
          { worktreeId: V2_FIXTURE.discardedWorktreeId, status: "discarded" },
        ]),
      );
      await expect(
        univerfile.historyDatabaseAdapter.getIndexState(V2_FIXTURE.sheetUnitId),
      ).resolves.toMatchObject({ latestRevision: 2, currentHistoryRevision: 1 });
    } finally {
      await univerfile.dispose();
    }
    expect(sha256(filename)).toBe(originalHash);
  });

  it("returns stored millisecond change times unchanged", async () => {
    const filename = databasePath();
    writeV2Fixture(filename, "millisecond-change-times");

    const univerfile = openUniverfileSQLite(filename);
    try {
      const drafts =
        (await univerfile.worktreeDatabaseAdapter.getDraftChangesets(
          context(),
          V2_FIXTURE.draftWorktreeId,
          V2_FIXTURE.sheetUnitId,
          { from: 1, to: 0 },
        )) ?? [];
      expect(drafts.map(({ revision, createTime }) => ({ revision, createTime }))).toEqual([
        { revision: 3, createTime: V2_FIXTURE.legacyChangeTimeBaseMs + 3_000 },
      ]);
    } finally {
      await univerfile.dispose();
    }
  });

  it("creates the derived History index when the v2 fixture has none", async () => {
    const filename = databasePath();
    writeV2Fixture(filename, "without-history");

    const univerfile = openUniverfileSQLite(filename);
    try {
      expect(univerfile.upgrade).toEqual({ status: "unchanged", format: "v2" });
      await expect(
        univerfile.historyDatabaseAdapter.getIndexState(V2_FIXTURE.sheetUnitId),
      ).resolves.toBeNull();
    } finally {
      await univerfile.dispose();
    }
    expect(detectUniverfileSQLiteFormat(filename)).toBe("v2");
  });
});

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "univerfile-v2-"));
  directories.push(directory);
  return join(directory, "file.univer");
}

function context(): DatabaseContext {
  return { userID: "user-1", customData: {}, request: {} };
}
