import {
  ParcelSetDefinition,
  ParcelSetMaterialization,
  ParcelSetStatus,
} from "@entitlement-os/shared";

/**
 * Internal storage structure for a parcel set
 */
interface RegistryEntry {
  definition: ParcelSetDefinition;
  materialization: ParcelSetMaterialization | null;
}

/**
 * Conversation-scoped in-memory registry for parcel set definitions and materializations.
 *
 * Stores parcel sets keyed by conversation ID and set ID, enabling agents to track
 * and reference parcel sets within a single conversation thread. Sets are isolated
 * between conversations.
 */
export class ParcelSetRegistry {
  /**
   * Nested map structure: conversationId → (setId → RegistryEntry)
   */
  private store: Map<string, Map<string, RegistryEntry>> = new Map();

  /**
   * Register a new parcel set definition in the registry.
   *
   * @param conversationId - The conversation ID for scoping
   * @param definition - The parcel set definition to register
   */
  register(conversationId: string, definition: ParcelSetDefinition): void {
    if (!this.store.has(conversationId)) {
      this.store.set(conversationId, new Map());
    }

    const conversationSets = this.store.get(conversationId)!;
    conversationSets.set(definition.id, {
      definition,
      materialization: null,
    });
  }

  /**
   * Retrieve a parcel set definition by ID.
   *
   * @param conversationId - The conversation ID for scoping
   * @param setId - The parcel set ID
   * @returns The definition if found, null otherwise
   */
  getDefinition(
    conversationId: string,
    setId: string
  ): ParcelSetDefinition | null {
    const conversationSets = this.store.get(conversationId);
    if (!conversationSets) {
      return null;
    }

    const entry = conversationSets.get(setId);
    return entry ? entry.definition : null;
  }

  /**
   * Retrieve a parcel set materialization by set ID.
   *
   * @param conversationId - The conversation ID for scoping
   * @param setId - The parcel set ID
   * @returns The materialization if found, null otherwise
   */
  getMaterialization(
    conversationId: string,
    setId: string
  ): ParcelSetMaterialization | null {
    const conversationSets = this.store.get(conversationId);
    if (!conversationSets) {
      return null;
    }

    const entry = conversationSets.get(setId);
    return entry ? entry.materialization : null;
  }

  /**
   * Update the materialization for a parcel set.
   *
   * @param conversationId - The conversation ID for scoping
   * @param materialization - The materialization data
   * @throws If the parcel set definition doesn't exist
   */
  updateMaterialization(
    conversationId: string,
    materialization: ParcelSetMaterialization
  ): void {
    const conversationSets = this.store.get(conversationId);
    if (!conversationSets) {
      throw new Error(
        `No parcel sets found for conversation ${conversationId}`
      );
    }

    const entry = conversationSets.get(materialization.parcelSetId);
    if (!entry) {
      throw new Error(
        `Parcel set ${materialization.parcelSetId} not found in conversation ${conversationId}`
      );
    }

    entry.materialization = materialization;
  }

  /**
   * Update the status of a parcel set definition.
   *
   * @param conversationId - The conversation ID for scoping
   * @param setId - The parcel set ID
   * @param status - The new status
   * @throws If the parcel set doesn't exist
   */
  updateStatus(
    conversationId: string,
    setId: string,
    status: ParcelSetStatus
  ): void {
    const conversationSets = this.store.get(conversationId);
    if (!conversationSets) {
      throw new Error(
        `No parcel sets found for conversation ${conversationId}`
      );
    }

    const entry = conversationSets.get(setId);
    if (!entry) {
      throw new Error(
        `Parcel set ${setId} not found in conversation ${conversationId}`
      );
    }

    entry.definition.status = status;
  }

  /**
   * List all parcel set IDs for a conversation.
   *
   * @param conversationId - The conversation ID for scoping
   * @returns Array of set IDs, empty array if conversation not found
   */
  listSetIds(conversationId: string): string[] {
    const conversationSets = this.store.get(conversationId);
    return conversationSets ? Array.from(conversationSets.keys()) : [];
  }

  /**
   * Mark all parcel sets with a matching origin kind as "stale".
   *
   * This is useful for invalidating sets when conditions change (e.g., viewport changes
   * should stale all viewport-origin sets, but not selection sets).
   *
   * @param conversationId - The conversation ID for scoping
   * @param originKind - The origin kind to match (e.g., "viewport", "selection", "query")
   */
  markStaleByOrigin(conversationId: string, originKind: string): void {
    const conversationSets = this.store.get(conversationId);
    if (!conversationSets) {
      return;
    }

    for (const entry of conversationSets.values()) {
      if (entry.definition.origin.kind === originKind) {
        entry.definition.status = "stale";
      }
    }
  }
}
