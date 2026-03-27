import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    constructorArgs.length = 0;
    mockPrismaClient.mockClear();
    mockCreateGatewayAdapterFactory.mockClear();
    vi.resetModules();
    delete process.env.GATEWAY_PROXY_URL;
    delete process.env.GATEWAY_PROXY_TOKEN;
    delete process.env.GATEWAY_DATABASE_URL;
    delete process.env.LOCAL_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.READ_REPLICA_DATABASE_URL;
    delete process.env.ENABLE_READ_REPLICA;
    delete process.env.PRISMA_CONNECTION_LIMIT;
    delete process.env.PRISMA_POOL_TIMEOUT_SECONDS;
    delete globalThis.__ENTITLEMENT_OS_PRISMA__;
    delete globalThis.__ENTITLEMENT_OS_PRISMA_READ__;
  });

  it("prefers GATEWAY_PROXY_URL over GATEWAY_DATABASE_URL when both are present", async () => {
    process.env.GATEWAY_PROXY_URL = "https://gateway.gallagherpropco.com";
    process.env.GATEWAY_PROXY_TOKEN = "proxy-token";
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expect(mockCreateGatewayAdapterFactory).toHaveBeenNthCalledWith(
      1,
      "https://gateway.gallagherpropco.com",
      "proxy-token",
    );
    expect(mockCreateGatewayAdapterFactory).toHaveBeenNthCalledWith(
      2,
      "https://gateway.gallagherpropco.com",
      "proxy-token",
    );
    expect(constructorArgs).toHaveLength(2);
  });

  it("falls back to GATEWAY_DATABASE_URL with LOCAL_API_KEY when proxy env is absent", async () => {
    process.env.GATEWAY_DATABASE_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "local-api-key";

    await import("../src/client.js");

    expect(mockCreateGatewayAdapterFactory).toHaveBeenNthCalledWith(
      1,
      "https://api.gallagherpropco.com",
      "local-api-key",
    );
    expect(mockCreateGatewayAdapterFactory).toHaveBeenNthCalledWith(
      2,
      "https://api.gallagherpropco.com",
      "local-api-key",
    );
    expect(constructorArgs).toHaveLength(2);
  });
});
