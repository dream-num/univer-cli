import type { IMutation } from "@univerjs/protocol";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverInstanceType } from "@univerjs/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type StartedServer } from "../src/server.js";
import { changeWorktree } from "./change-worktree.js";

function setCell(unitId: string, row: number, col: number, v: string): IMutation[] {
  return [
    {
      id: "sheet.mutation.set-range-values",
      data: JSON.stringify({
        unitId,
        subUnitId: "sheet-1",
        cellValue: { [row]: { [col]: { v, t: 1 } } }
      })
    }
  ] as unknown as IMutation[];
}

describe("merge preview HTTP endpoints", () => {
  let server: StartedServer;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "gw-preview-"));
    server = await startServer({ port: 0 });
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET .../preview returns the summary; .../preview/units/<id> returns sheet render data", async () => {
    const ufPath = join(dir, "book.univer");
    const key = Buffer.from(ufPath).toString("base64url");

    // Seed in-process via the resident authority, then exercise the HTTP read paths.
    const uf = server.manager.createByKey(key);
    const sheet = await uf.collab.createUnit(UniverInstanceType.UNIVER_SHEET, { name: "S" });
    const w = uf.collab.createWorktree("agent");
    await changeWorktree(uf.collab, w.worktreeId, "edit", {
      modify: { [sheet.unitId]: setCell(sheet.unitId, 0, 0, "x") }
    });

    const base = `http://127.0.0.1:${server.port}/uf/${key}/worktrees/${w.worktreeId}`;

    const summary = (await (await fetch(`${base}/preview`)).json()) as {
      error: { code: number };
      worktreeId: string;
      mergeable: boolean;
      diverged: boolean;
      units: Array<{ unitId: string; status: string }>;
      conflicts: string[];
    };
    expect(summary.error.code).toBe(1);
    expect(summary.worktreeId).toBe(w.worktreeId);
    expect(summary.mergeable).toBe(true);
    expect(summary.diverged).toBe(false);
    expect(summary.units.find((u) => u.unitId === sheet.unitId)?.status).toBe("modified");

    const unit = (await (await fetch(`${base}/preview/units/${sheet.unitId}`)).json()) as {
      error: { code: number };
      type: number;
      snapshot: unknown;
      sheetBlocks?: unknown[];
      changesets: unknown[];
    };
    expect(unit.error.code).toBe(1);
    expect(unit.type).toBe(UniverInstanceType.UNIVER_SHEET);
    expect(unit.snapshot).toBeTruthy();
    expect(Array.isArray(unit.sheetBlocks)).toBe(true);
    expect(Array.isArray(unit.changesets)).toBe(true);
    expect(unit.changesets.length).toBeGreaterThan(0);
  });
});
