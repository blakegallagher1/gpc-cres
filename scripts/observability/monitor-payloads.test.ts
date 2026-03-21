import { describe, expect, it } from "vitest";
import {
  buildProspectMonitorPayload,
  DEFAULT_OBSERVABILITY_SEARCH_ADDRESS,
  PROSPECT_MONITOR_POLYGON,
  resolveMonitorSearchAddress,
} from "./monitor-payloads.js";

describe("monitor payload helpers", () => {
  it("prefers OBS_SEARCH_ADDRESS over legacy aliases", () => {
    expect(
      resolveMonitorSearchAddress({
        OBS_SEARCH_ADDRESS: "2774 HIGHLAND RD",
        MAP_SMOKE_SEARCH_ADDRESS: "4416 HEATH DR",
      }),
    ).toBe("2774 HIGHLAND RD");
  });

  it("falls back to the canonical default address", () => {
    expect(resolveMonitorSearchAddress({})).toBe(
      DEFAULT_OBSERVABILITY_SEARCH_ADDRESS,
    );
  });

  it("keeps the prospect monitor payload polygon-only", () => {
    expect(buildProspectMonitorPayload()).toEqual({
      polygon: PROSPECT_MONITOR_POLYGON,
    });
  });
});
