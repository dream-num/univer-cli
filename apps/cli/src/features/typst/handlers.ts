import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import { materializeDocProgram } from "@univer-cli/doc-markdown-facade/node";
import type { HeadlessUniverFactory } from "@univer-cli/headless-univer";
import type { StartedServer } from "@univer/collab-gateway";
import { UniverInstanceType } from "@univerjs/core";
import {
  codedError,
  requireDraftWorktree,
  requireUnit,
} from "../../daemon/collaboration-access.js";
import { CONTENT_CREATE_DOCUMENT_METHOD, parseContentCreateDocumentRequest } from "./protocol.js";

export function registerTypstHandlers(input: {
  readonly createHeadlessUniver: HeadlessUniverFactory;
  readonly daemon: DaemonServer;
  readonly gateway: StartedServer;
}): void {
  input.daemon.handle(CONTENT_CREATE_DOCUMENT_METHOD, async (payload) => {
    const request = parseContentCreateDocumentRequest(payload);
    const univerfile = input.gateway.manager.openByPath(request.path);
    requireDraftWorktree(univerfile.collab, request.worktreeId);
    if (
      univerfile.collab
        .worktreeUnits(request.worktreeId)
        .some((unit) => unit.unitId === request.unitId)
    ) {
      throw codedError(
        "DOC_UNIT_ALREADY_EXISTS",
        `Unit ${request.unitId} already exists in Worktree ${request.worktreeId}`,
      );
    }
    const materialized = await materializeDocProgram(
      { targetUnitId: request.unitId, javascript: request.code },
      { createUniver: input.createHeadlessUniver },
    );
    await univerfile.collab.createWorktreeUnit(
      request.worktreeId,
      UniverInstanceType.UNIVER_DOC,
      request.name,
      request.unitId,
      materialized.data,
    );
    const unit = requireUnit(univerfile.collab, request.worktreeId, request.unitId);
    return {
      filePath: univerfile.path,
      headRev: unit.headRev,
      kind: "doc",
      name: unit.name,
      type: unit.type,
      unitId: unit.unitId,
      worktreeId: request.worktreeId,
      ...(materialized.value === undefined
        ? {}
        : { value: JSON.parse(JSON.stringify(materialized.value)) as JsonValue }),
    } as JsonValue;
  });
}
