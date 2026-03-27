/**
 * Container session manager for persistent OpenAI hosted containers.
 * Tracks container IDs per conversation for reuse across turns.
 * Handles 20-minute TTL expiry with graceful fallback.
 */

const CONTAINER_TTL_MS = 18 * 60 * 1000; // 18 min (2-min safety margin on 20-min TTL)

export type ContainerSession = {
  containerId: string;
  conversationId: string;
  createdAt: number; // Date.now()
  lastAccessedAt: number;
};

// In-memory store (for single-process deployments)
const containerSessions = new Map<string, ContainerSession>();

/**
 * Get an existing container for a conversation, or return null if expired/missing.
 */
export function getContainer(conversationId: string): ContainerSession | null {
  const session = containerSessions.get(conversationId);
  if (!session) return null;

  const now = Date.now();
  if (now - session.lastAccessedAt > CONTAINER_TTL_MS) {
    // TTL expired — clean up and return null
    containerSessions.delete(conversationId);
    return null;
  }

  // Update last accessed time
  session.lastAccessedAt = now;
  return session;
}

/**
 * Register a new container session for a conversation.
 */
export function registerContainer(
  conversationId: string,
  containerId: string,
): ContainerSession {
  const now = Date.now();
  const session: ContainerSession = {
    containerId,
    conversationId,
    createdAt: now,
    lastAccessedAt: now,
  };
  containerSessions.set(conversationId, session);
  return session;
}

/**
 * Release a container session for a conversation.
 */
export function releaseContainer(conversationId: string): boolean {
  return containerSessions.delete(conversationId);
}

/**
 * Get or create a container config for a conversation.
 * Returns container_reference if an active session exists, otherwise container_auto.
 */
export function getContainerConfig(conversationId: string):
  | {
      type: "container_reference";
      container_id: string;
    }
  | {
      type: "container_auto";
    } {
  const session = getContainer(conversationId);
  if (session) {
    return { type: "container_reference", container_id: session.containerId };
  }
  return { type: "container_auto" };
}

/**
 * Clean up all expired container sessions.
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [convId, session] of containerSessions.entries()) {
    if (now - session.lastAccessedAt > CONTAINER_TTL_MS) {
      containerSessions.delete(convId);
      cleaned++;
    }
  }
  return cleaned;
}

/**
 * Get count of active container sessions (for monitoring).
 */
export function getActiveSessionCount(): number {
  return containerSessions.size;
}

// For testing
export function _clearAllSessions(): void {
  containerSessions.clear();
}
