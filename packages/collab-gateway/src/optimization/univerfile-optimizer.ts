import { existsSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import type {
  OptimizeUniverfileHistory,
  OptimizeUniverfileReport,
  OptimizeUniverfileWorktrees,
} from "@univer/collab-gateway-contract";
import { copyUniverfile, openUniverfile, type Univerfile } from "@univer/univerfile-sqlite";

export interface OptimizeUniverfileCopyInput {
  readonly sourcePath: string;
  readonly outputPath?: string;
  readonly worktrees?: OptimizeUniverfileWorktrees;
  readonly history?: OptimizeUniverfileHistory;
  readonly dryRun: boolean;
}

type OptimizeResult = Pick<OptimizeUniverfileReport, "history" | "worktrees">;

/**
 * Writes an optimized copy of a `.univer` file by combining the package's atomic maintenance
 * operations on a private copy. The source is only read; an older format is upgraded on the copy.
 * A dry run performs every step and then deletes the copy.
 */
export async function optimizeUniverfilePath(
  input: OptimizeUniverfileCopyInput,
): Promise<OptimizeUniverfileReport> {
  validateInput(input);
  const beforeBytes = statSync(input.sourcePath).size;
  // The copy, and the backup an upgrade writes next to it, stay in a private directory. Outside a
  // dry run it shares the output's file system, so the final rename is atomic.
  const workDirectory = mkdtempSync(
    join(
      input.dryRun ? tmpdir() : dirname(resolve(input.outputPath as string)),
      ".univer-optimize-",
    ),
  );
  const workPath = join(workDirectory, "optimized.univer");
  try {
    copyUniverfile(input.sourcePath, workPath);
    const file = openUniverfile(workPath);
    let result: OptimizeResult;
    try {
      result = optimize(file, input);
      file.verify();
      file.vacuum();
    } finally {
      await file.close();
    }
    const afterBytes = statSync(workPath).size;
    if (!input.dryRun) renameSync(workPath, input.outputPath as string);
    return {
      sourcePath: input.sourcePath,
      ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
      dryRun: input.dryRun,
      beforeBytes,
      afterBytes,
      ...result,
    };
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

function optimize(file: Univerfile, input: OptimizeUniverfileCopyInput): OptimizeResult {
  let removedWorktrees = 0;
  let removedAssets = 0;
  if (input.worktrees === "clean") {
    for (const worktree of file.worktree.listWorktrees()) {
      if (worktree.status !== "merged" && worktree.status !== "discarded") continue;
      const deleted = file.worktree.deleteWorktree(worktree.worktreeId);
      if (deleted.status !== "deleted") {
        throw new Error(
          `OPTIMIZE_WORKTREES_CLEAN_FAILED: Worktree ${worktree.worktreeId} was ${deleted.status}`,
        );
      }
      removedWorktrees += 1;
      removedAssets += deleted.assets;
    }
  }

  let removedSnapshots = 0;
  let removedSheetBlocks = 0;
  if (input.history === "compact") {
    // Keep each Unit's earliest snapshot, which the package protects, and its latest stored one;
    // changesets stay, so every revision in between can still be replayed.
    for (const unit of file.trunk.listSnapshotRevisions()) {
      const intermediate = unit.revisions.slice(1, -1);
      if (intermediate.length === 0) continue;
      const deleted = file.trunk.deleteSnapshots(unit.unitId, intermediate);
      removedSnapshots += deleted.snapshots;
      removedSheetBlocks += deleted.sheetBlocks;
    }
  }

  return {
    worktrees: {
      mode: input.worktrees ?? "preserve",
      removedWorktrees,
      removedAssets,
    },
    history: {
      mode: input.history ?? "preserve",
      removedSnapshots,
      removedSheetBlocks,
    },
  };
}

function validateInput(input: OptimizeUniverfileCopyInput): void {
  if (input.worktrees === undefined && input.history === undefined) {
    throw new Error("NO_OPTIMIZATION_SELECTED: select --worktrees or --history");
  }
  if (input.dryRun) return;
  if (input.outputPath === undefined) {
    throw new Error("OPTIMIZE_OUTPUT_REQUIRED: outputPath is required");
  }
  const sourcePath = resolve(input.sourcePath);
  const outputPath = resolve(input.outputPath);
  if (sourcePath === outputPath) {
    throw new Error("OPTIMIZE_OUTPUT_EQUALS_SOURCE: output must differ from source");
  }
  if (extname(outputPath).toLowerCase() !== ".univer") {
    throw new Error("OPTIMIZE_OUTPUT_INVALID: output must be a .univer path");
  }
  if (existsSync(outputPath)) {
    throw new Error(`OPTIMIZE_OUTPUT_EXISTS: output already exists: ${outputPath}`);
  }
  if (!existsSync(dirname(outputPath))) {
    throw new Error(
      `OPTIMIZE_OUTPUT_PARENT_MISSING: output parent does not exist: ${dirname(outputPath)}`,
    );
  }
}
