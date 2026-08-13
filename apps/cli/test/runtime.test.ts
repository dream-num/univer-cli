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
});
