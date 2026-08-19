import type {
  CommitChangesetMiddlewareContext,
  Middleware,
} from "@univerjs-pro/collaboration-service";
import type { CommitWorktreeChangesetMiddlewareContext } from "@univerjs-pro/collaboration-worktree-service";
import { JSON1, type JSONXActions } from "@univerjs/core";
import { type IChangeset, UniverType } from "@univerjs/protocol";
import {
  UNIVERFILE_UNIT_METADATA_KEY,
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  type UniverfileUnitMetadata,
  type UniverfileWorktreeChangeMetadata,
} from "@univer/univerfile-sqlite";

const SHEET_NAME_MUTATION_ID = "sheet.mutation.set-workbook-name";
const DOC_NAME_MUTATION_ID = "doc.mutation.rename-doc";
const SLIDE_NAME_MUTATION_ID = "slide.mutation.set-name";
const BASE_JSON1_MUTATION_ID = "base.mutation.apply-base-json1";
const BOARD_NAME_MUTATION_ID = "board.mutation.set-name";

interface NamedMutationParams {
  readonly unitId: string;
  readonly name: string;
}

interface BaseJson1MutationParams {
  readonly unitId: string;
  readonly op: JSONXActions;
}

/**
 * Reads the final root Unit name written by a transformed changeset.
 *
 * A changeset may contain several matching mutations; mutation order is authoritative, so the
 * final matching rename wins. Child names (Sheet tabs, Base tables/views, Slide/Board elements)
 * deliberately do not match this extractor.
 */
export function deriveUnitCatalogName(changeset: Readonly<IChangeset>): string | undefined {
  let name: string | undefined;
  for (const mutation of changeset.mutations) {
    const candidate = deriveMutationUnitName(changeset, mutation.id, mutation.data);
    if (candidate !== undefined) name = candidate;
  }
  return name;
}

export function createTrunkUnitNameCommitMiddleware(): Middleware<CommitChangesetMiddlewareContext> {
  return async (context, next): Promise<void> => {
    const unitName = deriveUnitCatalogName(context.changeset);
    if (unitName === undefined) {
      await next();
      return;
    }

    const previous = context.customData[UNIVERFILE_UNIT_METADATA_KEY];
    const metadata = asUnitMetadata(previous);
    context.customData[UNIVERFILE_UNIT_METADATA_KEY] = {
      ...metadata,
      unitNames: {
        ...metadata.unitNames,
        [context.changeset.unitID]: unitName,
      },
    } satisfies UniverfileUnitMetadata;

    try {
      await next();
    } finally {
      restoreCustomData(context.customData, UNIVERFILE_UNIT_METADATA_KEY, previous);
    }
  };
}

export function createWorktreeUnitNameCommitMiddleware(): Middleware<CommitWorktreeChangesetMiddlewareContext> {
  return async (context, next): Promise<void> => {
    const unitName = deriveUnitCatalogName(context.changeset);
    if (unitName === undefined) {
      await next();
      return;
    }

    const previous = context.customData[UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY];
    context.customData[UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY] = {
      ...asWorktreeChangeMetadata(previous),
      unitName,
    } satisfies UniverfileWorktreeChangeMetadata;

    try {
      await next();
    } finally {
      restoreCustomData(context.customData, UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY, previous);
    }
  };
}

function deriveMutationUnitName(
  changeset: Readonly<IChangeset>,
  mutationId: string,
  mutationData: string,
): string | undefined {
  switch (changeset.type) {
    case UniverType.UNIVER_SHEET:
      return mutationId === SHEET_NAME_MUTATION_ID
        ? readNamedMutation(mutationData, changeset.unitID)
        : undefined;
    case UniverType.UNIVER_DOC:
      return mutationId === DOC_NAME_MUTATION_ID
        ? readNamedMutation(mutationData, changeset.unitID)
        : undefined;
    case UniverType.UNIVER_SLIDE:
      return mutationId === SLIDE_NAME_MUTATION_ID
        ? readNamedMutation(mutationData, changeset.unitID)
        : undefined;
    case UniverType.UNIVER_BASE:
      return mutationId === BASE_JSON1_MUTATION_ID
        ? readBaseNameMutation(mutationData, changeset.unitID)
        : undefined;
    case UniverType.UNIVER_BOARD:
      return mutationId === BOARD_NAME_MUTATION_ID
        ? readNamedMutation(mutationData, changeset.unitID)
        : undefined;
    default:
      return undefined;
  }
}

function readNamedMutation(data: string, unitID: string): string | undefined {
  const params = parseObject(data) as Partial<NamedMutationParams> | undefined;
  return params?.unitId === unitID && typeof params.name === "string" ? params.name : undefined;
}

function readBaseNameMutation(data: string, unitID: string): string | undefined {
  const params = parseObject(data) as Partial<BaseJson1MutationParams> | undefined;
  if (params?.unitId !== unitID || !Array.isArray(params.op)) return undefined;

  try {
    const cursor = JSON1.type.readCursor(params.op);
    for (const key of cursor) {
      if (key !== "name") continue;
      const component = cursor.getComponent();
      if (
        component !== null &&
        Object.prototype.hasOwnProperty.call(component, "i") &&
        typeof component.i === "string"
      ) {
        return component.i;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function asUnitMetadata(value: unknown): UniverfileUnitMetadata {
  return typeof value === "object" && value !== null ? (value as UniverfileUnitMetadata) : {};
}

function asWorktreeChangeMetadata(value: unknown): UniverfileWorktreeChangeMetadata {
  return typeof value === "object" && value !== null
    ? (value as UniverfileWorktreeChangeMetadata)
    : {};
}

function restoreCustomData(
  customData: Record<string, unknown>,
  key: string,
  previous: unknown,
): void {
  if (previous === undefined) {
    delete customData[key];
  } else {
    customData[key] = previous;
  }
}
