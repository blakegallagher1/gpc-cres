export const DEFAULT_OBSERVABILITY_SEARCH_ADDRESS = "2774 HIGHLAND RD";

export const PROSPECT_MONITOR_POLYGON = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-91.2405, 30.5001],
      [-91.2405, 30.3734],
      [-91.0701, 30.3734],
      [-91.0701, 30.5001],
      [-91.2405, 30.5001],
    ],
  ],
};

/**
 * Resolves the address used for address-based production monitor probes.
 */
export function resolveMonitorSearchAddress(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.OBS_SEARCH_ADDRESS ??
    env.MAP_SMOKE_SEARCH_ADDRESS ??
    DEFAULT_OBSERVABILITY_SEARCH_ADDRESS
  );
}

/**
 * Builds the canonical `/api/map/prospect` health probe payload.
 */
export function buildProspectMonitorPayload() {
  return {
    polygon: PROSPECT_MONITOR_POLYGON,
  };
}
