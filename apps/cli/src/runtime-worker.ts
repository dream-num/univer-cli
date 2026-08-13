import {
  createCollaborationServerAdapter,
  createUniverCollaborationRuntimeFactory,
} from "@univer-cli/univer-collaboration-runtime";
import { createStandardHeadlessUniverFactory } from "@univer-cli/headless-univer";
import { defineUniverCollaborationRuntimeWorker } from "@univer-cli/univer-collaboration-runtime-pool";
import type { LocalRuntimeWorkerInit } from "./daemon/collaboration-runtime-pool.js";

const createUniver = createStandardHeadlessUniverFactory({
  license: process.env["UNIVER_LICENSE"] ?? "",
});

export default defineUniverCollaborationRuntimeWorker({
  async createRuntime(init: LocalRuntimeWorkerInit) {
    return await createUniverCollaborationRuntimeFactory({
      backend: createCollaborationServerAdapter(init.server),
      createUniver,
    }).load(init.unitId, init.unitType);
  },
});
