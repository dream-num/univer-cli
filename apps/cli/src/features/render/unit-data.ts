import type { CollabService } from "@univer/collab-gateway";

const EXTERNAL_REFERENCE_RESOURCE = "UNIVER_EXTERNAL_REFERENCE_PLUGIN";
const EMBED_RESOURCE = "UNIVER_EMBED_RESOURCE_PLUGIN";

interface ImageReference {
  readonly declaredMediaType?: string;
  readonly source: string;
  readonly sourceKey: string;
  readonly typeKey: string;
}

/** Resolve formula Source Units recorded by Univer's external-reference resource. */
export function externalReferenceUnitIds(unitData: Record<string, unknown>): readonly string[] {
  const ids = new Set<string>();
  for (const resource of findResources(unitData, EXTERNAL_REFERENCE_RESOURCE)) {
    const decoded = parseResourceData(resource, EXTERNAL_REFERENCE_RESOURCE);
    const references = decoded["references"];
    if (!isRecord(references)) {
      throw codedError(
        "SCREENSHOT_REFERENCE_RESOURCE_INVALID",
        `${EXTERNAL_REFERENCE_RESOURCE} references must be an object`,
      );
    }
    for (const reference of Object.values(references)) {
      if (!isRecord(reference) || !nonEmptyString(reference["sourceUnitId"])) {
        throw codedError(
          "SCREENSHOT_REFERENCE_RESOURCE_INVALID",
          `${EXTERNAL_REFERENCE_RESOURCE} sourceUnitId is missing`,
        );
      }
      ids.add(reference["sourceUnitId"]);
    }
  }
  return [...ids].sort();
}

/** Resolve active child Units recorded by Univer's embed resource. */
export function embeddedUnitIds(unitData: Record<string, unknown>): readonly string[] {
  const ids = new Set<string>();
  for (const resource of findResources(unitData, EMBED_RESOURCE)) {
    const decoded = parseResourceData(resource, EMBED_RESOURCE);
    const embeds = decoded["embeds"];
    if (!isRecord(embeds)) {
      throw codedError(
        "SCREENSHOT_EMBED_RESOURCE_INVALID",
        `${EMBED_RESOURCE} embeds must be an object`,
      );
    }
    for (const descriptor of Object.values(embeds)) {
      if (!isRecord(descriptor)) {
        throw codedError(
          "SCREENSHOT_EMBED_RESOURCE_INVALID",
          `${EMBED_RESOURCE} descriptor must be an object`,
        );
      }
      if (descriptor["lifecycle"] === "soft-deleted") continue;
      const source = isRecord(descriptor["source"]) ? descriptor["source"] : undefined;
      const ref = source?.["ref"];
      const unitRef = isRecord(ref) && isRecord(ref["unit"]) ? ref["unit"] : undefined;
      const fromString = typeof ref === "string" ? unitSelectorFromResourceRef(ref) : undefined;
      const unitId = nonEmptyString(descriptor["childUnitId"])
        ? descriptor["childUnitId"]
        : nonEmptyString(unitRef?.["selector"])
          ? unitRef["selector"]
          : fromString;
      if (unitId === undefined) {
        throw codedError(
          "SCREENSHOT_EMBED_RESOURCE_INVALID",
          `${EMBED_RESOURCE} active child Unit ID is missing`,
        );
      }
      ids.add(unitId);
    }
  }
  return [...ids].sort();
}

/** Replace local UUID image references with render-only data URIs without mutating persisted data. */
export function resolveLocalImageAssetsForRender(input: {
  readonly collab: CollabService;
  readonly unitData: Record<string, unknown>;
  readonly worktreeId?: string;
}): Record<string, unknown> {
  const assetIds = new Set<string>();
  visitImageReferences(input.unitData, (reference) => {
    if (
      reference.typeKey === "sourceType" &&
      reference.declaredMediaType !== undefined &&
      normalizeImageMediaType(reference.declaredMediaType) === undefined
    ) {
      return;
    }
    assetIds.add(reference.source);
  });
  if (assetIds.size === 0) return input.unitData;

  const replacements = new Map<string, string>();
  for (const assetId of assetIds) {
    const opened = input.collab.openAsset(assetId, input.worktreeId);
    if (opened === null) continue;
    const mediaType = normalizeImageMediaType(opened.record.mediaType);
    if (
      mediaType === undefined ||
      opened.bytes.byteLength === 0 ||
      opened.record.byteSize !== opened.bytes.byteLength
    ) {
      continue;
    }
    replacements.set(
      assetId,
      `data:${mediaType};base64,${Buffer.from(opened.bytes).toString("base64")}`,
    );
  }
  return rewriteValue(input.unitData, replacements) as Record<string, unknown>;
}

function findResources(
  unitData: Record<string, unknown>,
  name: string,
): readonly Record<string, unknown>[] {
  const resources = unitData["resources"];
  if (!Array.isArray(resources)) return [];
  return resources.filter(
    (resource): resource is Record<string, unknown> =>
      isRecord(resource) && resource["name"] === name,
  );
}

function parseResourceData(
  resource: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  if (typeof resource["data"] !== "string") {
    throw codedError("SCREENSHOT_RESOURCE_INVALID", `${name} data must be a JSON string`);
  }
  try {
    const decoded = JSON.parse(resource["data"]) as unknown;
    if (!isRecord(decoded)) throw new Error("not an object");
    return decoded;
  } catch {
    throw codedError("SCREENSHOT_RESOURCE_INVALID", `${name} data is not valid JSON`);
  }
}

function unitSelectorFromResourceRef(ref: string): string | undefined {
  const match = /(?:^|[#&])unit=([^&]+)/u.exec(ref);
  if (match?.[1] === undefined) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw codedError(
      "SCREENSHOT_EMBED_RESOURCE_INVALID",
      `${EMBED_RESOURCE} resource ref has invalid percent encoding`,
    );
  }
}

function visitImageReferences(value: unknown, visit: (reference: ImageReference) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitImageReferences(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  for (const reference of imageFieldPairs(value)) visit(reference);
  visitSerializedResources(value["resources"], visit);
  for (const [key, child] of Object.entries(value)) {
    if (key !== "resources") visitImageReferences(child, visit);
  }
}

function visitSerializedResources(
  value: unknown,
  visit: (reference: ImageReference) => void,
): void {
  if (!Array.isArray(value)) return;
  for (const resource of value) {
    visitImageReferences(resource, visit);
    if (!isRecord(resource) || typeof resource["data"] !== "string") continue;
    try {
      visitImageReferences(JSON.parse(resource["data"]) as unknown, visit);
    } catch {
      // Unrelated invalid resources remain untouched; their owning capability validates them.
    }
  }
}

function rewriteValue(value: unknown, replacements: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteValue(item, replacements));
  if (!isRecord(value)) return value;

  const rewritten: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    rewritten[key] =
      key === "resources"
        ? rewriteSerializedResources(child, replacements)
        : rewriteValue(child, replacements);
  }
  for (const reference of imageFieldPairs(value)) {
    const replacement = replacements.get(reference.source);
    if (replacement !== undefined) {
      rewritten[reference.sourceKey] = replacement;
      rewritten[reference.typeKey] = "BASE64";
    }
  }
  return rewritten;
}

function rewriteSerializedResources(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (!Array.isArray(value)) return rewriteValue(value, replacements);
  return value.map((resource) => {
    const rewritten = rewriteValue(resource, replacements);
    if (!isRecord(resource) || !isRecord(rewritten) || typeof resource["data"] !== "string") {
      return rewritten;
    }
    try {
      const decoded = JSON.parse(resource["data"]) as unknown;
      const rewrittenData = rewriteValue(decoded, replacements);
      return JSON.stringify(decoded) === JSON.stringify(rewrittenData)
        ? rewritten
        : { ...rewritten, data: JSON.stringify(rewrittenData) };
    } catch {
      return rewritten;
    }
  });
}

function imageFieldPairs(record: Readonly<Record<string, unknown>>): readonly ImageReference[] {
  const pairs: ImageReference[] = [];
  addImageFieldPair(pairs, record, "source", "imageSourceType");
  addImageFieldPair(pairs, record, "fillImageSource", "fillImageSourceType");
  addImageFieldPair(pairs, record, "source", "sourceType");
  return pairs;
}

function addImageFieldPair(
  pairs: ImageReference[],
  record: Readonly<Record<string, unknown>>,
  sourceKey: string,
  typeKey: string,
): void {
  const source = record[sourceKey];
  if (record[typeKey] !== "UUID" || typeof source !== "string" || source.length === 0) return;
  const declaredMediaType = record["mimeType"];
  pairs.push({
    ...(typeof declaredMediaType === "string" ? { declaredMediaType } : {}),
    source,
    sourceKey,
    typeKey,
  });
}

function normalizeImageMediaType(value: string): string | undefined {
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType !== undefined && /^image\/[a-z0-9][a-z0-9.+-]*$/u.test(mediaType)
    ? mediaType
    : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
