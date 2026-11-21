import { createHash } from "node:crypto";
import { MAX_UNIVERFILE_ASSET_BYTES } from "@univer/univerfile-sqlite";

type SupportedImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

const IMAGE_FIELDS = [
  ["source", "imageSourceType"],
  ["fillImageSource", "fillImageSourceType"],
  ["source", "sourceType"],
] as const;

interface EmbeddedImage {
  readonly bytes: Buffer;
  readonly filename: string;
  readonly mediaType: SupportedImageMediaType;
}

/** Store inline raster images in non-Office snapshots and mutation payloads. */
export function externalizeEmbeddedImages(
  value: unknown,
  store: (image: EmbeddedImage) => string,
): unknown {
  const assetIds = new Map<string, string | undefined>();

  function resolve(source: string): string | undefined {
    if (assetIds.has(source)) return assetIds.get(source);
    const image = parseImage(source);
    let id: string | undefined;
    if (image) {
      try {
        id = store(image);
      } catch {
        // A failed asset write leaves this image inline.
      }
    }
    assetIds.set(source, id);
    return id;
  }

  function rewrite(node: unknown): unknown {
    if (Array.isArray(node)) {
      const items: unknown[] = node;
      let copy: unknown[] | undefined;
      items.forEach((child, index) => {
        const next = rewrite(child);
        if (next !== child) {
          copy ??= items.slice();
          copy[index] = next;
        }
      });
      return copy ?? node;
    }
    if (!isPlainRecord(node)) return node;
    let copy: Record<string, unknown> | undefined;
    for (const [sourceKey, typeKey] of IMAGE_FIELDS) {
      const source = node[sourceKey];
      if (node[typeKey] !== "BASE64" || typeof source !== "string") continue;
      const id = resolve(source);
      if (id !== undefined) {
        copy ??= { ...node };
        copy[sourceKey] = id;
        copy[typeKey] = "UUID";
      }
    }
    for (const [key, child] of Object.entries(node)) {
      const next = rewrite(child);
      if (next !== child) {
        copy ??= { ...node };
        copy[key] = next;
      }
    }
    return copy ?? node;
  }

  return rewrite(value);
}

function parseImage(source: string): EmbeddedImage | undefined {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(source);
  if (!match) return undefined;
  const mediaType = match[1] as SupportedImageMediaType;
  const encoded = match[2]!;
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.byteLength > MAX_UNIVERFILE_ASSET_BYTES ||
    bytes.toString("base64") !== encoded ||
    !matchesImageSignature(mediaType, bytes)
  )
    return undefined;
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length);
  const digest = createHash("sha256").update(bytes).digest("hex");
  return { bytes, filename: `${digest}.${extension}`, mediaType };
}

function matchesImageSignature(mediaType: SupportedImageMediaType, bytes: Uint8Array): boolean {
  if (mediaType === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  }
  if (mediaType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/webp") {
    return (
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
    );
  }
  const header = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
  return header === "GIF87a" || header === "GIF89a";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
