import type { UnitComparisonContext, UnitComparisonContextQuery, UnitType } from "@univer/collab-gateway-contract";
import { prepareGatewayUnitComparison, queryGatewayUnitComparison } from "../../src/comparison/unit-comparison-runtime.js";

/** Exercise the same SDK-backed preparation and wire projection used by HTTP consumers. */
export function compareContext(
  input: Parameters<typeof prepareGatewayUnitComparison>[0] & { readonly query?: UnitComparisonContextQuery },
): UnitComparisonContext {
  return queryGatewayUnitComparison(prepareGatewayUnitComparison(input), input.query ?? {});
}

export function compareSnapshots(input: {
  readonly type: UnitType;
  readonly left: unknown;
  readonly right: unknown;
}): UnitComparisonContext {
  return compareContext({
    comparisonId: "contract-test",
    unit: { unitId: "test-unit", type: input.type, name: "Test", presence: "paired" },
    fidelity: "snapshot",
    stale: false,
    leftData: input.left,
    rightData: input.right,
    leftChangesets: [],
    rightChangesets: [],
  });
}
