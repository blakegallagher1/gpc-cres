import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";

/**
 * EBR UDC zoning matrix lookup.
 *
 * Hardcoded subset of permitted-use checks based on East Baton Rouge
 * Unified Development Code. In production this will query a full
 * zoning matrix table; for now we cover the SKU types we target.
 *
 * Key:
 *   P  = Permitted
 *   C  = Conditional Use Permit required
 *   X  = Prohibited
 */
type ZoningEntry = {
  permitted: boolean;
  status: "permitted" | "conditional" | "prohibited";
  notes: string;
};

const ZONING_MATRIX: Record<string, Record<string, ZoningEntry>> = {
  // Industrial / Light Industrial zones
  M1: {
    SMALL_BAY_FLEX: {
      permitted: true,
      status: "permitted",
      notes: "Small bay flex / light industrial is permitted by right in M1 (Light Industry)",
    },
    OUTDOOR_STORAGE: {
      permitted: true,
      status: "permitted",
      notes: "Outdoor storage is permitted in M1 with screening requirements per UDC 17.5",
    },
    TRUCK_PARKING: {
      permitted: true,
      status: "permitted",
      notes: "Truck parking/terminal facilities permitted in M1",
    },
  },
  M2: {
    SMALL_BAY_FLEX: {
      permitted: true,
      status: "permitted",
      notes: "Small bay flex / light industrial is permitted in M2 (Heavy Industry)",
    },
    OUTDOOR_STORAGE: {
      permitted: true,
      status: "permitted",
      notes: "Outdoor storage is permitted in M2",
    },
    TRUCK_PARKING: {
      permitted: true,
      status: "permitted",
      notes: "Truck parking/terminal facilities permitted in M2",
    },
  },
  // Commercial zones
  C1: {
    SMALL_BAY_FLEX: {
      permitted: false,
      status: "prohibited",
      notes: "Flex/industrial uses not permitted in C1 (Neighborhood Commercial)",
    },
    OUTDOOR_STORAGE: {
      permitted: false,
      status: "prohibited",
      notes: "Outdoor storage is not permitted in C1",
    },
    TRUCK_PARKING: {
      permitted: false,
      status: "prohibited",
      notes: "Truck parking not permitted in C1",
    },
  },
  C2: {
    SMALL_BAY_FLEX: {
      permitted: false,
      status: "conditional",
      notes: "May be allowed via CUP in C2 (General Commercial) with conditions",
    },
    OUTDOOR_STORAGE: {
      permitted: false,
      status: "conditional",
      notes: "Outdoor storage may be conditionally permitted in C2 via CUP",
    },
    TRUCK_PARKING: {
      permitted: false,
      status: "prohibited",
      notes: "Truck parking not permitted in C2",
    },
  },
  C3: {
    SMALL_BAY_FLEX: {
      permitted: false,
      status: "conditional",
      notes: "May be allowed via CUP in C3 (Heavy Commercial)",
    },
    OUTDOOR_STORAGE: {
      permitted: false,
      status: "conditional",
      notes: "Outdoor storage conditionally permitted in C3 via CUP",
    },
    TRUCK_PARKING: {
      permitted: false,
      status: "conditional",
      notes: "Truck parking may be conditionally permitted in C3 via CUP",
    },
  },
  // Agricultural
  A1: {
    SMALL_BAY_FLEX: {
      permitted: false,
      status: "prohibited",
      notes: "Industrial uses prohibited in A1 (Agricultural)",
    },
    OUTDOOR_STORAGE: {
      permitted: false,
      status: "prohibited",
      notes: "Commercial outdoor storage prohibited in A1",
    },
    TRUCK_PARKING: {
      permitted: false,
      status: "prohibited",
      notes: "Commercial truck parking prohibited in A1",
    },
  },
  // Residential
  R1: {
    SMALL_BAY_FLEX: {
      permitted: false,
      status: "prohibited",
      notes: "Industrial uses prohibited in residential zones",
    },
    OUTDOOR_STORAGE: {
      permitted: false,
      status: "prohibited",
      notes: "Commercial outdoor storage prohibited in residential zones",
    },
    TRUCK_PARKING: {
      permitted: false,
      status: "prohibited",
      notes: "Commercial truck parking prohibited in residential zones",
    },
  },
};

export const zoningMatrixLookup = tool({
  name: "zoning_matrix_lookup",
  description:
    "Check the EBR UDC zoning matrix to determine if a proposed use is permitted, conditional, or prohibited in a given zoning district",
  parameters: z.object({
    zoningCode: z
      .string()
      .min(1)
      .describe("The zoning district code (e.g. M1, C2, A1, R1)"),
    proposedUse: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .describe("The proposed SKU/use type"),
  }),
  execute: async ({ zoningCode, proposedUse }) => {
    const code = zoningCode.toUpperCase().trim();
    const zoneEntry = ZONING_MATRIX[code];

    if (!zoneEntry) {
      return JSON.stringify({
        permitted: false,
        status: "unknown",
        notes: `Zoning code '${code}' not found in the EBR UDC matrix. Manual review required. Check the parish pack or consult the jurisdiction's planning department.`,
        zoningCode: code,
        proposedUse,
      });
    }

    const useEntry = zoneEntry[proposedUse];
    if (!useEntry) {
      return JSON.stringify({
        permitted: false,
        status: "unknown",
        notes: `Use type '${proposedUse}' not mapped for zone '${code}'. Manual review required.`,
        zoningCode: code,
        proposedUse,
      });
    }

    return JSON.stringify({
      ...useEntry,
      zoningCode: code,
      proposedUse,
    });
  },
});

export const parishPackLookup = tool({
  name: "parish_pack_lookup",
  description:
    "Retrieve the current parish pack (entitlement playbook) for a jurisdiction and SKU type. Returns the full pack JSON or a specific section if specified.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    jurisdictionId: z
      .string()
      .uuid()
      .describe("The jurisdiction to look up"),
    sku: z
      .enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"])
      .describe("The SKU type"),
    section: z
      .string()
      .optional()
      .describe(
        "Optional section to extract (e.g. 'paths', 'fees', 'meeting_cadence', 'application_requirements', 'notice_rules')",
      ),
  }),
  execute: async ({ orgId, jurisdictionId, sku, section }) => {
    const pack = await prisma.parishPackVersion.findFirst({
      where: {
        orgId,
        jurisdictionId,
        sku,
        status: "current",
      },
      orderBy: { version: "desc" },
    });

    if (!pack) {
      return JSON.stringify({
        error: "No current parish pack found for this jurisdiction and SKU",
        jurisdictionId,
        sku,
      });
    }

    const packJson = pack.packJson as Record<string, unknown>;

    if (section && section in packJson) {
      return JSON.stringify({
        section,
        data: packJson[section],
        version: pack.version,
        generatedAt: pack.generatedAt,
      });
    }

    if (section && !(section in packJson)) {
      return JSON.stringify({
        error: `Section '${section}' not found in parish pack`,
        availableSections: Object.keys(packJson),
        version: pack.version,
      });
    }

    return JSON.stringify({
      ...packJson,
      _meta: {
        version: pack.version,
        generatedAt: pack.generatedAt,
        status: pack.status,
      },
    });
  },
});
