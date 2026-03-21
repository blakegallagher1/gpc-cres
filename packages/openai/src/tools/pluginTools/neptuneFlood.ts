import { tool } from "@openai/agents";
import { z } from "zod";
import {
  buildErrorResponse,
  buildMissingEnvResponse,
  buildNeptuneBaseUrlError,
  buildSuccessResponse,
  getRequiredEnv,
  neptuneRequest,
  toRecord,
  type JsonRecord,
} from "./shared.js";

const neptuneAddressSchema = {
  address_line_1: z.string().describe("Primary street address."),
  address_line_2: z.string().nullable().describe("Secondary address line. Pass null to omit."),
  city: z.string().describe("Property city."),
  state: z.string().describe("Property state abbreviation."),
  postal_code: z.string().describe("Property postal code."),
};

function buildNeptuneAddressPayload(input: {
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
}): JsonRecord {
  return {
    addressLine1: input.address_line_1,
    ...(input.address_line_2 ? { addressLine2: input.address_line_2 } : {}),
    city: input.city,
    state: input.state,
    postalCode: input.postal_code,
  };
}

function buildNeptuneError(
  result: {
    error: string;
    status: number | null;
    details: JsonRecord | null;
  },
): string {
  return result.error === "NEPTUNE_FLOOD_BASE_URL is not set"
    ? buildNeptuneBaseUrlError()
    : buildErrorResponse("neptune-flood", result.error, {
      httpStatus: result.status,
      details: result.details,
    });
}

export const lookup_flood_risk = tool({
  name: "lookup_flood_risk",
  description:
    "Look up flood risk details from Neptune Flood for a specific property address.",
  parameters: z.object(neptuneAddressSchema),
  execute: async (input) => {
    const apiKey = getRequiredEnv("NEPTUNE_FLOOD_API_KEY");
    if (!apiKey) {
      return buildMissingEnvResponse("neptune-flood", "NEPTUNE_FLOOD_API_KEY");
    }

    const result = await neptuneRequest(
      apiKey,
      "lookup_flood_risk",
      buildNeptuneAddressPayload(input),
    );
    if (!result.ok) {
      return buildNeptuneError(result);
    }

    return buildSuccessResponse("neptune-flood", {
      risk: toRecord(result.body) ?? {},
    });
  },
});

export const get_flood_zone = tool({
  name: "get_flood_zone",
  description:
    "Get Neptune Flood flood-zone details for a specific property address.",
  parameters: z.object(neptuneAddressSchema),
  execute: async (input) => {
    const apiKey = getRequiredEnv("NEPTUNE_FLOOD_API_KEY");
    if (!apiKey) {
      return buildMissingEnvResponse("neptune-flood", "NEPTUNE_FLOOD_API_KEY");
    }

    const result = await neptuneRequest(
      apiKey,
      "get_flood_zone",
      buildNeptuneAddressPayload(input),
    );
    if (!result.ok) {
      return buildNeptuneError(result);
    }

    return buildSuccessResponse("neptune-flood", {
      floodZone: toRecord(result.body) ?? {},
    });
  },
});

export const get_flood_insurance_quote = tool({
  name: "get_flood_insurance_quote",
  description:
    "Request a Neptune Flood insurance quote for a property address and coverage profile.",
  parameters: z.object({
    ...neptuneAddressSchema,
    year_built: z.number().nullable().describe("Property construction year. Pass null if unknown."),
    building_coverage: z.number().nullable().describe("Requested building coverage amount. Pass null if not applicable."),
    contents_coverage: z.number().nullable().describe("Requested contents coverage amount. Pass null if not applicable."),
    deductible: z.number().nullable().describe("Requested deductible. Pass null to use the provider default."),
    occupancy_type: z.string().nullable().describe("Occupancy type, for example primary, tenant, seasonal, or commercial."),
    construction_type: z.string().nullable().describe("Construction type, for example frame, masonry, or steel."),
  }),
  execute: async ({
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    year_built,
    building_coverage,
    contents_coverage,
    deductible,
    occupancy_type,
    construction_type,
  }) => {
    const apiKey = getRequiredEnv("NEPTUNE_FLOOD_API_KEY");
    if (!apiKey) {
      return buildMissingEnvResponse("neptune-flood", "NEPTUNE_FLOOD_API_KEY");
    }

    const result = await neptuneRequest(apiKey, "get_flood_insurance_quote", {
      ...buildNeptuneAddressPayload({
        address_line_1,
        address_line_2,
        city,
        state,
        postal_code,
      }),
      ...(year_built !== null ? { yearBuilt: year_built } : {}),
      ...(building_coverage !== null ? { buildingCoverage: building_coverage } : {}),
      ...(contents_coverage !== null ? { contentsCoverage: contents_coverage } : {}),
      ...(deductible !== null ? { deductible } : {}),
      ...(occupancy_type ? { occupancyType: occupancy_type } : {}),
      ...(construction_type ? { constructionType: construction_type } : {}),
    });
    if (!result.ok) {
      return buildNeptuneError(result);
    }

    return buildSuccessResponse("neptune-flood", {
      quote: toRecord(result.body) ?? {},
    });
  },
});

export const neptuneFloodTools = [
  lookup_flood_risk,
  get_flood_zone,
  get_flood_insurance_quote,
] as const;
