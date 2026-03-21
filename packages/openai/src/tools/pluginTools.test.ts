import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

import {
  check_tunnel_health,
  create_issue,
  list_env_vars,
  lookup_flood_risk,
  purge_cache,
} from "./pluginTools";
import { ALL_AGENT_TOOLS } from "./index";

describe("plugin tools", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.GITHUB_PLUGIN_TOKEN;
    delete process.env.VERCEL_PLUGIN_TOKEN;
    delete process.env.CLOUDFLARE_PLUGIN_TOKEN;
    delete process.env.NEPTUNE_FLOOD_API_KEY;
    delete process.env.NEPTUNE_FLOOD_BASE_URL;
  });

  it("returns a graceful error when the GitHub plugin token is missing", async () => {
    const response = await (
      create_issue as unknown as {
        execute: (input: {
          owner: string;
          repo: string;
          title: string;
          body: string | null;
          labels: string[] | null;
          assignees: string[] | null;
        }) => Promise<string>;
      }
    ).execute({
      owner: "gallagherpropco",
      repo: "entitlement-os",
      title: "Follow up",
      body: null,
      labels: null,
      assignees: null,
    });

    expect(JSON.parse(response)).toMatchObject({
      status: "error",
      provider: "github",
      error: "GITHUB_PLUGIN_TOKEN is not set",
    });
  });

  it("creates a GitHub issue when configured", async () => {
    process.env.GITHUB_PLUGIN_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: 1,
            number: 42,
            title: "Follow up",
            state: "open",
            html_url: "https://github.com/gallagherpropco/entitlement-os/issues/42",
            created_at: "2026-03-20T00:00:00.000Z",
            updated_at: "2026-03-20T00:00:00.000Z",
            labels: [{ name: "ops" }],
            assignees: [{ login: "blake" }],
          }),
      })) as unknown as typeof fetch,
    );

    const response = await (
      create_issue as unknown as {
        execute: (input: {
          owner: string;
          repo: string;
          title: string;
          body: string | null;
          labels: string[] | null;
          assignees: string[] | null;
        }) => Promise<string>;
      }
    ).execute({
      owner: "gallagherpropco",
      repo: "entitlement-os",
      title: "Follow up",
      body: "body",
      labels: ["ops"],
      assignees: ["blake"],
    });

    expect(JSON.parse(response)).toMatchObject({
      status: "ok",
      provider: "github",
      issue: {
        number: 42,
        labels: ["ops"],
        assignees: ["blake"],
      },
    });
  });

  it("redacts Vercel env values in the tool response", async () => {
    process.env.VERCEL_PLUGIN_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            envs: [
              {
                id: "env_123",
                key: "OPENAI_API_KEY",
                target: "production",
                type: "encrypted",
                gitBranch: null,
                createdAt: 1,
                updatedAt: 2,
                value: "sk-secret-value",
              },
            ],
          }),
      })) as unknown as typeof fetch,
    );

    const response = await (
      list_env_vars as unknown as {
        execute: (input: {
          project_id_or_name: string;
          team_id: string | null;
          team_slug: string | null;
          target: string | null;
          git_branch: string | null;
        }) => Promise<string>;
      }
    ).execute({
      project_id_or_name: "entitlement-os",
      team_id: null,
      team_slug: null,
      target: null,
      git_branch: null,
    });

    expect(JSON.parse(response)).toMatchObject({
      status: "ok",
      provider: "vercel",
      envs: [
        {
          key: "OPENAI_API_KEY",
          valuePreview: expect.stringMatching(/\*+alue$/),
        },
      ],
    });
  });

  it("validates Cloudflare purge targets before making a request", async () => {
    process.env.CLOUDFLARE_PLUGIN_TOKEN = "token";

    const response = await (
      purge_cache as unknown as {
        execute: (input: {
          zone_id: string;
          purge_everything: boolean | null;
          files: string[] | null;
          tags: string[] | null;
          hosts: string[] | null;
          prefixes: string[] | null;
        }) => Promise<string>;
      }
    ).execute({
      zone_id: "zone_123",
      purge_everything: null,
      files: null,
      tags: null,
      hosts: null,
      prefixes: null,
    });

    expect(JSON.parse(response)).toMatchObject({
      status: "error",
      provider: "cloudflare",
      error: "At least one cache purge target must be provided",
    });
  });

  it("returns a graceful Neptune configuration error when the custom base URL is absent", async () => {
    process.env.NEPTUNE_FLOOD_API_KEY = "token";

    const response = await (
      lookup_flood_risk as unknown as {
        execute: (input: {
          address_line_1: string;
          address_line_2: string | null;
          city: string;
          state: string;
          postal_code: string;
        }) => Promise<string>;
      }
    ).execute({
      address_line_1: "2774 Highland Rd",
      address_line_2: null,
      city: "Baton Rouge",
      state: "LA",
      postal_code: "70802",
    });

    expect(JSON.parse(response)).toMatchObject({
      status: "error",
      provider: "neptune-flood",
      error: "NEPTUNE_FLOOD_BASE_URL is not set",
    });
  });

  it("registers the plugin tools in the executable tool list", () => {
    const toolNames = ALL_AGENT_TOOLS.flatMap((tool) => {
      if (!tool || typeof tool !== "object") {
        return [];
      }

      const name = "name" in tool && typeof tool.name === "string" ? tool.name : null;
      return name ? [name] : [];
    });

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "create_issue",
        "get_pr_status",
        "get_deployment_status",
        "check_tunnel_health",
        "get_flood_insurance_quote",
      ]),
    );
  });

  it("parses Cloudflare tunnel health responses", async () => {
    process.env.CLOUDFLARE_PLUGIN_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            result: {
              id: "tunnel_123",
              name: "prod",
              status: "healthy",
              connections: [{ colo_name: "DFW" }],
            },
          }),
      })) as unknown as typeof fetch,
    );

    const response = await (
      check_tunnel_health as unknown as {
        execute: (input: { account_id: string; tunnel_id: string }) => Promise<string>;
      }
    ).execute({
      account_id: "acct_123",
      tunnel_id: "tunnel_123",
    });

    expect(JSON.parse(response)).toMatchObject({
      status: "ok",
      provider: "cloudflare",
      tunnel: {
        id: "tunnel_123",
        status: "healthy",
        connections: 1,
        isHealthy: true,
      },
    });
  });
});
