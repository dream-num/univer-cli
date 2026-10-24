import type { UniverRenderUnit } from "@univer-cli/univer-render-runtime";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApplicationConfig } from "../src/environment/config.js";
import { createLocalRenderApplication } from "../src/features/render/service.js";

describe("Local Board model lint", () => {
  it("reads Board source and checks it without starting Chrome or modifying its snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "univer-board-model-"));
    const runtimeFactory = vi.fn(async () => {
      throw new Error("Browser must not start");
    });
    const source = {
      unitType: "board",
      unitData: {
        id: "board-model",
        name: "Model",
        appVersion: "1.0.3",
        defaultPageSize: { width: 1000, height: 1000 },
        pageOrder: ["canvas"],
        pages: { canvas: { id: "canvas", name: "Canvas", elements: {}, elementOrder: [] } },
      },
    } as unknown as Extract<UniverRenderUnit, { unitType: "board" }>;
    const before = structuredClone(source);
    const application = createLocalRenderApplication({
      browserCacheRoot: join(root, "browsers"),
      browserRuntimeRoot: join(root, "runtime"),
      config: createApplicationConfig({
        configPath: join(root, "config.json"),
        daemonDir: join(root, "daemon"),
        homeDir: root,
        socketPath: join(root, "daemon", "socket"),
      }),
      env: { UNIVER_LICENSE: "test-license" },
      source: {
        async load() {
          return source;
        },
      },
      runtimeFactory,
    });
    try {
      const loaded = await application.loadLayoutLintSource({
        path: "canvas.univer",
        unitId: "board-model",
      });
      expect(loaded.unitType).toBe("board");
      if (loaded.unitType !== "board") throw new Error("Board source expected");
      const report = await application.layoutLint.lint({ ...loaded, mode: "model" });
      expect(report).toMatchObject({
        unitType: "board",
        mode: "model",
        status: "clean",
        coverage: { complete: true, sources: ["model"] },
      });
      expect(runtimeFactory).not.toHaveBeenCalled();
      expect(source).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
