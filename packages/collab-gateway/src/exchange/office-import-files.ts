import { randomUUID } from "node:crypto";
import { MAX_UNIVERFILE_ASSET_BYTES, type UniverfileInitialAsset } from "@univer/univerfile-sqlite";
import type {
  IImportFilesOptions,
  IImportedFile,
  IImportFileResult,
} from "@univerjs-pro/exchange-node";
import { newUnitId } from "../univer/unit-types.js";

/** Exchange rewrites the references. The Unit's creation transaction persists the staged bytes. */
export class OfficeImportFiles implements IImportFilesOptions {
  public readonly unitId = newUnitId();
  public readonly assets: UniverfileInitialAsset[] = [];

  public async store(file: IImportedFile): Promise<IImportFileResult> {
    // The asset store has a per-file limit. Larger inputs can still round-trip inline.
    if (file.size > MAX_UNIVERFILE_ASSET_BYTES) return { mode: "inline" };
    const assetId = randomUUID();
    this.assets.push({
      assetId,
      originalFilename: file.name,
      mediaType: file.mimeType || "application/octet-stream",
      bytes: file.bytes,
    });
    return { mode: "reference", source: assetId };
  }
}
