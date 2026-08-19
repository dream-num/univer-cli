import type { DaemonServer, JsonValue } from "@univer-cli/daemon";
import {
  createStandardHeadlessUniverFacade,
  type HeadlessUniverFactory,
} from "@univer-cli/headless-univer";
import type { StartedServer } from "@univer/collab-gateway";
import { UniverInstanceType, type IDocumentData } from "@univerjs/core";
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
    const data = await materializeDocument(
      input.createHeadlessUniver,
      request.unitId,
      request.code,
    );
    await univerfile.collab.createWorktreeUnit(
      request.worktreeId,
      UniverInstanceType.UNIVER_DOC,
      request.name,
      request.unitId,
      data,
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
    } as JsonValue;
  });
}

async function materializeDocument(
  createUniver: HeadlessUniverFactory,
  unitId: string,
  code: string,
): Promise<IDocumentData> {
  const univer = await createUniver({ unitId, unitType: UniverInstanceType.UNIVER_DOC });
  try {
    const univerAPI = createStandardHeadlessUniverFacade(univer);
    // The compiler emits a trusted async function body that creates exactly one target Doc.
    // oxlint-disable-next-line no-new-func -- this is the explicit local authoring execution seam.
    const execute = new Function(
      "univerAPI",
      `"use strict"; return (async () => { ${code}\n})();`,
    ) as (api: typeof univerAPI) => Promise<unknown>;
    await execute(univerAPI);
    const document = univerAPI.getDocument(unitId);
    if (document === null) {
      throw codedError(
        "DOC_PROGRAM_TARGET_MISSING",
        `Document program did not create target Unit ${unitId}`,
      );
    }
    return document.save();
  } finally {
    univer.dispose();
  }
}
