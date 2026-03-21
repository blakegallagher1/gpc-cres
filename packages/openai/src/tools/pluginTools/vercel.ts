import { tool } from "@openai/agents";
import { z } from "zod";
import {
  appendQueryParam,
  buildErrorResponse,
  buildMissingEnvResponse,
  buildSuccessResponse,
  getRequiredEnv,
  toNumberValue,
  toRecord,
  toRecordArray,
  toStringValue,
  vercelRequest,
  type JsonRecord,
} from "./shared.js";

type VercelDeploymentSummary = {
  id: string | null;
  name: string | null;
  url: string | null;
  projectId: string | null;
  readyState: string | null;
  target: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

type VercelEnvSummary = {
  id: string | null;
  key: string | null;
  target: string | null;
  type: string | null;
  gitBranch: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  valuePreview: string | null;
};

function sanitizeVercelDeployment(
  deployment: JsonRecord,
): VercelDeploymentSummary {
  return {
    id: toStringValue(deployment.uid) ?? toStringValue(deployment.id),
    name: toStringValue(deployment.name),
    url: toStringValue(deployment.url),
    projectId: toStringValue(deployment.projectId),
    readyState: toStringValue(deployment.readyState),
    target: toStringValue(deployment.target),
    createdAt: toNumberValue(deployment.created),
    updatedAt: toNumberValue(deployment.updatedAt),
  };
}

function maskValue(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  return `${"*".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
}

function sanitizeVercelEnv(env: JsonRecord): VercelEnvSummary {
  return {
    id: toStringValue(env.id),
    key: toStringValue(env.key),
    target: toStringValue(env.target),
    type: toStringValue(env.type),
    gitBranch: toStringValue(env.gitBranch),
    createdAt: toNumberValue(env.createdAt),
    updatedAt: toNumberValue(env.updatedAt),
    valuePreview: maskValue(toStringValue(env.value)),
  };
}

function getProjectQueryValue(projectIdOrName: string): {
  key: "name" | "projectId";
  value: string;
} {
  return projectIdOrName.startsWith("prj_")
    ? { key: "projectId", value: projectIdOrName }
    : { key: "name", value: projectIdOrName };
}

function getPaginationCursor(
  pagination: JsonRecord | null,
  key: "next" | "prev",
): number | null {
  return toNumberValue(pagination?.[key]);
}

export const get_deployment_status = tool({
  name: "get_deployment_status",
  description:
    "Fetch Vercel deployment readiness and metadata by deployment ID or deployment URL.",
  parameters: z.object({
    deployment_id_or_url: z.string().describe("Deployment ID or deployment URL."),
    team_id: z.string().nullable().describe("Optional Vercel team ID."),
    team_slug: z.string().nullable().describe("Optional Vercel team slug."),
  }),
  execute: async ({ deployment_id_or_url, team_id, team_slug }) => {
    const token = getRequiredEnv("VERCEL_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("vercel", "VERCEL_PLUGIN_TOKEN");
    }

    const query = new URLSearchParams();
    appendQueryParam(query, "teamId", team_id);
    appendQueryParam(query, "slug", team_slug);

    const result = await vercelRequest(
      token,
      `/v13/deployments/${deployment_id_or_url}`,
      query,
    );
    if (!result.ok) {
      return buildErrorResponse("vercel", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    return buildSuccessResponse("vercel", {
      deployment: sanitizeVercelDeployment(toRecord(result.body) ?? {}),
    });
  },
});

export const list_deployments = tool({
  name: "list_deployments",
  description:
    "List recent Vercel deployments for a project, optionally filtered by team or target environment.",
  parameters: z.object({
    project_id_or_name: z.string().nullable().describe("Project ID or project name. Pass null to list across accessible projects."),
    team_id: z.string().nullable().describe("Optional Vercel team ID."),
    team_slug: z.string().nullable().describe("Optional Vercel team slug."),
    target: z.string().nullable().describe("Optional target environment, for example production or preview."),
    limit: z.number().nullable().describe("Maximum deployments to return. Default 20, max 100."),
  }),
  execute: async ({ project_id_or_name, team_id, team_slug, target, limit }) => {
    const token = getRequiredEnv("VERCEL_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("vercel", "VERCEL_PLUGIN_TOKEN");
    }

    const query = new URLSearchParams();
    if (project_id_or_name) {
      const projectQuery = getProjectQueryValue(project_id_or_name);
      appendQueryParam(query, projectQuery.key, projectQuery.value);
    }
    appendQueryParam(query, "teamId", team_id);
    appendQueryParam(query, "slug", team_slug);
    appendQueryParam(query, "target", target);
    appendQueryParam(query, "limit", Math.min(limit ?? 20, 100));

    const result = await vercelRequest(token, "/v6/deployments", query);
    if (!result.ok) {
      return buildErrorResponse("vercel", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    const payload = toRecord(result.body) ?? {};
    const deployments = toRecordArray(payload.deployments).map(sanitizeVercelDeployment);
    const pagination = toRecord(payload.pagination);

    return buildSuccessResponse("vercel", {
      count: deployments.length,
      deployments,
      pagination: {
        next: getPaginationCursor(pagination, "next"),
        prev: getPaginationCursor(pagination, "prev"),
      },
    });
  },
});

export const get_build_logs = tool({
  name: "get_build_logs",
  description:
    "Fetch recent Vercel deployment build events for a deployment ID or deployment URL.",
  parameters: z.object({
    deployment_id_or_url: z.string().describe("Deployment ID or deployment URL."),
    build_id: z.string().nullable().describe("Optional Vercel build ID. Pass null to retrieve all build events."),
    team_id: z.string().nullable().describe("Optional Vercel team ID."),
    team_slug: z.string().nullable().describe("Optional Vercel team slug."),
    limit: z.number().nullable().describe("Maximum events to return. Default 50, max 200."),
  }),
  execute: async ({ deployment_id_or_url, build_id, team_id, team_slug, limit }) => {
    const token = getRequiredEnv("VERCEL_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("vercel", "VERCEL_PLUGIN_TOKEN");
    }

    const query = new URLSearchParams();
    appendQueryParam(query, "name", build_id);
    appendQueryParam(query, "teamId", team_id);
    appendQueryParam(query, "slug", team_slug);
    appendQueryParam(query, "limit", Math.min(limit ?? 50, 200));
    appendQueryParam(query, "direction", "backward");
    appendQueryParam(query, "builds", 1);

    const result = await vercelRequest(
      token,
      `/v3/deployments/${deployment_id_or_url}/events`,
      query,
    );
    if (!result.ok) {
      return buildErrorResponse("vercel", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    const events = Array.isArray(result.body)
      ? result.body.map((event) => {
        const record = toRecord(event) ?? {};
        const payload = toRecord(record.payload);
        return {
          type: toStringValue(record.type),
          created: toNumberValue(record.created),
          text: toStringValue(payload?.text),
          readyState: toStringValue(toRecord(payload?.info)?.readyState),
        };
      })
      : [];

    return buildSuccessResponse("vercel", {
      count: events.length,
      events,
    });
  },
});

export const list_env_vars = tool({
  name: "list_env_vars",
  description:
    "List Vercel project environment variables. Values are redacted to avoid exposing secrets in agent context.",
  parameters: z.object({
    project_id_or_name: z.string().describe("Vercel project ID or project name."),
    team_id: z.string().nullable().describe("Optional Vercel team ID."),
    team_slug: z.string().nullable().describe("Optional Vercel team slug."),
    target: z.string().nullable().describe("Optional environment target filter, for example production or preview."),
    git_branch: z.string().nullable().describe("Optional git branch filter."),
  }),
  execute: async ({ project_id_or_name, team_id, team_slug, target, git_branch }) => {
    const token = getRequiredEnv("VERCEL_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("vercel", "VERCEL_PLUGIN_TOKEN");
    }

    const query = new URLSearchParams();
    appendQueryParam(query, "teamId", team_id);
    appendQueryParam(query, "slug", team_slug);
    appendQueryParam(query, "target", target);
    appendQueryParam(query, "gitBranch", git_branch);

    const result = await vercelRequest(
      token,
      `/v9/projects/${project_id_or_name}/env`,
      query,
    );
    if (!result.ok) {
      return buildErrorResponse("vercel", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    const payload = toRecord(result.body) ?? {};
    const envs = toRecordArray(payload.envs ?? payload.variables).map(sanitizeVercelEnv);

    return buildSuccessResponse("vercel", {
      count: envs.length,
      envs,
    });
  },
});

export const vercelPluginTools = [
  get_deployment_status,
  list_deployments,
  get_build_logs,
  list_env_vars,
] as const;
