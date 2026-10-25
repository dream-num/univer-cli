import type { DaemonClient } from "@univer-cli/daemon";
import { resolveLocalUniverfile } from "../../environment/univerfile-path.js";
import {
  CONTENT_CREATE_DOCUMENT_METHOD,
  parseContentCreateDocumentResult,
  type DocumentCreateResult,
} from "./protocol.js";

export interface LocalTypstApplication {
  createDocumentFromProgram(input: {
    readonly code: string;
    readonly cwd?: string;
    readonly name: string;
    readonly path: string;
    readonly unitId: string;
    readonly worktreeId: string;
  }): Promise<DocumentCreateResult>;
}

export function createLocalTypstApplication(daemon: DaemonClient): LocalTypstApplication {
  return {
    async createDocumentFromProgram(input) {
      const cwd = input.cwd ?? process.cwd();
      return parseContentCreateDocumentResult(
        await daemon.request(CONTENT_CREATE_DOCUMENT_METHOD, {
          code: input.code,
          name: input.name,
          path: resolveLocalUniverfile(input.path, cwd),
          unitId: input.unitId,
          worktreeId: input.worktreeId,
        }),
      );
    },
  };
}
