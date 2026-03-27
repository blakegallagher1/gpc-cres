/**
 * Compaction mode auto-selection (P3 Pattern 20).
 * Chooses cheapest compaction strategy based on available state.
 */
export type CompactionMode = "previous_response_id" | "input";

export function selectCompactionMode(options: {
  previousResponseId?: string | null;
  responseWasStored?: boolean;
  forceInputMode?: boolean;
}): CompactionMode {
  if (options.forceInputMode) return "input";
  if (!options.previousResponseId) return "input";
  if (options.responseWasStored === false) return "input";
  return "previous_response_id";
}
