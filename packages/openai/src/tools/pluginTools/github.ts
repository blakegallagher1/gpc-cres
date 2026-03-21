import { tool } from "@openai/agents";
import { z } from "zod";
import {
  appendQueryParam,
  buildErrorResponse,
  buildMissingEnvResponse,
  buildSuccessResponse,
  getRequiredEnv,
  githubRequest,
  toBooleanValue,
  toNumberValue,
  toRecord,
  toRecordArray,
  toStringValue,
  type JsonRecord,
} from "./shared.js";

type GithubIssueSummary = {
  id: number | null;
  number: number | null;
  title: string | null;
  state: string | null;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  labels: string[];
  assignees: string[];
};

type GithubCommitSummary = {
  sha: string | null;
  message: string | null;
  authorName: string | null;
  authorDate: string | null;
  url: string | null;
};

function sanitizeGithubIssue(issue: JsonRecord): GithubIssueSummary {
  const labels = toRecordArray(issue.labels).flatMap((label) => {
    const name = toStringValue(label.name);
    return name ? [name] : [];
  });
  const assignees = toRecordArray(issue.assignees).flatMap((assignee) => {
    const login = toStringValue(assignee.login);
    return login ? [login] : [];
  });

  return {
    id: toNumberValue(issue.id),
    number: toNumberValue(issue.number),
    title: toStringValue(issue.title),
    state: toStringValue(issue.state),
    url: toStringValue(issue.html_url),
    createdAt: toStringValue(issue.created_at),
    updatedAt: toStringValue(issue.updated_at),
    labels,
    assignees,
  };
}

function sanitizeGithubCommit(commit: JsonRecord): GithubCommitSummary {
  const commitRecord = toRecord(commit.commit);
  const authorRecord = toRecord(commitRecord?.author);

  return {
    sha: toStringValue(commit.sha),
    message: toStringValue(commitRecord?.message),
    authorName: toStringValue(authorRecord?.name),
    authorDate: toStringValue(authorRecord?.date),
    url: toStringValue(commit.html_url),
  };
}

export const create_issue = tool({
  name: "create_issue",
  description:
    "Create a GitHub issue in the specified repository. Use this for ops incidents, release follow-ups, or infrastructure backlog items.",
  parameters: z.object({
    owner: z.string().describe("GitHub repository owner or organization."),
    repo: z.string().describe("GitHub repository name."),
    title: z.string().describe("Issue title."),
    body: z.string().nullable().describe("Issue body markdown. Pass null to omit."),
    labels: z.array(z.string()).nullable().describe("Optional label names. Pass null to omit."),
    assignees: z.array(z.string()).nullable().describe("Optional assignee logins. Pass null to omit."),
  }),
  execute: async ({ owner, repo, title, body, labels, assignees }) => {
    const token = getRequiredEnv("GITHUB_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("github", "GITHUB_PLUGIN_TOKEN");
    }

    const result = await githubRequest(token, owner, repo, "/issues", {
      method: "POST",
      body: {
        title,
        ...(body ? { body } : {}),
        ...(labels ? { labels } : {}),
        ...(assignees ? { assignees } : {}),
      },
    });

    if (!result.ok) {
      return buildErrorResponse("github", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    return buildSuccessResponse("github", {
      issue: sanitizeGithubIssue(toRecord(result.body) ?? {}),
    });
  },
});

export const list_issues = tool({
  name: "list_issues",
  description:
    "List recent GitHub issues for a repository. Pull requests are excluded from the results.",
  parameters: z.object({
    owner: z.string().describe("GitHub repository owner or organization."),
    repo: z.string().describe("GitHub repository name."),
    state: z.string().nullable().describe("Issue state filter, for example open, closed, or all."),
    labels: z.string().nullable().describe("Comma-separated label filter. Pass null to ignore."),
    per_page: z.number().nullable().describe("Maximum issues to return. Default 20, max 100."),
  }),
  execute: async ({ owner, repo, state, labels, per_page }) => {
    const token = getRequiredEnv("GITHUB_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("github", "GITHUB_PLUGIN_TOKEN");
    }

    const query = new URLSearchParams();
    appendQueryParam(query, "state", state);
    appendQueryParam(query, "labels", labels);
    appendQueryParam(query, "per_page", Math.min(per_page ?? 20, 100));

    const result = await githubRequest(token, owner, repo, "/issues", { query });
    if (!result.ok) {
      return buildErrorResponse("github", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    const issues = toRecordArray(result.body)
      .filter((issue) => !("pull_request" in issue))
      .map(sanitizeGithubIssue);

    return buildSuccessResponse("github", {
      count: issues.length,
      issues,
    });
  },
});

export const get_pr_status = tool({
  name: "get_pr_status",
  description:
    "Fetch GitHub pull request merge status and the combined status check result for the PR head commit.",
  parameters: z.object({
    owner: z.string().describe("GitHub repository owner or organization."),
    repo: z.string().describe("GitHub repository name."),
    pr_number: z.number().describe("Pull request number."),
    include_checks: z.boolean().nullable().describe("Whether to fetch combined status checks. Default true."),
  }),
  execute: async ({ owner, repo, pr_number, include_checks }) => {
    const token = getRequiredEnv("GITHUB_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("github", "GITHUB_PLUGIN_TOKEN");
    }

    const prResult = await githubRequest(token, owner, repo, `/pulls/${pr_number}`);
    if (!prResult.ok) {
      return buildErrorResponse("github", prResult.error, {
        httpStatus: prResult.status,
        details: prResult.details,
      });
    }

    const pullRequest = toRecord(prResult.body) ?? {};
    const head = toRecord(pullRequest.head);
    const base = toRecord(pullRequest.base);
    const headSha = toStringValue(head?.sha);

    let combinedStatus: string | null = null;
    let checks: Array<{
      context: string | null;
      state: string | null;
      description: string | null;
    }> = [];

    if ((include_checks ?? true) && headSha) {
      const statusResult = await githubRequest(
        token,
        owner,
        repo,
        `/commits/${headSha}/status`,
      );

      if (statusResult.ok) {
        const statusBody = toRecord(statusResult.body);
        combinedStatus = toStringValue(statusBody?.state);
        checks = toRecordArray(statusBody?.statuses).map((status) => ({
          context: toStringValue(status.context),
          state: toStringValue(status.state),
          description: toStringValue(status.description),
        }));
      }
    }

    return buildSuccessResponse("github", {
      pullRequest: {
        number: toNumberValue(pullRequest.number),
        title: toStringValue(pullRequest.title),
        state: toStringValue(pullRequest.state),
        draft: toBooleanValue(pullRequest.draft),
        merged: toBooleanValue(pullRequest.merged),
        mergeable: toBooleanValue(pullRequest.mergeable),
        mergeableState: toStringValue(pullRequest.mergeable_state),
        url: toStringValue(pullRequest.html_url),
        headSha,
        headRef: toStringValue(head?.ref),
        baseRef: toStringValue(base?.ref),
        combinedStatus,
        checks,
      },
    });
  },
});

export const list_recent_commits = tool({
  name: "list_recent_commits",
  description:
    "List recent commits for a GitHub repository, optionally constrained to a branch or ref.",
  parameters: z.object({
    owner: z.string().describe("GitHub repository owner or organization."),
    repo: z.string().describe("GitHub repository name."),
    branch: z.string().nullable().describe("Branch or ref to inspect. Pass null for the default branch."),
    per_page: z.number().nullable().describe("Maximum commits to return. Default 20, max 100."),
  }),
  execute: async ({ owner, repo, branch, per_page }) => {
    const token = getRequiredEnv("GITHUB_PLUGIN_TOKEN");
    if (!token) {
      return buildMissingEnvResponse("github", "GITHUB_PLUGIN_TOKEN");
    }

    const query = new URLSearchParams();
    appendQueryParam(query, "sha", branch);
    appendQueryParam(query, "per_page", Math.min(per_page ?? 20, 100));

    const result = await githubRequest(token, owner, repo, "/commits", { query });
    if (!result.ok) {
      return buildErrorResponse("github", result.error, {
        httpStatus: result.status,
        details: result.details,
      });
    }

    const commits = toRecordArray(result.body).map(sanitizeGithubCommit);

    return buildSuccessResponse("github", {
      count: commits.length,
      commits,
    });
  },
});

export const githubPluginTools = [
  create_issue,
  list_issues,
  get_pr_status,
  list_recent_commits,
] as const;
