import { createHash } from "node:crypto";

export type AgentInputMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      status: "completed";
      content: Array<{ type: "output_text"; text: string }>;
    };

const DB_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function toDatabaseRunId(runId: string): string {
  const trimmedRunId = runId.trim();
  if (DB_UUID_REGEX.test(trimmedRunId)) {
    return trimmedRunId;
  }

  const source = trimmedRunId.length > 0 ? trimmedRunId : "agent-run";
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 32);
  const variant = parseInt(hash[16], 16);
  const variantCharacter = ((variant & 0x3) | 0x8).toString(16);

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variantCharacter}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
