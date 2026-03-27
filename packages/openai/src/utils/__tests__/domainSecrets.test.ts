import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSecretHeadersForDomain,
  hasDomainSecret,
} from "../domainSecrets";

describe("domainSecrets", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getSecretHeadersForDomain", () => {
    it("returns correct header for known domain with configured secret", () => {
      process.env.LOCAL_API_KEY = "test-api-key-123";
      const headers = getSecretHeadersForDomain(
        "https://api.gallagherpropco.com/health"
      );
      expect(headers).toEqual({
        Authorization: "Bearer test-api-key-123",
      });
    });

    it("returns correct header for gateway proxy domain", () => {
      process.env.GATEWAY_PROXY_TOKEN = "gateway-token-456";
      const headers = getSecretHeadersForDomain(
        "https://gateway.gallagherpropco.com/parcels"
      );
      expect(headers).toEqual({
        Authorization: "Bearer gateway-token-456",
      });
    });

    it("returns correct header for qdrant domain with custom format", () => {
      process.env.QDRANT_API_KEY = "qdrant-key-789";
      const headers = getSecretHeadersForDomain(
        "https://qdrant.gallagherpropco.com/search"
      );
      expect(headers).toEqual({
        "api-key": "qdrant-key-789",
      });
    });

    it("returns correct header for cua domain", () => {
      process.env.LOCAL_API_KEY = "cua-key-999";
      const headers = getSecretHeadersForDomain(
        "https://cua.gallagherpropco.com/tasks"
      );
      expect(headers).toEqual({
        Authorization: "Bearer cua-key-999",
      });
    });

    it("returns empty object for unknown domain", () => {
      process.env.SOME_KEY = "some-value";
      const headers = getSecretHeadersForDomain(
        "https://unknown.example.com/api"
      );
      expect(headers).toEqual({});
    });

    it("returns empty object when env var is not set", () => {
      delete process.env.LOCAL_API_KEY;
      const headers = getSecretHeadersForDomain(
        "https://api.gallagherpropco.com/health"
      );
      expect(headers).toEqual({});
    });

    it("returns empty object for invalid URL", () => {
      process.env.LOCAL_API_KEY = "test-key";
      const headers = getSecretHeadersForDomain("not-a-valid-url");
      expect(headers).toEqual({});
    });

    it("handles URLs with different protocols", () => {
      process.env.GATEWAY_PROXY_TOKEN = "proto-test-key";
      const httpHeaders = getSecretHeadersForDomain(
        "http://gateway.gallagherpropco.com/data"
      );
      expect(httpHeaders).toEqual({
        Authorization: "Bearer proto-test-key",
      });
    });

    it("handles URLs with trailing slashes", () => {
      process.env.LOCAL_API_KEY = "trailing-key";
      const headers = getSecretHeadersForDomain(
        "https://api.gallagherpropco.com/"
      );
      expect(headers).toEqual({
        Authorization: "Bearer trailing-key",
      });
    });

    it("does not leak secret values in error cases", () => {
      process.env.LOCAL_API_KEY = "secret-that-should-not-appear";
      const headers = getSecretHeadersForDomain("invalid url format [][][]");
      expect(headers).toEqual({});
      expect(JSON.stringify(headers)).not.toContain(
        "secret-that-should-not-appear"
      );
    });
  });

  describe("hasDomainSecret", () => {
    it("returns true for known domain", () => {
      expect(hasDomainSecret("https://api.gallagherpropco.com/health")).toBe(
        true
      );
    });

    it("returns true for gateway proxy domain", () => {
      expect(hasDomainSecret("https://gateway.gallagherpropco.com/data")).toBe(
        true
      );
    });

    it("returns true for qdrant domain", () => {
      expect(hasDomainSecret("https://qdrant.gallagherpropco.com/search")).toBe(
        true
      );
    });

    it("returns true for cua domain", () => {
      expect(hasDomainSecret("https://cua.gallagherpropco.com/tasks")).toBe(
        true
      );
    });

    it("returns false for unknown domain", () => {
      expect(
        hasDomainSecret("https://unknown.example.com/api")
      ).toBe(false);
    });

    it("returns false for invalid URL", () => {
      expect(hasDomainSecret("not-a-valid-url")).toBe(false);
    });

    it("returns true regardless of env var presence", () => {
      delete process.env.LOCAL_API_KEY;
      expect(hasDomainSecret("https://api.gallagherpropco.com/health")).toBe(
        true
      );
    });
  });
});
