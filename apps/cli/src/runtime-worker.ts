import {
  createCollaborationServerAdapter,
  createUniverCollaborationRuntimeFactory,
  type UniverFactoryContext,
} from "@univer-cli/univer-collaboration-runtime";
import { createStandardHeadlessUniverFactory } from "@univer-cli/headless-univer";
import { defineUniverCollaborationRuntimeWorker } from "@univer-cli/univer-collaboration-runtime-pool";
import type { LocalRuntimeWorkerInit } from "./daemon/collaboration-runtime-pool.js";
import { createLocalReferencedUnitProviderRegistration } from "./runtime/local-referenced-unit-provider.js";
import { LocalSnapshotServerAdapter } from "./runtime/local-snapshot-server-adapter.js";

export default defineUniverCollaborationRuntimeWorker({
  async createRuntime(init: LocalRuntimeWorkerInit) {
    const snapshotServerService = new LocalSnapshotServerAdapter(init.server.snapshotServerUrl);
    const createUniver = async (context: UniverFactoryContext) => {
      if (context.resolveSnapshotService === undefined) {
        throw Object.assign(new Error("Local referenced Unit loading requires SnapshotService"), {
          code: "LOCAL_RUNTIME_SNAPSHOT_SERVICE_REQUIRED",
        });
      }
      return await createStandardHeadlessUniverFactory({
        embedPluginConfig: {
          resourceRefUnitProviderRegistrations: [
            createLocalReferencedUnitProviderRegistration({
              resolveSnapshotService: context.resolveSnapshotService,
            }),
          ],
        },
        license: process.env["UNIVER_LICENSE"] ?? "",
      })(context);
    };
    return await createUniverCollaborationRuntimeFactory({
      backend: createCollaborationServerAdapter(init.server),
      createUniver,
      snapshotServerService,
    }).load(init.unitId, init.unitType);
  },
});
