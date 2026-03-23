/**
 * Planning module — Core query planning and execution infrastructure
 *
 * Exports:
 * - ParcelQueryPlanner: Decomposes user messages + map context into execution plans
 * - ParcelQueryExecutor: Materializes parcel sets by executing resolution strategies
 * - ParcelSetRegistry: In-memory registry for parcel set definitions and materializations
 */

export { ParcelQueryPlanner, type PlannerInput } from "./planner.js";
export {
  ParcelQueryExecutor,
  type GatewayAdapter,
  type ExecutionResult,
  type MaterializedSet,
} from "./executor.js";
export { ParcelSetRegistry } from "./registry.js";
