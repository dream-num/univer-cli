import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import type { LocalOptimizeApplication } from "../src/features/optimize/service.js";

describe("Local data maintenance commands", () => {
  it("keeps optimize copy-only and maps each selected pass explicitly", async () => {
    let input: unknown;
    const application: LocalOptimizeApplication = {
      async optimize(value) {
        input = value;
        return optimizeReport(value.path, value.outputPath);
      },
    };
    const missingOutput = await invoke(["optimize", "book.univer", "--json"], application);
    expect(missingOutput.exitCode).toBe(1);
    expect(JSON.parse(missingOutput.stderr)).toMatchObject({
      error: { code: "OPTIMIZE_OUTPUT_REQUIRED" },
      ok: false,
    });

    const optimized = await invoke(
      [
        "optimize",
        "book.univer",
        "--out",
        "compact.univer",
        "--images",
        "--worktrees",
        "--history",
        "--json",
      ],
      application,
    );
    expect(optimized.exitCode).toBe(0);
    expect(input).toEqual({
      dryRun: false,
      history: "reset",
      images: "externalize",
      outputPath: "compact.univer",
      path: "book.univer",
      worktrees: "clean",
    });
    expect(JSON.parse(optimized.stdout)).toMatchObject({
      sourcePath: "book.univer",
      outputPath: "compact.univer",
      dryRun: false,
    });
  });
});

async function invoke(
  argv: readonly string[],
  optimizeApplication: LocalOptimizeApplication,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const exitCode = await runCli(argv, {
    program: { optimizeApplication },
    streams: {
      writeErr: (text) => stderr.push(text),
      writeOut: (text) => stdout.push(text),
    },
  });
  return { exitCode, stderr: stderr.join(""), stdout: stdout.join("") };
}

function optimizeReport(sourcePath: string, outputPath?: string) {
  return {
    sourcePath,
    ...(outputPath === undefined ? {} : { outputPath }),
    dryRun: outputPath === undefined,
    beforeBytes: 100,
    ...(outputPath === undefined ? {} : { afterBytes: 80 }),
    images: {
      selected: false,
      references: 0,
      uniqueBlobs: 0,
      sourceBytes: 0,
      storedBytes: 0,
    },
    worktrees: { mode: "preserve" as const, impliedByHistory: false, removedWorktrees: 0 },
    history: {
      mode: "preserve" as const,
      resetUnits: 0,
      removedSnapshots: 0,
      removedChangesets: 0,
    },
  };
}
