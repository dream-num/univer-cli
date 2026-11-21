import { ExchangeFormat, type ExportOptions } from "@univerjs-pro/exchange-node";
import { UniverInstanceType } from "@univerjs/core";
import type { CollabService } from "../collab-service.js";

export interface OfficeExportScope {
  readonly collab: CollabService;
  readonly unitId: string;
  readonly worktreeId?: string;
}

// Match the Exchange Service's placeholder for URL images without fetching remote content.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export function withOfficeExportFiles(
  options: ExportOptions,
  scope: OfficeExportScope,
): ExportOptions {
  if (
    options.type === UniverInstanceType.UNIVER_BASE ||
    (options.type === UniverInstanceType.UNIVER_SHEET && options.format !== ExchangeFormat.XLSX)
  ) {
    return options;
  }

  return {
    ...options,
    files: {
      async load(ref) {
        if (ref.sourceType === "URL") return { bytes: TRANSPARENT_PNG };
        if (
          ref.unitId !== scope.unitId ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(ref.source)
        ) {
          throw new Error("Office export requires an embedded file belonging to this Unit.");
        }
        const asset = scope.collab.openAsset(ref.source, scope.worktreeId);
        if (!asset || asset.record.unitId !== scope.unitId) {
          throw new Error("The embedded Office file was not found.");
        }
        return { bytes: asset.bytes };
      },
    },
  };
}
