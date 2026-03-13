import { z } from "zod";

/**
 * Production auth currently uses a seeded sentinel org ID for the default org.
 * Direct tool execution still needs to accept that ID while preserving normal UUID validation.
 */
export const SENTINEL_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const ToolOrgIdSchema = z.union([
  z.string().uuid(),
  z.literal(SENTINEL_ORG_ID),
]);
