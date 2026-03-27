import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerContainer,
  getContainer,
  releaseContainer,
  getContainerConfig,
  cleanupExpiredSessions,
  getActiveSessionCount,
  _clearAllSessions,
} from "../containerManager";

const CONTAINER_TTL_MS = 18 * 60 * 1000; // Match the constant in containerManager

describe("containerManager", () => {
  beforeEach(() => {
    _clearAllSessions();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("registerContainer", () => {
    it("should create a session with correct properties", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const conversationId = "conv-123";
      const containerId = "container-456";

      const session = registerContainer(conversationId, containerId);

      expect(session).toMatchObject({
        containerId,
        conversationId,
      });
      expect(session.createdAt).toBe(0); // Fake timer starts at 0
      expect(session.lastAccessedAt).toBe(0);
    });
  });

  describe("getContainer", () => {
    it("should return session for active container", () => {
      const conversationId = "conv-123";
      const containerId = "container-456";
      registerContainer(conversationId, containerId);

      const session = getContainer(conversationId);

      expect(session).not.toBeNull();
      expect(session!.containerId).toBe(containerId);
    });

    it("should return null for unknown conversation", () => {
      const session = getContainer("unknown-conv");

      expect(session).toBeNull();
    });

    it("should return null for expired container", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const conversationId = "conv-123";
      const containerId = "container-456";
      registerContainer(conversationId, containerId);

      // Advance time past TTL
      vi.advanceTimersByTime(CONTAINER_TTL_MS + 1000);

      const session = getContainer(conversationId);

      expect(session).toBeNull();
    });

    it("should update lastAccessedAt on access", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const conversationId = "conv-123";
      const containerId = "container-456";
      registerContainer(conversationId, containerId);

      const initialSession = getContainer(conversationId);
      const initialAccessTime = initialSession!.lastAccessedAt;

      vi.advanceTimersByTime(5000);

      const updatedSession = getContainer(conversationId);

      expect(updatedSession!.lastAccessedAt).toBe(initialAccessTime + 5000);
    });

    it("should keep container alive when accessed before TTL expires", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const conversationId = "conv-123";
      const containerId = "container-456";
      registerContainer(conversationId, containerId);

      // Access at 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);
      const session1 = getContainer(conversationId);
      expect(session1).not.toBeNull();

      // Access again at 16 minutes (within TTL of last access)
      vi.advanceTimersByTime(6 * 60 * 1000);
      const session2 = getContainer(conversationId);
      expect(session2).not.toBeNull();

      // Access at 18 minutes (should still be valid)
      vi.advanceTimersByTime(2 * 60 * 1000);
      const session3 = getContainer(conversationId);
      expect(session3).not.toBeNull();

      // Access at 36 minutes (18+ min since last access, should expire)
      vi.advanceTimersByTime(18 * 60 * 1000 + 1000);
      const session4 = getContainer(conversationId);
      expect(session4).toBeNull();
    });
  });

  describe("releaseContainer", () => {
    it("should remove session for conversation", () => {
      const conversationId = "conv-123";
      registerContainer(conversationId, "container-456");

      const removed = releaseContainer(conversationId);

      expect(removed).toBe(true);
      expect(getContainer(conversationId)).toBeNull();
    });

    it("should return false for non-existent conversation", () => {
      const removed = releaseContainer("unknown-conv");

      expect(removed).toBe(false);
    });
  });

  describe("getContainerConfig", () => {
    it("should return container_reference for active session", () => {
      const conversationId = "conv-123";
      const containerId = "container-456";
      registerContainer(conversationId, containerId);

      const config = getContainerConfig(conversationId);

      expect(config).toEqual({
        type: "container_reference",
        container_id: containerId,
      });
    });

    it("should return container_auto when no active session", () => {
      const config = getContainerConfig("unknown-conv");

      expect(config).toEqual({ type: "container_auto" });
    });

    it("should return container_auto after session expires", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const conversationId = "conv-123";
      registerContainer(conversationId, "container-456");

      vi.advanceTimersByTime(CONTAINER_TTL_MS + 1000);

      const config = getContainerConfig(conversationId);

      expect(config).toEqual({ type: "container_auto" });
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("should remove only expired sessions", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      registerContainer("conv-1", "container-1");
      vi.advanceTimersByTime(5 * 60 * 1000);
      registerContainer("conv-2", "container-2");

      // Advance 18+ minutes from conv-1's registration time (but not from conv-2's)
      // conv-2 was registered at 5 min, so it will expire at 5 + 18 = 23 min
      // We advance another 14 minutes to reach 19 min total, so conv-1 is expired but not conv-2
      vi.advanceTimersByTime(14 * 60 * 1000);

      const cleaned = cleanupExpiredSessions();

      expect(cleaned).toBe(1);
      expect(getContainer("conv-1")).toBeNull();
      expect(getContainer("conv-2")).not.toBeNull();
    });

    it("should return 0 when no sessions are expired", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      registerContainer("conv-1", "container-1");
      registerContainer("conv-2", "container-2");

      vi.advanceTimersByTime(5 * 60 * 1000);

      const cleaned = cleanupExpiredSessions();

      expect(cleaned).toBe(0);
      expect(getActiveSessionCount()).toBe(2);
    });

    it("should clean up all sessions when all are expired", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      registerContainer("conv-1", "container-1");
      registerContainer("conv-2", "container-2");
      registerContainer("conv-3", "container-3");

      vi.advanceTimersByTime(CONTAINER_TTL_MS + 1000);

      const cleaned = cleanupExpiredSessions();

      expect(cleaned).toBe(3);
      expect(getActiveSessionCount()).toBe(0);
    });
  });

  describe("getActiveSessionCount", () => {
    it("should return correct count of active sessions", () => {
      expect(getActiveSessionCount()).toBe(0);

      registerContainer("conv-1", "container-1");
      expect(getActiveSessionCount()).toBe(1);

      registerContainer("conv-2", "container-2");
      expect(getActiveSessionCount()).toBe(2);

      releaseContainer("conv-1");
      expect(getActiveSessionCount()).toBe(1);
    });

    it("should not count expired sessions", () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      registerContainer("conv-1", "container-1");
      vi.advanceTimersByTime(5 * 60 * 1000);
      registerContainer("conv-2", "container-2");

      // Advance 14 min from current time (19 min total from origin)
      // conv-1 expires at 18 min, conv-2 expires at 23 min
      vi.advanceTimersByTime(14 * 60 * 1000);

      // Accessing conv-2 succeeds (TTL not expired)
      const session2 = getContainer("conv-2");
      expect(session2).not.toBeNull();

      // Accessing conv-1 fails (TTL expired and deleted)
      const session1 = getContainer("conv-1");
      expect(session1).toBeNull();

      // Only conv-2 remains
      expect(getActiveSessionCount()).toBe(1);
    });
  });
});
