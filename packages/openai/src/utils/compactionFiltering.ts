/**
 * Compaction candidate filtering (P2 Pattern 22).
 * Preserves user messages during compaction, only compacts assistant/tool history.
 */

export type ConversationItem = {
  role?: string;
  type?: string;
  [key: string]: unknown;
};

export function selectCompactionCandidates(items: ConversationItem[]): ConversationItem[] {
  return items.filter((item) => {
    if (item.role === "user") return false;
    if (item.type === "compaction") return false;
    return true;
  });
}

export function preserveUserMessages(items: ConversationItem[]): ConversationItem[] {
  return items.filter((item) => item.role === "user");
}

export function shouldTriggerCompaction(
  candidateCount: number,
  threshold: number = 10,
): boolean {
  return candidateCount >= threshold;
}

export function partitionForCompaction(items: ConversationItem[]): {
  preserve: ConversationItem[];
  compact: ConversationItem[];
} {
  const preserve: ConversationItem[] = [];
  const compact: ConversationItem[] = [];
  for (const item of items) {
    if (item.role === "user" || item.type === "compaction") {
      preserve.push(item);
    } else {
      compact.push(item);
    }
  }
  return { preserve, compact };
}
