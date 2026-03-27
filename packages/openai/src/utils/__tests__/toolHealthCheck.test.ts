import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerHealthCheck,
  isToolHealthy,
  filterHealthyTools,
  getAllHealthStatuses,
  _clearCache,
  _clearChecks,
  type HealthStatus,
} from "../toolHealthCheck";

const CACHE_TTL_MS = 30_000; // Match the constant in toolHealthCheck

describe("toolHealthCheck", () => {
  beforeEach(() => {
    _clearCache();
    _clearChecks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    _clearCache();
    _clearChecks();
  });

  describe("registerHealthCheck", () => {
    it("should register a health check function", async () => {
      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      registerHealthCheck("test_tool", checkFn);

      const result = await isToolHealthy("test_tool");
      expect(result).toBe(true);
      expect(checkFn).toHaveBeenCalledOnce();
    });
  });

  describe("isToolHealthy", () => {
    it("should return true when no check is registered", async () => {
      const result = await isToolHealthy("unknown_tool");
      expect(result).toBe(true);
    });

    it("should return true for healthy service", async () => {
      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      registerHealthCheck("healthy_tool", checkFn);
      const result = await isToolHealthy("healthy_tool");

      expect(result).toBe(true);
      expect(checkFn).toHaveBeenCalledOnce();
    });

    it("should return false for unhealthy service", async () => {
      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: false,
        checkedAt: Date.now(),
        reason: "Service offline",
      }));

      registerHealthCheck("unhealthy_tool", checkFn);
      const result = await isToolHealthy("unhealthy_tool");

      expect(result).toBe(false);
      expect(checkFn).toHaveBeenCalledOnce();
    });

    it("should return false when health check throws", async () => {
      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => {
        throw new Error("Network error");
      });

      registerHealthCheck("error_tool", checkFn);
      const result = await isToolHealthy("error_tool");

      expect(result).toBe(false);
    });

    it("should cache result for 30s", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      registerHealthCheck("cached_tool", checkFn);

      // First call
      const result1 = await isToolHealthy("cached_tool");
      expect(result1).toBe(true);
      expect(checkFn).toHaveBeenCalledOnce();

      // Second call immediately - should use cache
      const result2 = await isToolHealthy("cached_tool");
      expect(result2).toBe(true);
      expect(checkFn).toHaveBeenCalledOnce(); // Still only 1 call

      // Advance time by 29s - should still use cache
      vi.advanceTimersByTime(29_000);
      const result3 = await isToolHealthy("cached_tool");
      expect(result3).toBe(true);
      expect(checkFn).toHaveBeenCalledOnce(); // Still only 1 call
    });

    it("should refresh cache after TTL expires", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      registerHealthCheck("refresh_tool", checkFn);

      // First call
      const result1 = await isToolHealthy("refresh_tool");
      expect(result1).toBe(true);
      expect(checkFn).toHaveBeenCalledOnce();

      // Advance time past TTL (30s + 1ms)
      vi.advanceTimersByTime(CACHE_TTL_MS + 1);

      // Second call should re-check
      const result2 = await isToolHealthy("refresh_tool");
      expect(result2).toBe(true);
      expect(checkFn).toHaveBeenCalledTimes(2);
    });

    it("should cache failure status", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => {
        throw new Error("Network error");
      });

      registerHealthCheck("failing_tool", checkFn);

      // First call
      const result1 = await isToolHealthy("failing_tool");
      expect(result1).toBe(false);
      expect(checkFn).toHaveBeenCalledOnce();

      // Second call - should use cached failure
      const result2 = await isToolHealthy("failing_tool");
      expect(result2).toBe(false);
      expect(checkFn).toHaveBeenCalledOnce(); // Still only 1 call
    });
  });

  describe("filterHealthyTools", () => {
    it("should remove unhealthy tools", async () => {
      registerHealthCheck("healthy1", async () => ({ healthy: true, checkedAt: Date.now() }));
      registerHealthCheck("unhealthy1", async () => ({ healthy: false, checkedAt: Date.now() }));
      registerHealthCheck("healthy2", async () => ({ healthy: true, checkedAt: Date.now() }));

      const tools = [
        { name: "healthy1" },
        { name: "unhealthy1" },
        { name: "healthy2" },
      ];

      const result = await filterHealthyTools(tools);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ name: "healthy1" });
      expect(result).toContainEqual({ name: "healthy2" });
    });

    it("should keep tools without health checks registered", async () => {
      registerHealthCheck("checked_healthy", async () => ({ healthy: true, checkedAt: Date.now() }));

      const tools = [
        { name: "checked_healthy" },
        { name: "no_check_tool" },
        { name: "also_no_check" },
      ];

      const result = await filterHealthyTools(tools);

      expect(result).toHaveLength(3);
    });

    it("should handle empty tool list", async () => {
      const result = await filterHealthyTools([]);

      expect(result).toEqual([]);
    });

    it("should handle tools without name property", async () => {
      registerHealthCheck("", async () => ({ healthy: true, checkedAt: Date.now() }));

      const tools: { name?: string }[] = [
        { name: "test" },
        {}, // No name
      ];

      const result = await filterHealthyTools(tools);

      // Both tools should be included (test has check and is healthy, unnamed has no check so optimistic default)
      expect(result).toHaveLength(2);
    });
  });

  describe("getAllHealthStatuses", () => {
    it("should return all registered tool statuses", async () => {
      registerHealthCheck("tool1", async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));
      registerHealthCheck("tool2", async () => ({
        healthy: false,
        checkedAt: Date.now(),
        reason: "Service down",
      }));
      registerHealthCheck("tool3", async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      const statuses = await getAllHealthStatuses();

      expect(Object.keys(statuses)).toHaveLength(3);
      expect(statuses.tool1).toMatchObject({ healthy: true });
      expect(statuses.tool2).toMatchObject({ healthy: false, reason: "Service down" });
      expect(statuses.tool3).toMatchObject({ healthy: true });
    });

    it("should return empty object when no checks registered", async () => {
      const statuses = await getAllHealthStatuses();

      expect(statuses).toEqual({});
    });

    it("should cache results from getAllHealthStatuses", async () => {
      const checkFn1 = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));
      const checkFn2 = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      registerHealthCheck("tool1", checkFn1);
      registerHealthCheck("tool2", checkFn2);

      // First call to getAllHealthStatuses
      await getAllHealthStatuses();
      expect(checkFn1).toHaveBeenCalledOnce();
      expect(checkFn2).toHaveBeenCalledOnce();

      // Subsequent isToolHealthy calls should use cache
      await isToolHealthy("tool1");
      expect(checkFn1).toHaveBeenCalledOnce(); // Not called again
      await isToolHealthy("tool2");
      expect(checkFn2).toHaveBeenCalledOnce(); // Not called again
    });

    it("should handle check function failures gracefully", async () => {
      registerHealthCheck("failing_tool", async () => {
        throw new Error("Check failed");
      });
      registerHealthCheck("healthy_tool", async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      const statuses = await getAllHealthStatuses();

      expect(statuses.failing_tool).toMatchObject({
        healthy: false,
        reason: "Check failed",
      });
      expect(statuses.healthy_tool).toMatchObject({
        healthy: true,
      });
    });
  });

  describe("cache clearing utilities", () => {
    it("_clearCache should clear cached results", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: true,
        checkedAt: Date.now(),
      }));

      registerHealthCheck("test_tool", checkFn);

      // First call
      await isToolHealthy("test_tool");
      expect(checkFn).toHaveBeenCalledOnce();

      // Clear cache
      _clearCache();

      // Second call should re-check even without advancing time
      await isToolHealthy("test_tool");
      expect(checkFn).toHaveBeenCalledTimes(2);
    });

    it("_clearChecks should remove all registered checks", async () => {
      registerHealthCheck("tool1", async () => ({ healthy: true, checkedAt: Date.now() }));
      registerHealthCheck("tool2", async () => ({ healthy: true, checkedAt: Date.now() }));

      _clearChecks();

      // After clearing, both should return true (optimistic default)
      const result1 = await isToolHealthy("tool1");
      const result2 = await isToolHealthy("tool2");

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe("integration scenarios", () => {
    it("should handle dynamic health status changes", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);

      let isHealthy = true;
      const checkFn = vi.fn<[], Promise<HealthStatus>>(async () => ({
        healthy: isHealthy,
        checkedAt: Date.now(),
      }));

      registerHealthCheck("dynamic_tool", checkFn);

      // First check - healthy
      let result = await isToolHealthy("dynamic_tool");
      expect(result).toBe(true);

      // Change health status
      isHealthy = false;

      // Cache should still return true
      result = await isToolHealthy("dynamic_tool");
      expect(result).toBe(true);

      // Advance past TTL - should see updated status
      vi.advanceTimersByTime(CACHE_TTL_MS + 1);
      result = await isToolHealthy("dynamic_tool");
      expect(result).toBe(false);
    });

    it("should work with mixed healthy and unhealthy tools", async () => {
      registerHealthCheck("db_tool", async () => ({ healthy: true, checkedAt: Date.now() }));
      registerHealthCheck("api_tool", async () => ({ healthy: false, checkedAt: Date.now() }));
      registerHealthCheck("cache_tool", async () => ({ healthy: true, checkedAt: Date.now() }));

      const tools = [
        { name: "db_tool" },
        { name: "api_tool" },
        { name: "cache_tool" },
        { name: "no_check_tool" },
      ];

      const healthy = await filterHealthyTools(tools);
      expect(healthy).toHaveLength(3); // db, cache, and no_check
      expect(healthy.map((t) => t.name)).toContain("db_tool");
      expect(healthy.map((t) => t.name)).toContain("cache_tool");
      expect(healthy.map((t) => t.name)).toContain("no_check_tool");
      expect(healthy.map((t) => t.name)).not.toContain("api_tool");
    });
  });
});
