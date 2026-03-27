import { describe, it, expect, beforeEach } from "vitest";
import {
  setOrgPolicy,
  getOrgPolicy,
  validateRequestDomains,
  buildRequestNetworkPolicy,
  isDomainAllowed,
  _clearPolicies,
  type OrgNetworkPolicy,
  type RequestNetworkPolicy,
} from "../networkPolicy";

describe("networkPolicy", () => {
  beforeEach(() => {
    _clearPolicies();
  });

  describe("setOrgPolicy", () => {
    it("should store custom domains for an org", () => {
      const orgId = "org-123";
      const domains = ["example.com", "api.example.com", "cdn.example.com"];

      const policy = setOrgPolicy(orgId, domains);

      expect(policy.orgId).toBe(orgId);
      expect(policy.allowedDomains).toEqual(domains);
      expect(policy.updatedAt).toBeDefined();
    });

    it("should deduplicate domains when setting policy", () => {
      const orgId = "org-123";
      const domains = ["example.com", "api.example.com", "example.com"];

      const policy = setOrgPolicy(orgId, domains);

      expect(policy.allowedDomains).toEqual(["example.com", "api.example.com"]);
    });
  });

  describe("getOrgPolicy", () => {
    it("should return default domains for unknown org", () => {
      const policy = getOrgPolicy("unknown-org");

      expect(policy.orgId).toBe("unknown-org");
      expect(policy.allowedDomains).toEqual([
        "gallagherpropco.com",
        "api.gallagherpropco.com",
        "gateway.gallagherpropco.com",
      ]);
      expect(policy.updatedAt).toBeDefined();
    });

    it("should return stored policy for known org", () => {
      const orgId = "org-123";
      const domains = ["custom.com", "api.custom.com"];
      setOrgPolicy(orgId, domains);

      const policy = getOrgPolicy(orgId);

      expect(policy.orgId).toBe(orgId);
      expect(policy.allowedDomains).toEqual(domains);
    });
  });

  describe("validateRequestDomains", () => {
    beforeEach(() => {
      setOrgPolicy("org-123", [
        "gallagherpropco.com",
        "api.gallagherpropco.com",
        "custom.com",
      ]);
    });

    it("should pass validation for allowed domains", () => {
      const result = validateRequestDomains("org-123", [
        "gallagherpropco.com",
        "api.gallagherpropco.com",
      ]);

      expect(result.valid).toBe(true);
      expect(result.rejected).toEqual([]);
    });

    it("should reject non-allowed domains", () => {
      const result = validateRequestDomains("org-123", [
        "gallagherpropco.com",
        "unauthorized.com",
      ]);

      expect(result.valid).toBe(false);
      expect(result.rejected).toEqual(["unauthorized.com"]);
    });

    it("should reject all non-allowed domains", () => {
      const result = validateRequestDomains("org-123", [
        "unauthorized.com",
        "another-bad.com",
        "gallagherpropco.com",
      ]);

      expect(result.valid).toBe(false);
      expect(result.rejected).toContain("unauthorized.com");
      expect(result.rejected).toContain("another-bad.com");
      expect(result.rejected.length).toBe(2);
    });

    it("should handle empty request domains", () => {
      const result = validateRequestDomains("org-123", []);

      expect(result.valid).toBe(true);
      expect(result.rejected).toEqual([]);
    });
  });

  describe("buildRequestNetworkPolicy", () => {
    beforeEach(() => {
      setOrgPolicy("org-123", [
        "gallagherpropco.com",
        "api.gallagherpropco.com",
        "custom.com",
      ]);
    });

    it("should create valid policy for allowed domains", () => {
      const result = buildRequestNetworkPolicy("org-123", [
        "gallagherpropco.com",
        "api.gallagherpropco.com",
      ]);

      expect(result).not.toHaveProperty("error");
      const policy = result as RequestNetworkPolicy;
      expect(policy.type).toBe("allowlist");
      expect(policy.allowed_domains).toEqual([
        "gallagherpropco.com",
        "api.gallagherpropco.com",
      ]);
    });

    it("should return error for rejected domains", () => {
      const result = buildRequestNetworkPolicy("org-123", [
        "gallagherpropco.com",
        "unauthorized.com",
      ]);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toContain("Domains not in org allowlist");
      expect(errorResult.error).toContain("unauthorized.com");
    });

    it("should include domain_secrets when provided", () => {
      const secrets = [
        { domain: "api.gallagherpropco.com", name: "API_KEY", value: "secret123" },
        { domain: "custom.com", name: "TOKEN", value: "token456" },
      ];

      const result = buildRequestNetworkPolicy(
        "org-123",
        ["api.gallagherpropco.com", "custom.com"],
        secrets,
      );

      const policy = result as RequestNetworkPolicy;
      expect(policy.domain_secrets).toEqual(secrets);
    });

    it("should not include domain_secrets when empty array provided", () => {
      const result = buildRequestNetworkPolicy(
        "org-123",
        ["gallagherpropco.com"],
        [],
      );

      const policy = result as RequestNetworkPolicy;
      expect(policy.domain_secrets).toBeUndefined();
    });

    it("should not include domain_secrets when not provided", () => {
      const result = buildRequestNetworkPolicy("org-123", ["gallagherpropco.com"]);

      const policy = result as RequestNetworkPolicy;
      expect(policy.domain_secrets).toBeUndefined();
    });
  });

  describe("isDomainAllowed", () => {
    beforeEach(() => {
      setOrgPolicy("org-123", [
        "gallagherpropco.com",
        "api.gallagherpropco.com",
        "cdn.gallagherpropco.com",
      ]);
    });

    it("should return true for allowed domain", () => {
      const allowed = isDomainAllowed("org-123", "api.gallagherpropco.com");

      expect(allowed).toBe(true);
    });

    it("should return false for non-allowed domain", () => {
      const allowed = isDomainAllowed("org-123", "unauthorized.com");

      expect(allowed).toBe(false);
    });

    it("should return false for allowed domain with different case", () => {
      const allowed = isDomainAllowed("org-123", "API.GALLAGHERPROPCO.COM");

      expect(allowed).toBe(false);
    });

    it("should return true for default domain on unknown org", () => {
      const allowed = isDomainAllowed("unknown-org", "gallagherpropco.com");

      expect(allowed).toBe(true);
    });
  });

  describe("integration scenarios", () => {
    it("should handle multiple orgs with different policies", () => {
      setOrgPolicy("org-1", ["example1.com", "api.example1.com"]);
      setOrgPolicy("org-2", ["example2.com", "api.example2.com"]);

      const policy1 = getOrgPolicy("org-1");
      const policy2 = getOrgPolicy("org-2");

      expect(policy1.allowedDomains).toEqual(["example1.com", "api.example1.com"]);
      expect(policy2.allowedDomains).toEqual(["example2.com", "api.example2.com"]);
    });

    it("should handle updating org policy", () => {
      const orgId = "org-123";

      setOrgPolicy(orgId, ["v1.com"]);
      let policy = getOrgPolicy(orgId);
      expect(policy.allowedDomains).toEqual(["v1.com"]);

      setOrgPolicy(orgId, ["v2.com", "api.v2.com"]);
      policy = getOrgPolicy(orgId);
      expect(policy.allowedDomains).toEqual(["v2.com", "api.v2.com"]);
    });

    it("should enforce two-layer validation: org then request", () => {
      setOrgPolicy("org-123", ["example.com", "api.example.com"]);

      // Request tries to use subset
      const subsetResult = buildRequestNetworkPolicy("org-123", ["example.com"]);
      expect(subsetResult).not.toHaveProperty("error");

      // Request tries to exceed org policy
      const exceedResult = buildRequestNetworkPolicy("org-123", [
        "example.com",
        "unauthorized.com",
      ]);
      expect(exceedResult).toHaveProperty("error");
    });

    it("should support complex secret mapping across domains", () => {
      setOrgPolicy("org-123", [
        "db.example.com",
        "api.example.com",
        "auth.example.com",
      ]);

      const secrets = [
        { domain: "db.example.com", name: "DB_PASS", value: "pass123" },
        { domain: "api.example.com", name: "API_KEY", value: "key456" },
        { domain: "auth.example.com", name: "OAUTH_SECRET", value: "secret789" },
      ];

      const result = buildRequestNetworkPolicy(
        "org-123",
        ["db.example.com", "api.example.com", "auth.example.com"],
        secrets,
      );

      const policy = result as RequestNetworkPolicy;
      expect(policy.domain_secrets).toHaveLength(3);
      expect(policy.domain_secrets?.map((s) => s.name)).toEqual([
        "DB_PASS",
        "API_KEY",
        "OAUTH_SECRET",
      ]);
    });
  });
});
