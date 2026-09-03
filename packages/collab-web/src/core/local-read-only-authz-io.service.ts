import type { IAuthzIoService } from "@univerjs/core";
import {
  ObjectScope,
  UnitAction,
  UnitObject,
  UnitRole,
  type IActionInfo,
  type IAllowedRequest,
  type IBatchAllowedResponse,
  type ICollaborator,
  type ICreateCollaboratorRequest,
  type ICreateRequest,
  type IDeleteCollaboratorRequest,
  type IListCollaboratorRequest,
  type IListPermPointRequest,
  type IPermissionPoint,
  type IPutCollaboratorsRequest,
  type IUnitRoleKV,
  type IUpdateCollaboratorRequest,
  type IUpdatePermPointRequest
} from "@univerjs/protocol";

/**
 * Instance-local, immutable authorization for inspection surfaces.
 *
 * Univer product plugins own permission-point registration and cache updates. This service is the
 * application policy source they query: it never persists authz state and never writes a server.
 */
export class LocalReadOnlyAuthzIoService implements IAuthzIoService {
  private cfgEnableObjInherit = false;

  public async create(_config: ICreateRequest): Promise<string> {
    throw readOnlyMutationError("create");
  }

  public async allowed(config: IAllowedRequest): Promise<IActionInfo[]> {
    return resolveActions(config.objectType, config.actions);
  }

  public async batchAllowed(
    configs: IAllowedRequest[]
  ): Promise<IBatchAllowedResponse["objectActions"]> {
    return Promise.all(
      configs.map(async (config) => ({
        unitID: config.unitID,
        objectID: config.objectID,
        actions: await this.allowed(config)
      }))
    );
  }

  public async list(config: IListPermPointRequest): Promise<IPermissionPoint[]> {
    return config.objectIDs.map((objectID) => ({
      objectID,
      unitID: config.unitID,
      objectType: UnitObject.SelectRange,
      name: "",
      shareOn: false,
      shareRole: UnitRole.Reader,
      creator: undefined,
      strategies: config.actions.map((action) => ({
        action,
        role: isLocalReadOnlyActionAllowed(UnitObject.SelectRange, action)
          ? UnitRole.Editor
          : UnitRole.Owner
      })),
      actions: resolveActions(UnitObject.SelectRange, config.actions),
      shareScope: -1,
      scope: {
        read: ObjectScope.AllCollaborator,
        edit: ObjectScope.AllCollaborator
      }
    }));
  }

  public async listRoles(): Promise<{ roles: IUnitRoleKV[]; actions: UnitAction[] }> {
    return { roles: [], actions: [] };
  }

  public async update(_config: IUpdatePermPointRequest): Promise<void> {
    throw readOnlyMutationError("update");
  }

  public async listCollaborators(
    _config: IListCollaboratorRequest
  ): Promise<ICollaborator[]> {
    return [];
  }

  public async updateCollaborator(_config: IUpdateCollaboratorRequest): Promise<void> {
    throw readOnlyMutationError("updateCollaborator");
  }

  public async deleteCollaborator(_config: IDeleteCollaboratorRequest): Promise<void> {
    throw readOnlyMutationError("deleteCollaborator");
  }

  public async createCollaborator(_config: ICreateCollaboratorRequest): Promise<void> {
    throw readOnlyMutationError("createCollaborator");
  }

  public async putCollaborators(_config: IPutCollaboratorsRequest): Promise<void> {
    throw readOnlyMutationError("putCollaborators");
  }

  public setCfgEnableObjInherit(enabled: boolean): void {
    this.cfgEnableObjInherit = enabled;
  }

  public getCfgEnableObjInherit(): boolean {
    return this.cfgEnableObjInherit;
  }
}

/** Return the immutable policy that Univer permission controllers materialize in their cache. */
export function isLocalReadOnlyActionAllowed(
  objectType: UnitObject,
  action: UnitAction
): boolean {
  if (action === UnitAction.Edit) return false;
  if (objectType !== UnitObject.Workbook) return true;
  return action !== UnitAction.Print && action !== UnitAction.CreatePermissionObject;
}

function resolveActions(objectType: UnitObject, actions: UnitAction[]): IActionInfo[] {
  return actions.map((action) => ({
    action,
    allowed: isLocalReadOnlyActionAllowed(objectType, action)
  }));
}

function readOnlyMutationError(operation: string): Error {
  return new Error(`Local read-only authorization does not allow ${operation}`);
}
