import {
  IAuthzIoService,
  IPermissionService,
  LocaleType,
  Univer,
  UniverInstanceType,
  type IWorkbookData
} from "@univerjs/core";
import {
  ObjectScope,
  UnitAction,
  UnitObject,
  UnitRole,
  type IAllowedRequest,
  type ICreateCollaboratorRequest,
  type ICreateRequest,
  type IDeleteCollaboratorRequest,
  type IPutCollaboratorsRequest,
  type IUpdateCollaboratorRequest,
  type IUpdatePermPointRequest
} from "@univerjs/protocol";
import {
  UniverSheetsPlugin,
  SheetPermissionInitController,
  WorkbookCreateProtectPermission,
  WorkbookEditablePermission,
  WorkbookPrintPermission,
  WorkbookViewPermission
} from "@univerjs/sheets";
import { describe, expect, it } from "vitest";
import {
  isLocalReadOnlyActionAllowed,
  LocalReadOnlyAuthzIoService
} from "../src/core/local-read-only-authz-io.service";

const ROOT_OBJECT_TYPES = [
  UnitObject.Workbook,
  UnitObject.Document,
  UnitObject.Slide,
  UnitObject.Base,
  UnitObject.Board
] as const;

describe("LocalReadOnlyAuthzIoService", () => {
  it("denies unit editing for every supported product while preserving inspection", async () => {
    const service = new LocalReadOnlyAuthzIoService();

    for (const objectType of ROOT_OBJECT_TYPES) {
      await expect(
        service.allowed(request(objectType, [UnitAction.View, UnitAction.Edit, UnitAction.Copy]))
      ).resolves.toEqual([
        { action: UnitAction.View, allowed: true },
        { action: UnitAction.Edit, allowed: false },
        { action: UnitAction.Copy, allowed: true }
      ]);
    }
  });

  it("also denies Sheet printing and protection creation", async () => {
    await expect(
      new LocalReadOnlyAuthzIoService().allowed(
        request(UnitObject.Workbook, [
          UnitAction.Print,
          UnitAction.CreatePermissionObject,
          UnitAction.Comment
        ])
      )
    ).resolves.toEqual([
      { action: UnitAction.Print, allowed: false },
      { action: UnitAction.CreatePermissionObject, allowed: false },
      { action: UnitAction.Comment, allowed: true }
    ]);
  });

  it("denies nested object editing without blocking non-mutating actions", () => {
    for (const objectType of [
      UnitObject.Worksheet,
      UnitObject.SelectRange,
      UnitObject.DocumentSection,
      UnitObject.SlidePage,
      UnitObject.BaseTable,
      UnitObject.BoardElement
    ]) {
      expect(isLocalReadOnlyActionAllowed(objectType, UnitAction.Edit)).toBe(false);
      expect(isLocalReadOnlyActionAllowed(objectType, UnitAction.View)).toBe(true);
    }
  });

  it("returns one complete result per batch request", async () => {
    const service = new LocalReadOnlyAuthzIoService();
    await expect(
      service.batchAllowed([
        request(UnitObject.Document, [UnitAction.Edit]),
        request(UnitObject.Workbook, [UnitAction.View, UnitAction.Print], "sheet-1")
      ])
    ).resolves.toEqual([
      {
        unitID: "unit-1",
        objectID: "unit-1",
        actions: [{ action: UnitAction.Edit, allowed: false }]
      },
      {
        unitID: "sheet-1",
        objectID: "sheet-1",
        actions: [
          { action: UnitAction.View, allowed: true },
          { action: UnitAction.Print, allowed: false }
        ]
      }
    ]);
  });

  it("describes requested local objects without persisting permission state", async () => {
    const service = new LocalReadOnlyAuthzIoService();
    await expect(
      service.list({
        unitID: "sheet-1",
        objectIDs: ["range-1"],
        actions: [UnitAction.View, UnitAction.Edit]
      })
    ).resolves.toEqual([
      {
        objectID: "range-1",
        unitID: "sheet-1",
        objectType: UnitObject.SelectRange,
        name: "",
        shareOn: false,
        shareRole: UnitRole.Reader,
        creator: undefined,
        strategies: [
          { action: UnitAction.View, role: UnitRole.Editor },
          { action: UnitAction.Edit, role: UnitRole.Owner }
        ],
        actions: [
          { action: UnitAction.View, allowed: true },
          { action: UnitAction.Edit, allowed: false }
        ],
        shareScope: -1,
        scope: {
          read: ObjectScope.AllCollaborator,
          edit: ObjectScope.AllCollaborator
        }
      }
    ]);
  });

  it("keeps object inheritance configuration local", () => {
    const service = new LocalReadOnlyAuthzIoService();
    expect(service.getCfgEnableObjInherit()).toBe(false);
    service.setCfgEnableObjInherit(true);
    expect(service.getCfgEnableObjInherit()).toBe(true);
  });

  it("rejects every authorization mutation instead of reporting false success", async () => {
    const service = new LocalReadOnlyAuthzIoService();
    const writes: Array<Promise<unknown>> = [
      service.create({} as ICreateRequest),
      service.update({} as IUpdatePermPointRequest),
      service.updateCollaborator({} as IUpdateCollaboratorRequest),
      service.deleteCollaborator({} as IDeleteCollaboratorRequest),
      service.createCollaborator({} as ICreateCollaboratorRequest),
      service.putCollaborators({} as IPutCollaboratorsRequest)
    ];

    for (const write of writes) {
      await expect(write).rejects.toThrow("Local read-only authorization does not allow");
    }
    await expect(service.listCollaborators({ objectID: "unit-1", unitID: "unit-1" })).resolves
      .toEqual([]);
    await expect(service.listRoles()).resolves.toEqual({ roles: [], actions: [] });
  });

  it("is materialized by the real Sheet permission controller", async () => {
    const univer = new Univer({
      override: [[IAuthzIoService, { useClass: LocalReadOnlyAuthzIoService }]]
    });
    try {
      univer.registerPlugin(UniverSheetsPlugin);
      univer.createUnit<IWorkbookData>(UniverInstanceType.UNIVER_SHEET, {
        id: "sheet-1",
        name: "Sheet",
        appVersion: "1",
        locale: LocaleType.EN_US,
        styles: {},
        sheetOrder: ["tab-1"],
        sheets: {
          "tab-1": {
            id: "tab-1",
            name: "Sheet1",
            rowCount: 10,
            columnCount: 10
          }
        }
      });
      await univer
        .__getInjector()
        .get(SheetPermissionInitController)
        .initWorkbookPermissionChange("sheet-1");

      const permissionService = univer.__getInjector().get(IPermissionService);
      expect(
        permissionService.getPermissionPoint(new WorkbookEditablePermission("sheet-1").id)?.value
      ).toBe(false);
      expect(
        permissionService.getPermissionPoint(new WorkbookPrintPermission("sheet-1").id)?.value
      ).toBe(false);
      expect(
        permissionService.getPermissionPoint(
          new WorkbookCreateProtectPermission("sheet-1").id
        )?.value
      ).toBe(false);
      expect(
        permissionService.getPermissionPoint(new WorkbookViewPermission("sheet-1").id)?.value
      ).toBe(true);
    } finally {
      univer.dispose();
    }
  });
});

function request(
  objectType: UnitObject,
  actions: UnitAction[],
  unitID = "unit-1"
): IAllowedRequest {
  return { objectID: unitID, objectType, unitID, actions };
}
