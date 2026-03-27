import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildHostedShellConfig,
  buildContainerReferenceConfig,
  type ShellEnvironmentConfig,
} from "../shellEnvironment";

describe("shellEnvironment", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("buildHostedShellConfig", () => {
    it("returns container_auto with default domains", () => {
      delete process.env.LOCAL_API_KEY;
      delete process.env.GATEWAY_PROXY_TOKEN;

      const config = buildHostedShellConfig();

      expect(config.type).toBe("shell");
      expect(config.environment.type).toBe("container_auto");
      expect(config.environment.network_policy?.type).toBe("allowlist");
      expect(config.environment.network_policy?.allowed_domains).toEqual([
        "gallagherpropco.com",
        "api.gallagherpropco.com",
        "gateway.gallagherpropco.com",
      ]);
    });

    it("includes additional domains", () => {
      delete process.env.LOCAL_API_KEY;
      delete process.env.GATEWAY_PROXY_TOKEN;

      const config = buildHostedShellConfig({
        additionalDomains: ["example.com", "test.io"],
      });

      expect(config.environment.network_policy?.allowed_domains).toContain(
        "example.com",
      );
      expect(config.environment.network_policy?.allowed_domains).toContain(
        "test.io",
      );
      expect(config.environment.network_policy?.allowed_domains).toHaveLength(5);
    });

    it("attaches skills when provided", () => {
      delete process.env.LOCAL_API_KEY;
      delete process.env.GATEWAY_PROXY_TOKEN;

      const config = buildHostedShellConfig({
        skills: [
          { skill_id: "skill-1" },
          { skill_id: "skill-2", version: "latest" },
          { skill_id: "skill-3", version: 5 },
        ],
      });

      expect(config.environment.skills).toBeDefined();
      expect(config.environment.skills).toHaveLength(3);
      expect(config.environment.skills?.[0]).toEqual({
        type: "skill_reference",
        skill_id: "skill-1",
      });
      expect(config.environment.skills?.[1]).toEqual({
        type: "skill_reference",
        skill_id: "skill-2",
        version: "latest",
      });
      expect(config.environment.skills?.[2]).toEqual({
        type: "skill_reference",
        skill_id: "skill-3",
        version: 5,
      });
    });

    it("includes memory limit when specified", () => {
      delete process.env.LOCAL_API_KEY;
      delete process.env.GATEWAY_PROXY_TOKEN;

      const config = buildHostedShellConfig({ memoryLimit: "16g" });

      expect(config.environment.memory_limit).toBe("16g");
    });

    it("omits memory limit when not specified", () => {
      delete process.env.LOCAL_API_KEY;
      delete process.env.GATEWAY_PROXY_TOKEN;

      const config = buildHostedShellConfig();

      expect(config.environment.memory_limit).toBeUndefined();
    });

    it("includes domain secrets when env vars are set", () => {
      process.env.LOCAL_API_KEY = "test-api-key";
      process.env.GATEWAY_PROXY_TOKEN = "test-gateway-token";

      const config = buildHostedShellConfig();

      expect(config.environment.network_policy?.domain_secrets).toBeDefined();
      expect(config.environment.network_policy?.domain_secrets).toHaveLength(2);

      const secrets = config.environment.network_policy?.domain_secrets ?? [];
      const apiKeySecret = secrets.find((s) => s.domain === "api.gallagherpropco.com");
      const gatewaySecret = secrets.find(
        (s) => s.domain === "gateway.gallagherpropco.com",
      );

      expect(apiKeySecret).toEqual({
        domain: "api.gallagherpropco.com",
        name: "GATEWAY_KEY",
        value: "test-api-key",
      });
      expect(gatewaySecret).toEqual({
        domain: "gateway.gallagherpropco.com",
        name: "GATEWAY_TOKEN",
        value: "test-gateway-token",
      });
    });

    it("omits domain_secrets when env vars are not set", () => {
      delete process.env.LOCAL_API_KEY;
      delete process.env.GATEWAY_PROXY_TOKEN;

      const config = buildHostedShellConfig();

      expect(config.environment.network_policy?.domain_secrets).toBeUndefined();
    });

    it("includes only available domain secrets", () => {
      process.env.LOCAL_API_KEY = "test-api-key";
      delete process.env.GATEWAY_PROXY_TOKEN;

      const config = buildHostedShellConfig();

      expect(config.environment.network_policy?.domain_secrets).toHaveLength(1);
      expect(config.environment.network_policy?.domain_secrets?.[0]).toEqual({
        domain: "api.gallagherpropco.com",
        name: "GATEWAY_KEY",
        value: "test-api-key",
      });
    });
  });

  describe("buildContainerReferenceConfig", () => {
    it("returns correct structure for container reference", () => {
      const config = buildContainerReferenceConfig("container-123");

      expect(config.type).toBe("shell");
      expect(config.environment.type).toBe("container_reference");
      expect(config.environment.container_id).toBe("container-123");
    });

    it("handles different container IDs", () => {
      const ids = ["abc-123", "prod-worker-1", "temp-container"];

      ids.forEach((id) => {
        const config = buildContainerReferenceConfig(id);
        expect(config.environment.container_id).toBe(id);
      });
    });
  });

  describe("integration", () => {
    it("builds a complete config with all options", () => {
      process.env.LOCAL_API_KEY = "api-key-value";
      process.env.GATEWAY_PROXY_TOKEN = "gateway-token-value";

      const config = buildHostedShellConfig({
        skills: [
          { skill_id: "cre-finance", version: "latest" },
          { skill_id: "market-analysis", version: 2 },
        ],
        additionalDomains: ["crm.example.com"],
        memoryLimit: "64g",
      });

      expect(config.type).toBe("shell");
      expect(config.environment.type).toBe("container_auto");
      expect(config.environment.network_policy?.type).toBe("allowlist");
      expect(config.environment.network_policy?.allowed_domains).toContain(
        "crm.example.com",
      );
      expect(config.environment.skills).toHaveLength(2);
      expect(config.environment.memory_limit).toBe("64g");
      expect(config.environment.network_policy?.domain_secrets).toHaveLength(2);
    });
  });
});
