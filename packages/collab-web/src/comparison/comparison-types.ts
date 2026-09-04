import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitComparisonContext,
  type UnitType,
} from "@univer/collab-gateway-contract";
import type {
  IBaseSnapshot,
  IDocumentData,
  IWorkbookData,
  LocaleType,
  Univer,
} from "@univerjs/core";
import type { IBoardData } from "@univerjs-pro/boards";
import type { ISlideData } from "@univerjs-pro/slides";
import type { ReactNode } from "react";

export interface IUnitComparisonViewerProps {
  readonly comparison: UnitComparisonViewerValue;
  readonly createUniver: UnitComparisonUniverFactory;
  readonly leftHeaderControl?: ReactNode;
  readonly locale: LocaleType;
  readonly darkMode: boolean;
}

export type UnitComparisonUniverFactory = (
  options: IUnitComparisonUniverFactoryOptions,
) => Promise<IUnitComparisonUniverInstance>;

export interface IUnitComparisonUniverFactoryOptions {
  readonly container: HTMLElement;
  readonly unitType: UnitType;
  readonly locale: LocaleType;
  readonly darkMode: boolean;
}

export interface IUnitComparisonUniverInstance {
  readonly univer: Univer;
  dispose(): void;
}

interface IUnitComparisonViewerValue<TType extends UnitType, TData> {
  readonly result: Omit<UnitComparisonContext, "unit"> & {
    readonly unit: UnitComparisonContext["unit"] & { readonly type: TType };
  };
  readonly left: IUnitComparisonViewerSide<TData>;
  readonly right: IUnitComparisonViewerSide<TData>;
}

export interface IUnitComparisonViewerSide<TData> {
  readonly label: string;
  readonly revision?: number;
  readonly unitData: TData | null;
}

export type UnitComparisonViewerValue =
  | SheetComparisonViewerValue
  | NativeComparisonViewerValue
  | BaseComparisonViewerValue;

export type SheetComparisonViewerValue = IUnitComparisonViewerValue<
  typeof UNIT_TYPE_SHEET,
  IWorkbookData
>;

export type BaseComparisonViewerValue = IUnitComparisonViewerValue<
  typeof UNIT_TYPE_BASE,
  IBaseSnapshot
>;

export type NativeComparisonViewerValue =
  | IUnitComparisonViewerValue<typeof UNIT_TYPE_DOC, IDocumentData>
  | IUnitComparisonViewerValue<typeof UNIT_TYPE_SLIDE, ISlideData>
  | IUnitComparisonViewerValue<typeof UNIT_TYPE_BOARD, IBoardData>;
