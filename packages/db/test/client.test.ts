import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayTarget } from "../src/gateway-adapter.js";

declare const globalThis: typeof global & {
  __ENTITLEMENT_OS_PRISMA__?: unknown;
  __ENTITLEMENT_OS_PRISMA_READ__?: unknown;
};

const {
  mockPrismaClient,
  mockCreateGatewayAdapterFactory,
  constructorArgs,
} = vi.hoisted(() => {
  const args: unknown[] = [];
  return {
    constructorArgs: args,
    mockPrismaClient: vi.fn(function PrismaClientMock(this: { _options?: unknown }, options?: unknown) {
      args.push(options);
      this._options = options;
    }),
    mockCreateGatewayAdapterFactory: vi.fn().mockImplementation((url: string, key: string) => ({
      url,
      key,
      provider: "postgres",
      adapterName: "prisma-gateway-http",
      async connect() {
        return { url, key };
      },
    })),
  };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: mockPrismaClient,
}));

vi.mock("../src/gateway-adapter.js", () => ({
  createGatewayAdapterFactory: mockCreateGatewayAdapterFactory,
}));

describe("packages/db client gateway config", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  function expectGatewayTargets(callNumber: number, targets: GatewayTarget[]) {
    expect(mockCreateGatewayAdapterFactory).toHaveBeenNthCalledWith(callNumber, targets);
  }

  beforeEach(() => {
    constructorArgs.length = 0;
    mockPrismaClient.mockClear();
    mockCreateGatewayAdapterFactory.mockClear();
    vi.resetModules();
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.GATEWAY_PROXY_URL;
    delete process.env.GATEWAY_PROXY_TOKEN;
    delete process.env.GATEWAY_DATABASE_URL;
    delete process.env.LOCAL_API_KEY;
    delete process.env.GATEWAY_API_KEY;
    delete process.env.API_KEYS;
    delete process.env.LOCAL_API_URL;
    delete process.env.DATABASE_URL;
    delete process.env.READ_REPLICA_DATABASE_URL;
    delete process.env.ENABLE_READ_REPLICA;
    delete process.env.PRISMA_CONNECTION_LIMIT;
    delete process.env.PRISMA_POOL_TIMEOUT_SECONDS;
    delete process.env.PRISMA_DISABLE_GATEWAY;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete globalThis.__ENTITLEMENT_OS_PRISMA__;
    delete globalThis.__ENTITLEMENT_OS_PRISMA_READ__;
  });

  it("prefers GATEWAY_PROXY_URL over GATEWAY_DATABASE_URL when both are present", async () => {
    process.env.GATEWAY_PROXY_URL = "https://gateway.gallagherpropco.com";
    process.env.GATEWAY_PROXY_TOKEN = "proxy-token";
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expectGatewayTargets(1, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "proxy-token", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-direct" },
    ]);
    expectGatewayTargets(2, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "proxy-token", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-direct" },
    ]);
    expect(constructorArgs).toHaveLength(2);
  });

  it("adds a hosted direct-gateway fallback behind the default proxy target", async () => {
    process.env.NODE_ENV = "production";
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expectGatewayTargets(1, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-direct" },
    ]);
    expectGatewayTargets(2, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-direct" },
    ]);
    expect(constructorArgs).toHaveLength(2);
  });

  it("accepts legacy gateway bearer env names in hosted runtimes", async () => {
    process.env.NODE_ENV = "production";
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.GATEWAY_API_KEY = "legacy-gateway-key";

    await import("../src/client.js");

    expectGatewayTargets(1, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "legacy-gateway-key", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "legacy-gateway-key", name: "gateway-direct" },
    ]);
    expectGatewayTargets(2, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "legacy-gateway-key", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "legacy-gateway-key", name: "gateway-direct" },
    ]);
    expect(constructorArgs).toHaveLength(2);
  });

  it("uses the first API_KEYS entry as a last-resort gateway bearer", async () => {
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.API_KEYS = "primary-key,secondary-key";

    await import("../src/client.js");

    expectGatewayTargets(1, [
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "primary-key", name: "gateway-direct" },
    ]);
    expectGatewayTargets(2, [
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "primary-key", name: "gateway-direct" },
    ]);
    expect(constructorArgs).toHaveLength(2);
  });

  it("falls back to GATEWAY_DATABASE_URL with LOCAL_API_KEY outside hosted runtimes", async () => {
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expectGatewayTargets(1, [
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-direct" },
    ]);
    expectGatewayTargets(2, [
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-direct" },
    ]);
    expect(constructorArgs).toHaveLength(2);
  });

  it("prefers direct DATABASE_URL over gateway targets in local development", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/entitlement_os";
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expect(mockCreateGatewayAdapterFactory).not.toHaveBeenCalled();
    expect(constructorArgs).toHaveLength(2);
    expect(constructorArgs[0]).toEqual({
      datasources: {
        db: {
          url: "postgresql://postgres:postgres@localhost:5432/entitlement_os",
        },
      },
      log: ["error", "warn"],
    });
  });

  it("allows production-style local harnesses to disable the gateway adapter", async () => {
    process.env.NODE_ENV = "production";
    process.env.PRISMA_DISABLE_GATEWAY = "true";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54323/entitlement_os";
    process.env.GATEWAY_PROXY_URL = "https://gateway.gallagherpropco.com";
    process.env.GATEWAY_PROXY_TOKEN = "proxy-token";
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expect(mockCreateGatewayAdapterFactory).not.toHaveBeenCalled();
    expect(constructorArgs).toHaveLength(2);
    expect(constructorArgs[0]).toEqual({
      datasources: {
        db: {
          url: "postgresql://postgres:postgres@localhost:54323/entitlement_os",
        },
      },
      log: ["error", "warn"],
    });
  });

  it("adds LOCAL_API_URL as the final hosted gateway fallback when a key is available", async () => {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expectGatewayTargets(1, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "local-api" },
    ]);
    expectGatewayTargets(2, [
      { baseUrl: "https://gateway.gallagherpropco.com", apiKey: "local-api-key", name: "gateway-proxy" },
      { baseUrl: "https://api.gallagherpropco.com", apiKey: "local-api-key", name: "local-api" },
    ]);
    expect(constructorArgs).toHaveLength(2);
  });

  it("does not create a gateway adapter when hosted LOCAL_API_URL is set without a key", async () => {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";

    await import("../src/client.js");

    expect(mockCreateGatewayAdapterFactory).not.toHaveBeenCalled();
    expect(constructorArgs[0]).toEqual({
      datasources: undefined,
      log: ["error", "warn"],
    });
  });

  it("does not force LOCAL_API_URL in non-hosted runtimes", async () => {
    process.env.NODE_ENV = "development";
    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/entitlement_os";

    await import("../src/client.js");

    expect(mockCreateGatewayAdapterFactory).not.toHaveBeenCalled();
    expect(constructorArgs).toHaveLength(2);
    expect(constructorArgs[0]).toEqual({
      datasources: {
        db: {
          url: "postgresql://postgres:postgres@localhost:5432/entitlement_os",
        },
      },
      log: ["error", "warn"],
    });
  });
});
