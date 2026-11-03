import type { UnitRuntimeConfig } from "@univerjs-pro/collaboration-service";

/**
 * Unit runtime placement for every Collaboration SDK runtime owner in the Gateway: the trunk
 * Service, the Worktree Service and each Unit Snapshot Materializer.
 *
 * The SDK defaults to a pool of worker threads per owner, each loading the full Univer SDK. The
 * Gateway opens one Service pair per `.univer` file and one materializer per comparison or
 * export, so every owner would pay a worker-pool start and teardown, and the bundled application
 * has no `unit-runtime-worker.cjs` beside the SDK module. Keep execution in-process.
 */
export const GATEWAY_UNIT_RUNTIME: UnitRuntimeConfig = { execution: { mode: "in-process" } };
