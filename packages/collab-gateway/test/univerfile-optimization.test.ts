import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverInstanceType } from "@univerjs/core";
import type { IMutation } from "@univerjs/protocol";
import { WorktreeControlClient } from "@univer/collab-gateway-contract";
import { openUniverfile } from "@univer/univerfile-sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CollabService } from "../src/collab-service.js";
import { optimizeUniverfilePath } from "../src/optimization/univerfile-optimizer.js";
import { startServer } from "../src/server.js";
import { changeWorktree } from "./change-worktree.js";

const DATABASE_CONTEXT = { userID: "local", customData: {}, request: {} };
const RELEASED_FIXTURES = join(
  import.meta.dirname,
  "..",
  "..",
  "univerfile-sqlite",
  "test",
  "fixtures",
);

describe("Univerfile copy optimization", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("worktrees clean removes merged and discarded Worktrees with their Assets", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "clean.univer");
    const service = new CollabService({ dbPath: source, create: true });
    let draftId: string;
    try {
      const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
      draftId = (await service.createWorktree("agent", "draft")).worktreeId;
      const merged = await service.createWorktree("agent", "merged");
      await changeWorktree(service, merged.worktreeId, "edit", {
        modify: { [unit.unitId]: [cellMutation(unit.unitId, 1)] },
      });
      expect((await service.merge(merged.worktreeId)).ok).toBe(true);
      const discarded = await service.createWorktree("agent", "discarded");
      service.storeAsset({
        unitId: unit.unitId,
        worktreeId: discarded.worktreeId,
        originalFilename: "pixel.png",
        mediaType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      });
      await service.discard(discarded.worktreeId);
    } finally {
      await service.dispose();
    }
    const sourceHash = fileHash(source);

    const report = await optimizeUniverfilePath({
      sourcePath: source,
      outputPath: output,
      worktrees: "clean",
      dryRun: false,
    });

    expect(report).toMatchObject({
      sourcePath: source,
      outputPath: output,
      dryRun: false,
      worktrees: { mode: "clean", removedWorktrees: 2, removedAssets: 1 },
      history: { mode: "preserve", removedSnapshots: 0, removedSheetBlocks: 0 },
    });
    expect(report.afterBytes).toBeGreaterThan(0);
    expect(fileHash(source)).toBe(sourceHash);
    expect(readdirSync(directory).sort()).toEqual(["clean.univer", "source.univer"]);
    await withFile(output, (file) => {
      expect(file.worktree.listWorktrees().map(({ worktreeId }) => worktreeId)).toEqual([draftId]);
    });
  });

  it("history compact keeps each Unit's earliest and latest snapshots and every changeset", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "compact.univer");
    const service = new CollabService({ dbPath: source, create: true });
    const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
    let head: unknown;
    let historyIds: readonly string[];
    try {
      await mergeSnapshots(service, unit.unitId, 3);
      // Active Worktrees do not block compaction: their baselines stay readable from changesets.
      await service.createWorktree("agent", "draft");
      head = withoutBlockIds(await service.materializeUnit(unit.unitId, UniverInstanceType.UNIVER_SHEET));
      historyIds = await listHistory(service, unit.unitId);
    } finally {
      await service.dispose();
    }
    await withFile(source, (file) => {
      expect(file.trunk.listSnapshotRevisions()).toEqual([
        { unitId: unit.unitId, revisions: [1, 2, 3, 4] },
      ]);
    });

    const report = await optimizeUniverfilePath({
      sourcePath: source,
      outputPath: output,
      history: "compact",
      dryRun: false,
    });

    expect(report.worktrees).toEqual({ mode: "preserve", removedWorktrees: 0, removedAssets: 0 });
    expect(report.history).toMatchObject({ mode: "compact", removedSnapshots: 2 });
    await withFile(output, (file) => {
      expect(file.trunk.listSnapshotRevisions()).toEqual([
        { unitId: unit.unitId, revisions: [1, 4] },
      ]);
      expect(file.worktree.listWorktrees().map(({ status }) => status)).toEqual([
        "merged",
        "merged",
        "merged",
        "draft",
      ]);
    });

    const reopened = new CollabService({ dbPath: output });
    try {
      expect(withoutBlockIds(await reopened.materializeUnit(unit.unitId, UniverInstanceType.UNIVER_SHEET))).toEqual(head);
      expect(await listHistory(reopened, unit.unitId)).toEqual(historyIds);
      const next = await reopened.createWorktree("agent", "next");
      await changeWorktree(reopened, next.worktreeId, "next", {
        modify: { [unit.unitId]: [cellMutation(unit.unitId, 99)] },
      });
      expect((await reopened.merge(next.worktreeId)).ok).toBe(true);
      expect(reopened.getCurrentRev(unit.unitId)).toBe(5);
    } finally {
      await reopened.dispose();
    }
  });

  it("dry run reports the same result without writing an output", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const output = join(directory, "copy.univer");
    const service = new CollabService({ dbPath: source, create: true });
    try {
      const unit = await service.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "Sheet" });
      await mergeSnapshots(service, unit.unitId, 2);
    } finally {
      await service.dispose();
    }
    const sourceHash = fileHash(source);
    const input = { sourcePath: source, worktrees: "clean", history: "compact" } as const;

    const dryRun = await optimizeUniverfilePath({ ...input, dryRun: true });
    expect(readdirSync(directory)).toEqual(["source.univer"]);
    expect(fileHash(source)).toBe(sourceHash);
    const written = await optimizeUniverfilePath({ ...input, outputPath: output, dryRun: false });

    expect(dryRun).toMatchObject({
      dryRun: true,
      worktrees: { mode: "clean", removedWorktrees: 2 },
      history: { mode: "compact", removedSnapshots: 1 },
    });
    expect(dryRun).not.toHaveProperty("outputPath");
    expect({ ...dryRun, dryRun: false, outputPath: output }).toEqual(written);
  });

  it("validates the selection and the output path before writing anything", async () => {
    const directory = temporaryDirectory();
    const source = join(directory, "source.univer");
    const existing = join(directory, "existing.univer");
    await new CollabService({ dbPath: source, create: true }).dispose();
    copyFileSync(source, existing);
    const base = { sourcePath: source, worktrees: "clean", dryRun: false } as const;

    for (const [input, code] of [
      [{ sourcePath: source, outputPath: join(directory, "a.univer"), dryRun: false }, "NO_OPTIMIZATION_SELECTED"],
      [{ ...base }, "OPTIMIZE_OUTPUT_REQUIRED"],
      [{ ...base, outputPath: source }, "OPTIMIZE_OUTPUT_EQUALS_SOURCE"],
      [{ ...base, outputPath: join(directory, "copy.sqlite") }, "OPTIMIZE_OUTPUT_INVALID"],
      [{ ...base, outputPath: existing }, "OPTIMIZE_OUTPUT_EXISTS"],
      [{ ...base, outputPath: join(directory, "missing", "copy.univer") }, "OPTIMIZE_OUTPUT_PARENT_MISSING"],
    ] as const) {
      await expect(optimizeUniverfilePath(input)).rejects.toThrow(code);
    }
    expect(readdirSync(directory).sort()).toEqual(["existing.univer", "source.univer"]);
  });

  it.each([
    { file: "v0-univer-cli-0.3.8.univer", removedWorktrees: 2 },
    { file: "v1-univer-cli-0.3.12.univer", removedWorktrees: 2 },
    { file: "v1-univer-cli-0.4.4.univer", removedWorktrees: 2 },
    { file: "v2-univer-cli-0.5.0.univer", removedWorktrees: 1 },
  ])("optimizes $file into a current copy and leaves the source as written", async (fixture) => {
    const directory = temporaryDirectory();
    const source = join(directory, fixture.file);
    const output = join(directory, "optimized.univer");
    copyFileSync(join(RELEASED_FIXTURES, fixture.file), source);
    const sourceHash = fileHash(source);

    const report = await optimizeUniverfilePath({
      sourcePath: source,
      outputPath: output,
      worktrees: "clean",
      history: "compact",
      dryRun: false,
    });

    expect(report.worktrees).toMatchObject({ removedWorktrees: fixture.removedWorktrees });
    expect(report.history.mode).toBe("compact");
    expect(fileHash(source)).toBe(sourceHash);
    // The upgrade backup and lock of the working copy never reach the output directory.
    expect(readdirSync(directory).sort()).toEqual([fixture.file, "optimized.univer"].sort());
    await withFile(output, (file) => {
      expect(file.upgrade).toEqual({ status: "unchanged", format: "v3" });
      expect(file.trunk.listUnits()).toMatchObject([{ name: "Scores", headRev: 2 }]);
      const [draft, ...others] = file.worktree.listWorktrees();
      expect(others).toEqual([]);
      expect(draft).toMatchObject({ name: "draft", status: "draft" });
      expect(file.worktree.listWorktreeUnits(draft!.worktreeId).map(({ name }) => name)).toEqual([
        "Scores",
        "Stock",
      ]);
      expect(file.verify()).toMatchObject({ units: 1, worktrees: 1 });
    });
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
        univerfile: source,
      });
      const response = await client.optimize({
        outputPath: output,
        worktrees: "clean",
        history: "compact",
        dryRun: false,
      });
      expect(response).toMatchObject({
        ok: true,
        error: { code: 1 },
        report: {
          outputPath: output,
          worktrees: { mode: "clean" },
          history: { mode: "compact" },
        },
      });
      expect(existsSync(output)).toBe(true);
    } finally {
      await server.close();
    }
  });

  function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "univer-optimize-test-"));
    directories.push(directory);
    return realpathSync(directory);
  }
});

/** Merges `count` Worktrees into trunk and stores a trunk snapshot after each merge. */
async function mergeSnapshots(service: CollabService, unitId: string, count: number): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    const worktree = await service.createWorktree("agent", "merged");
    await changeWorktree(service, worktree.worktreeId, "edit", {
      modify: { [unitId]: [cellMutation(unitId, index)] },
    });
    expect((await service.merge(worktree.worktreeId)).ok).toBe(true);
    const materialized = await service.materializeUnit(unitId, UniverInstanceType.UNIVER_SHEET);
    await service.runtime.trunkAdapter.saveSnapshot(DATABASE_CONTEXT, materialized);
  }
}

async function listHistory(service: CollabService, unitId: string): Promise<readonly string[]> {
  const history = await service.runtime.historyService.getHistoryList(
    { unitID: unitId, length: 20 },
    { userID: "local", customData: {} },
  );
  return history.historyIds;
}

async function withFile(
  path: string,
  inspect: (file: ReturnType<typeof openUniverfile>) => void,
): Promise<void> {
  const file = openUniverfile(path);
  try {
    inspect(file);
  } finally {
    await file.close();
  }
}

/** Materializing assigns fresh Sheet block ids, so compare them by order of appearance. */
function withoutBlockIds(materialized: { readonly sheetBlocks: readonly { id: string }[] }): unknown {
  const names = new Map(materialized.sheetBlocks.map((block, index) => [block.id, `block-${index}`]));
  return JSON.parse(
    JSON.stringify(materialized, (_key, current: unknown) =>
      typeof current === "string" ? (names.get(current) ?? current) : current,
    ),
  );
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function cellMutation(unitId: string, value: number): IMutation {
  return {
    id: "sheet.mutation.set-range-values",
    data: JSON.stringify({
      unitId,
      subUnitId: "sheet-1",
      cellValue: { 0: { 0: { v: value } } },
    }),
  } as IMutation;
}
