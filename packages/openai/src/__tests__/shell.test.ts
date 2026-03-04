import { beforeEach, describe, expect, it, vi } from "vitest";

const { responsesCreateMock, containersDeleteMock } = vi.hoisted(() => ({
  responsesCreateMock: vi.fn(),
  containersDeleteMock: vi.fn(),
}));

vi.mock("openai", () => {
  class OpenAI {
    public responses = {
      create: responsesCreateMock,
    };

    public containers = {
      delete: containersDeleteMock,
    };

    constructor(_options: unknown) {}
  }

  return { default: OpenAI };
});

function shellResponse(params: {
  responseId: string;
  sessionId?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timedOut?: boolean;
}): unknown {
  return {
    id: params.responseId,
    output_text: params.stdout ?? "",
    output: [
      {
        type: "shell_call",
        environment: params.sessionId
          ? {
              type: "container_reference",
              container_id: params.sessionId,
            }
          : null,
      },
      {
        type: "shell_call_output",
        output: [
          {
            stdout: params.stdout ?? "",
            stderr: params.stderr ?? "",
            outcome: params.timedOut
              ? { type: "timeout" }
              : { type: "exit", exit_code: params.exitCode ?? 0 },
          },
        ],
      },
    ],
  };
}

describe("shell primitives", () => {
  beforeEach(() => {
    vi.resetModules();
    responsesCreateMock.mockReset();
    containersDeleteMock.mockReset();
    delete process.env.SHELL_API_TOKEN;
    delete process.env.LOCAL_API_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("uses deny-all network policy by default and chains previous_response_id", async () => {
    responsesCreateMock
      .mockResolvedValueOnce(
        shellResponse({
          responseId: "resp_shell1",
          sessionId: "container_1",
          stdout: "first",
        }),
      )
      .mockResolvedValueOnce(
        shellResponse({
          responseId: "resp_shell2",
          sessionId: "container_1",
          stdout: "second",
        }),
      );

    const { createShellSession } = await import("../shell.js");
    const session = createShellSession({ apiKey: "test-key" });

    const first = await session.exec({ command: "echo first" });
    expect(first.responseId).toBe("resp_shell1");
    expect(first.sessionId).toBe("container_1");
    expect(session.lastResponseId).toBe("resp_shell1");
    expect(session.sessionId).toBe("container_1");

    const firstRequest = responsesCreateMock.mock.calls[0]?.[0] as {
      tools: Array<{ environment: unknown }>;
      previous_response_id?: string;
    };
    expect(firstRequest.previous_response_id).toBeUndefined();
    expect(firstRequest.tools[0]?.environment).toEqual({
      type: "container_auto",
      network_policy: { type: "disabled" },
    });

    await session.exec({ command: "echo second" });

    const secondRequest = responsesCreateMock.mock.calls[1]?.[0] as {
      tools: Array<{ environment: unknown }>;
      previous_response_id?: string;
    };
    expect(secondRequest.previous_response_id).toBe("resp_shell1");
    expect(secondRequest.tools[0]?.environment).toEqual({
      type: "container_reference",
      container_id: "container_1",
    });

    await session.close();
    expect(containersDeleteMock).toHaveBeenCalledWith("container_1");
  });

  it("maps domain_secrets from policy env refs without leaking plaintext refs", async () => {
    process.env.LOCAL_API_KEY = "gateway-secret";

    const { NETWORK_POLICIES } = await import("../network-policies.js");
    const { createNetworkPolicyFromDefinition } = await import("../shell.js");

    expect(NETWORK_POLICIES.LOCAL_GATEWAY.secrets?.GATEWAY_KEY).toBe("env:LOCAL_API_KEY");

    const policy = createNetworkPolicyFromDefinition(NETWORK_POLICIES.LOCAL_GATEWAY);

    expect(policy).toEqual({
      type: "allowlist",
      allowed_domains: ["api.gallagherpropco.com", "tiles.gallagherpropco.com"],
      domain_secrets: [
        {
          domain: "api.gallagherpropco.com",
          name: "GATEWAY_KEY",
          value: "gateway-secret",
        },
        {
          domain: "tiles.gallagherpropco.com",
          name: "GATEWAY_KEY",
          value: "gateway-secret",
        },
      ],
    });

    if (policy.type !== "allowlist") {
      throw new Error("Expected allowlist policy");
    }
    const domainSecrets = policy.domain_secrets ?? [];
    expect(domainSecrets.every((secret) => secret.value !== "env:LOCAL_API_KEY")).toBe(true);
  });

  it("supports policy-scoped per-domain secret bindings without cross-domain leakage", async () => {
    process.env.LOCAL_API_KEY = "gateway-secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "supabase-secret";

    const { NETWORK_POLICIES } = await import("../network-policies.js");
    const { createNetworkPolicyFromDefinition } = await import("../shell.js");

    const policy = createNetworkPolicyFromDefinition(NETWORK_POLICIES.CRE_DATA_SOURCES);

    expect(policy).toEqual({
      type: "allowlist",
      allowed_domains: ["*.supabase.co", "api.gallagherpropco.com"],
      domain_secrets: [
        {
          domain: "*.supabase.co",
          name: "SUPABASE_KEY",
          value: "supabase-secret",
        },
        {
          domain: "api.gallagherpropco.com",
          name: "GATEWAY_KEY",
          value: "gateway-secret",
        },
      ],
    });
  });

  it("throws when required domain secret env var is missing", async () => {
    const { mapDomainSecretsFromEnvRefs } = await import("../shell.js");

    expect(() =>
      mapDomainSecretsFromEnvRefs(
        [
          {
            domain: "api.example.com",
            name: "api_token",
            env: "MISSING_ENV_TOKEN",
            required: true,
          },
        ],
        { requireAll: true },
      ),
    ).toThrow("Missing required environment variable: MISSING_ENV_TOKEN");
  });

  it("withShell manages lifecycle and exposes writeFile/readFile", async () => {
    responsesCreateMock
      .mockResolvedValueOnce(
        shellResponse({
          responseId: "resp_write1",
          sessionId: "container_2",
          stdout: "",
        }),
      )
      .mockResolvedValueOnce(
        shellResponse({
          responseId: "resp_read1",
          sessionId: "container_2",
          stdout: "artifact-content",
        }),
      );

    const { withShell } = await import("../shell.js");

    const readResult = await withShell(
      {
        apiKey: "test-key",
        preserveSession: false,
      },
      async (shell) => {
        await shell.writeFile("/tmp/example.txt", "artifact-content");
        return shell.readFile("/tmp/example.txt");
      },
    );

    expect(readResult.content).toBe("artifact-content");
    expect(containersDeleteMock).toHaveBeenCalledWith("container_2");
  });

  it("accepts allowlist/secrets/reuse options and resolves domain_secrets from env", async () => {
    process.env.LOCAL_API_KEY = "gateway-secret";

    responsesCreateMock.mockResolvedValueOnce(
      shellResponse({
        responseId: "resp_allowlist1",
        sessionId: "container_3",
        stdout: "ok",
      }),
    );

    const { createShellSession } = await import("../shell.js");

    const session = createShellSession({
      apiKey: "test-key",
      allowlist: ["api.gallagherpropco.com"],
      secrets: { GATEWAY_KEY: "env:LOCAL_API_KEY" },
      reuse: true,
    });

    await session.exec({ command: "echo ok" });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      tools: Array<{ environment: unknown }>;
    };

    expect(request.tools[0]?.environment).toEqual({
      type: "container_auto",
      network_policy: {
        type: "allowlist",
        allowed_domains: ["api.gallagherpropco.com"],
        domain_secrets: [
          {
            domain: "api.gallagherpropco.com",
            name: "GATEWAY_KEY",
            value: "gateway-secret",
          },
        ],
      },
    });

    await session.close();
  });

  it("supports per-domain secret mappings without cross-domain leakage", async () => {
    process.env.LOCAL_API_KEY = "gateway-secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "supabase-secret";

    responsesCreateMock.mockResolvedValueOnce(
      shellResponse({
        responseId: "resp_perdomain1",
        sessionId: "container_4",
        stdout: "ok",
      }),
    );

    const { createShellSession } = await import("../shell.js");

    const session = createShellSession({
      apiKey: "test-key",
      allowedDomains: ["api.gallagherpropco.com", "*.supabase.co"],
      domainSecretEnvRefs: [
        {
          domain: "api.gallagherpropco.com",
          name: "GATEWAY_KEY",
          env: "LOCAL_API_KEY",
        },
        {
          domain: "*.supabase.co",
          name: "SUPABASE_KEY",
          env: "SUPABASE_SERVICE_ROLE_KEY",
        },
      ],
      reuse: true,
    });

    await session.exec({ command: "echo ok" });

    const request = responsesCreateMock.mock.calls[0]?.[0] as {
      tools: Array<{ environment: { network_policy?: { domain_secrets?: Array<{ domain: string; name: string; value: string }> } } }>;
    };
    const domainSecrets = request.tools[0]?.environment.network_policy?.domain_secrets ?? [];

    expect(domainSecrets).toEqual([
      {
        domain: "api.gallagherpropco.com",
        name: "GATEWAY_KEY",
        value: "gateway-secret",
      },
      {
        domain: "*.supabase.co",
        name: "SUPABASE_KEY",
        value: "supabase-secret",
      },
    ]);

    await session.close();
  });
});
