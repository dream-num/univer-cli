import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverInstanceType } from "@univerjs/core";
import type { IMutation } from "@univerjs/protocol";
import { WorktreeControlClient } from "@univer/collab-gateway-contract";
import { afterEach, describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { optimizeUniverfilePath } from "../src/optimization/univerfile-optimizer.js";
import { startServer } from "../src/server.js";
import {
  UniverfileSQLiteConnection,
  detectUniverfileSQLiteFormat
} from "@univer/univerfile-sqlite";
import { changeWorktree } from "./change-worktree.js";

const PNG_DATA_URI = "data:image/png;base64,iVBORw0KGgo=";

describe("Univerfile copy optimization", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("externalizes legacy embedded images without implicitly pruning history", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "optimized.univer");
    const service = new CollabService({ dbPath: source, create: true });
    const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    const discarded = service.createWorktree("agent", "discarded");
    await service.discard(discarded.worktreeId);
    await service.dispose();

    injectLegacyImage(source, unit.unitId);
    const dryRun = await optimizeUniverfilePath({
      sourcePath: source,
      images: "externalize",
      dryRun: true
    });
    expect(dryRun.images).toMatchObject({ selected: true, references: 1, uniqueBlobs: 1 });
    expect(dryRun.worktrees).toEqual({
      mode: "preserve",
      impliedByHistory: false,
      removedWorktrees: 0
    });
    expect(dryRun.history).toEqual({
      mode: "preserve",
      resetUnits: 0,
      removedSnapshots: 0,
      removedChangesets: 0
    });

    const report = await optimizeUniverfilePath({
      sourcePath: source,
      outputPath: output,
      images: "externalize",
      dryRun: false
    });
    expect(report.afterBytes).toBeLessThanOrEqual(report.beforeBytes);
    expect(report.history.mode).toBe("preserve");

    const sourceDatabase = new UniverfileSQLiteConnection({ filename: source });
    const outputDatabase = new UniverfileSQLiteConnection({ filename: output });
    try {
      const sourcePayload = snapshotPayload(sourceDatabase, unit.unitId);
      const outputPayload = snapshotPayload(outputDatabase, unit.unitId);
      expect(sourcePayload).toContain(PNG_DATA_URI);
      expect(outputPayload).not.toContain(PNG_DATA_URI);
      expect(outputPayload).toContain('"imageSourceType":"UUID"');
      expect(countRows(outputDatabase, "collaboration_worktrees")).toBe(1);
      expect(countRows(outputDatabase, "collaboration_assets")).toBe(1);
      expect(countRows(outputDatabase, "collaboration_asset_blobs")).toBe(1);
    } finally {
      sourceDatabase.dispose();
      outputDatabase.dispose();
    }
  });

  it("upgrades a v1 working copy without changing the optimization source", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "optimized.univer");
    const service = new CollabService({ dbPath: source, create: true });
    await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    await service.dispose();
    markAsGatewayV1(source);
    const sourceHash = fileHash(source);

    await optimizeUniverfilePath({
      sourcePath: source,
      outputPath: output,
      images: "externalize",
      dryRun: false
    });

    expect(fileHash(source)).toBe(sourceHash);
    expect(detectUniverfileSQLiteFormat(source)).toBe("v1");
    expect(detectUniverfileSQLiteFormat(output)).toBe("v2");
  });

  it("reuses one scoped Asset ID for the same image in a snapshot and its changeset", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "optimized.univer");
    const service = new CollabService({ dbPath: source, create: true });
    const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    try {
      const worktree = service.createWorktree("agent", "merged");
      await changeWorktree(service, worktree.worktreeId, "edit", {
        modify: { [unit.unitId]: [cellMutation(unit.unitId)] }
      });
      expect((await service.merge(worktree.worktreeId)).ok).toBe(true);
    } finally {
      await service.dispose();
    }
    injectLegacyImage(source, unit.unitId);
    injectLegacyImageIntoChangeset(source, unit.unitId);

    await optimizeUniverfilePath({
      sourcePath: source,
      outputPath: output,
      images: "externalize",
      dryRun: false
    });

    const database = new UniverfileSQLiteConnection({ filename: output });
    try {
      const snapshotSource = imageSource(JSON.parse(snapshotPayload(database, unit.unitId)));
      const changesetSource = changesetImageSource(database, unit.unitId);
      expect(snapshotSource).toMatch(/[0-9a-f-]{36}/);
      expect(changesetSource).toBe(snapshotSource);
      expect(unitHead(database, unit.unitId)).toBe(2);
      expect(countRows(database, "collaboration_snapshots")).toBe(1);
      expect(countRows(database, "collaboration_changesets")).toBe(1);
      expect(countRows(database, "collaboration_assets")).toBe(1);
      expect(countRows(database, "collaboration_asset_blobs")).toBe(1);
    } finally {
      database.dispose();
    }
  });

  it("worktrees clean removes only merged and discarded worktrees", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "clean.univer");
    const service = new CollabService({ dbPath: source, create: true });
    try {
      await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
      service.createWorktree("agent", "draft");
      const discarded = service.createWorktree("agent", "discarded");
      await service.discard(discarded.worktreeId);

      const report = await optimizeUniverfilePath({
        sourcePath: source,
        outputPath: output,
        worktrees: "clean",
        dryRun: false
      });
      expect(report.worktrees).toMatchObject({ mode: "clean", removedWorktrees: 1 });
      expect(report.history.mode).toBe("preserve");
    } finally {
      await service.dispose();
    }

    const outputDatabase = new UniverfileSQLiteConnection({ filename: output });
    try {
      const statuses = outputDatabase.database
        .prepare("SELECT status FROM collaboration_worktrees ORDER BY status")
        .all() as unknown as Array<{ status: string }>;
      expect(statuses).toEqual([{ status: "draft" }]);
    } finally {
      outputDatabase.dispose();
    }
  });

  it("cleans terminal worktrees before externalizing images", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "combined.univer");
    const service = new CollabService({ dbPath: source, create: true });
    const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    try {
      const discarded = service.createWorktree("agent", "discarded-with-image");
      await changeWorktree(service, discarded.worktreeId, "embedded image", {
        modify: { [unit.unitId]: [imageMutation(unit.unitId)] }
      });
      await service.discard(discarded.worktreeId);
    } finally {
      await service.dispose();
    }

    const report = await optimizeUniverfilePath({
      sourcePath: source,
      outputPath: output,
      worktrees: "clean",
      images: "externalize",
      dryRun: false
    });
    expect(report.worktrees.removedWorktrees).toBe(1);
    expect(report.images.references).toBe(0);

    const database = new UniverfileSQLiteConnection({ filename: output });
    try {
      expect(countRows(database, "collaboration_worktrees")).toBe(0);
      expect(countRows(database, "collaboration_assets")).toBe(0);
      expect(countRows(database, "collaboration_asset_blobs")).toBe(0);
    } finally {
      database.dispose();
    }
  });

  it("history reset refuses active worktrees without creating an output", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "reset.univer");
    const service = new CollabService({ dbPath: source, create: true });
    const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    try {
      const worktree = service.createWorktree("agent", "merged");
      await changeWorktree(service, worktree.worktreeId, "edit", {
        modify: { [unit.unitId]: [cellMutation(unit.unitId)] }
      });
      expect((await service.merge(worktree.worktreeId)).ok).toBe(true);
      const active = service.createWorktree("agent", "draft");
      await expect(
        optimizeUniverfilePath({
          sourcePath: source,
          outputPath: output,
          history: "reset",
          dryRun: false
        })
      ).rejects.toMatchObject({
        semanticCode: "OPTIMIZE_HISTORY_ACTIVE_WORKTREES",
        details: {
          activeWorktrees: [
            expect.objectContaining({ worktreeId: active.worktreeId, status: "draft" })
          ]
        }
      });
      expect(existsSync(output)).toBe(false);
    } finally {
      await service.dispose();
    }
  });

  it("history reset materializes trunk heads at revision 1 and the next write is 1 to 2", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "reset.univer");
    const service = new CollabService({ dbPath: source, create: true });
    const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    try {
      const worktree = service.createWorktree("agent", "merged");
      await changeWorktree(service, worktree.worktreeId, "edit", {
        modify: { [unit.unitId]: [cellMutation(unit.unitId)] }
      });
      expect((await service.merge(worktree.worktreeId)).ok).toBe(true);

      const report = await optimizeUniverfilePath({
        sourcePath: source,
        outputPath: output,
        history: "reset",
        dryRun: false
      });
      expect(report.worktrees).toEqual({
        mode: "clean",
        impliedByHistory: true,
        removedWorktrees: 1
      });
      expect(report.history).toMatchObject({
        mode: "reset",
        resetUnits: 1,
        removedChangesets: 1
      });
    } finally {
      await service.dispose();
    }

    const outputDatabase = new UniverfileSQLiteConnection({ filename: output });
    try {
      expect(countRows(outputDatabase, "collaboration_worktrees")).toBe(0);
      expect(countRows(outputDatabase, "collaboration_changesets")).toBe(0);
      expect(countRows(outputDatabase, "collaboration_snapshots")).toBe(1);
      expect(unitHead(outputDatabase, unit.unitId)).toBe(1);
      expect(JSON.parse(snapshotPayload(outputDatabase, unit.unitId))).toMatchObject({ rev: 1 });
      expect(outputDatabase.database.prepare("PRAGMA quick_check").get()).toMatchObject({
        quick_check: "ok"
      });
    } finally {
      outputDatabase.dispose();
    }

    const reopened = new CollabService({ dbPath: output });
    try {
      expect(reopened.listUnits()).toEqual([
        expect.objectContaining({ unitId: unit.unitId, headRev: 1 })
      ]);
      const next = reopened.createWorktree("agent", "next");
      await changeWorktree(reopened, next.worktreeId, "next", {
        modify: { [unit.unitId]: [cellMutation(unit.unitId)] }
      });
      expect((await reopened.merge(next.worktreeId)).ok).toBe(true);
      expect(reopened.listUnits()).toEqual([
        expect.objectContaining({ unitId: unit.unitId, headRev: 2 })
      ]);
    } finally {
      await reopened.dispose();
    }
  });

  it("exposes optimization through the addressed control API", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "copy.univer");
    const server = await startServer({ port: 0 });
    try {
      server.manager.createUniverfile(source);
      const client = new WorktreeControlClient({
        origin: `http://127.0.0.1:${server.port}`,
        univerfile: source
      });
      const response = await client.optimize({
        outputPath: output,
        worktrees: "clean",
        dryRun: false
      });
      expect(response).toMatchObject({
        ok: true,
        error: { code: 1 },
        report: { outputPath: output, worktrees: { mode: "clean" } }
      });
      expect(existsSync(output)).toBe(true);
    } finally {
      await server.close();
    }
  });

  function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "univer-optimize-"));
    directories.push(directory);
    return realpathSync(directory);
  }
});

function injectLegacyImage(path: string, unitId: string): void {
  const connection = new UniverfileSQLiteConnection({ filename: path });
  try {
    const payload = snapshotPayload(connection, unitId);
    const snapshot = JSON.parse(payload) as Record<string, unknown>;
    snapshot.legacyEmbeddedImage = {
      source: PNG_DATA_URI,
      imageSourceType: "BASE64"
    };
    connection.database
      .prepare("UPDATE collaboration_snapshots SET payload_json = ? WHERE unit_id = ?")
      .run(JSON.stringify(snapshot), unitId);
  } finally {
    connection.dispose();
  }
}

function injectLegacyImageIntoChangeset(path: string, unitId: string): void {
  const connection = new UniverfileSQLiteConnection({ filename: path });
  try {
    const row = connection.database
      .prepare(
        "SELECT rowid, payload_json FROM collaboration_changesets WHERE unit_id = ? ORDER BY revision DESC LIMIT 1"
      )
      .get(unitId) as { rowid: number; payload_json: string } | undefined;
    if (row === undefined) throw new Error(`changeset missing for ${unitId}`);
    const changeset = JSON.parse(row.payload_json) as { mutations: Array<{ data: string }> };
    const data = JSON.parse(changeset.mutations[0]?.data ?? "{}") as Record<string, unknown>;
    data.legacyEmbeddedImage = { source: PNG_DATA_URI, imageSourceType: "BASE64" };
    if (changeset.mutations[0] === undefined) throw new Error("changeset mutation missing");
    changeset.mutations[0].data = JSON.stringify(data);
    connection.database
      .prepare("UPDATE collaboration_changesets SET payload_json = ? WHERE rowid = ?")
      .run(JSON.stringify(changeset), row.rowid);
  } finally {
    connection.dispose();
  }
}

function changesetImageSource(connection: UniverfileSQLiteConnection, unitId: string): string {
  const row = connection.database
    .prepare(
      "SELECT payload_json FROM collaboration_changesets WHERE unit_id = ? ORDER BY revision DESC LIMIT 1"
    )
    .get(unitId) as { payload_json: string } | undefined;
  if (row === undefined) throw new Error(`changeset missing for ${unitId}`);
  const changeset = JSON.parse(row.payload_json) as { mutations: Array<{ data: string }> };
  return imageSource(JSON.parse(changeset.mutations[0]?.data ?? "{}"));
}

function imageSource(value: unknown): string {
  const image = (value as { legacyEmbeddedImage?: { source?: unknown } }).legacyEmbeddedImage;
  if (typeof image?.source !== "string") throw new Error("image source missing");
  return image.source;
}

function snapshotPayload(connection: UniverfileSQLiteConnection, unitId: string): string {
  const row = connection.database
    .prepare(
      "SELECT payload_json FROM collaboration_snapshots WHERE unit_id = ? ORDER BY revision DESC LIMIT 1"
    )
    .get(unitId) as { payload_json: string } | undefined;
  if (row === undefined) throw new Error(`snapshot missing for ${unitId}`);
  return row.payload_json;
}

function countRows(connection: UniverfileSQLiteConnection, table: string): number {
  const row = connection.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return Number(row.count);
}

function unitHead(connection: UniverfileSQLiteConnection, unitId: string): number {
  const row = connection.database
    .prepare("SELECT head_revision FROM collaboration_units WHERE unit_id = ?")
    .get(unitId) as { head_revision: number } | undefined;
  if (row === undefined) throw new Error(`unit missing for ${unitId}`);
  return Number(row.head_revision);
}

function markAsGatewayV1(path: string): void {
  const connection = new UniverfileSQLiteConnection({ filename: path });
  try {
    connection.database.exec(`
      ALTER TABLE collaboration_worktrees
      ADD COLUMN head_commit INTEGER NOT NULL DEFAULT 0 CHECK (head_commit >= 0);
      CREATE TABLE collaboration_worktree_commits (
        worktree_id TEXT NOT NULL,
        seq INTEGER NOT NULL CHECK (seq >= 1),
        message TEXT NOT NULL,
        custom_tag_json TEXT,
        units_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (worktree_id, seq),
        FOREIGN KEY (worktree_id)
          REFERENCES collaboration_worktrees(worktree_id) ON DELETE CASCADE
      );
      UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'worktree';
    `);
  } finally {
    connection.dispose();
  }
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function cellMutation(unitId: string): IMutation {
  return {
    id: "sheet.mutation.set-range-values",
    data: JSON.stringify({
      unitId,
      subUnitId: "sheet-1",
      cellValue: { 0: { 0: { v: 42 } } }
    })
  } as IMutation;
}

function imageMutation(unitId: string): IMutation {
  return {
    id: "sheet.mutation.set-range-values",
    data: JSON.stringify({
      unitId,
      subUnitId: "sheet-1",
      cellValue: { 0: { 0: { v: 42 } } },
      legacyEmbeddedImage: { source: PNG_DATA_URI, imageSourceType: "BASE64" }
    })
  } as IMutation;
}
