import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startServer } from "@univer/collab-gateway";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it } from "vitest";
import { createLocalCollaborationRuntimePool } from "../src/daemon/collaboration-runtime-pool.js";
import { createV2Fixture } from "./univerfile-fixture.js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("Local collaboration runtime worker", () => {
  it("loads a Local .univer Unit through the Gateway-backed SDK runtime pool", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "univer-cli-runtime-")));
    const filename = join(root, "runtime.univer");
    await createV2Fixture(filename);
    const gateway = await startServer({
      port: 0,
      viewAssetsRoot: join(projectRoot, "..", "..", "packages", "collab-web", "dist"),
    });
    const runtimes = createLocalCollaborationRuntimePool({
      entry: pathToFileURL(join(projectRoot, "dist", "runtime-worker.js")),
      origin: `http://127.0.0.1:${String(gateway.port)}`,
    });

    try {
      await expect(
        runtimes.probe({
          filePath: filename,
          unitId: "unit-1",
          unitType: UniverInstanceType.UNIVER_SHEET,
        }),
      ).resolves.toMatchObject({
        baseRevision: 1,
        knownHeadRevision: 1,
      });
    } finally {
      await runtimes.close();
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("loads a same-Worktree Sheet as a DocBlock embed child", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "univer-cli-runtime-embed-")));
    const filename = join(root, "runtime-embed.univer");
    await createV2Fixture(filename);
    const gateway = await startServer({
      port: 0,
      viewAssetsRoot: join(projectRoot, "..", "..", "packages", "collab-web", "dist"),
    });
    const univerfile = gateway.manager.openByPath(filename);
    const worktree = univerfile.collab.createWorktree("", "Embed regression");
    const sheet = await univerfile.collab.createWorktreeUnit(
      worktree.worktreeId,
      UniverInstanceType.UNIVER_SHEET,
      "Embedded Sheet",
    );
    const doc = await univerfile.collab.createWorktreeUnit(
      worktree.worktreeId,
      UniverInstanceType.UNIVER_DOC,
      "Host Doc",
    );
    const runtimes = createLocalCollaborationRuntimePool({
      entry: pathToFileURL(join(projectRoot, "dist", "runtime-worker.js")),
      origin: `http://127.0.0.1:${String(gateway.port)}`,
    });
    const lease = await runtimes.acquire({
      filePath: filename,
      unitId: doc.unitId,
      unitType: UniverInstanceType.UNIVER_DOC,
      worktreeId: worktree.worktreeId,
    });

    try {
      const result = await lease.execute({
        code: `
          const embed = univerAPI.createEmbed({
            host: {
              unitId: ${JSON.stringify(doc.unitId)},
              surface: univerAPI.Enum.FEmbedHostSurface.DocBlock,
            },
            content: {
              unitType: univerAPI.Enum.UniverInstanceType.UNIVER_SHEET,
              ref: ${JSON.stringify(`#unit=${sheet.unitId}&type=sheet`)},
            },
            interaction: "interactive",
          });
          const child = await embed.loadAsync();
          return { childId: child?.getId?.() ?? null };
        `,
        mode: "write",
      });

      expect(result.value).toEqual({ childId: sheet.unitId });
      expect(result.mutations.length).toBeGreaterThan(0);
      await expect(lease.commit()).resolves.toMatchObject({ status: "confirmed" });
      await expect(lease.getState()).resolves.toMatchObject({
        baseRevision: 2,
        pendingMutationCount: 0,
      });
    } finally {
      await lease.release();
      await runtimes.close();
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});
