/**
 * Core types for the CUA worker
 */

import type { Browser, BrowserContext, Page } from "playwright";

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  captureScreenshot: (label: string) => Promise<{
    path: string;
    capturedAt: string;
    url: string;
  }>;
  readState: () => Promise<{ currentUrl: string; pageTitle: string }>;
  close: () => Promise<void>;
};

export type TaskRequest = {
  url: string;
  instructions: string;
  model: "gpt-5.4" | "gpt-5.4-mini";
  mode?: "native" | "code" | "auto";
  playbook?: {
    strategy?: string;
    codeSnippet?: string;
    selectors?: Record<string, string>;
  };
  maxTurns?: number;
};

export type TaskResult = {
  success: boolean;
  data: unknown;
  error?: string;
  screenshots: string[];
  turns: number;
  modeUsed: "native" | "code";
  cost: {
    inputTokens: number;
    outputTokens: number;
  };
  source: {
    url: string;
    fetchedAt: string;
  };
  finalMessage?: string;
};

export type TaskEvent = {
  type: "screenshot" | "action" | "status" | "error" | "complete";
  turn: number;
  timestamp: string;
  screenshotUrl?: string;
  action?: string;
  data?: unknown;
};

export type TaskState = {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  request: TaskRequest;
  events: TaskEvent[];
  result?: TaskResult;
  startedAt: string;
  completedAt?: string;
  abortController?: AbortController;
  signal?: AbortSignal;
};

/**
 * Internal types for Responses API
 */

export type ComputerAction = {
  [key: string]: unknown;
  type: string;
};

export type ComputerCallItem = {
  actions?: ComputerAction[];
  call_id?: string;
  pending_safety_checks?: SafetyCheck[];
  type: "computer_call";
};

export type FunctionCallItem = {
  arguments?: string;
  call_id?: string;
  name?: string;
  type: "function_call";
};

export type MessageItem = {
  content?: Array<{
    text?: string;
    type?: string;
  }>;
  role?: string;
  type: "message";
};

export type ResponseOutputItem =
  | ComputerCallItem
  | FunctionCallItem
  | MessageItem
  | { [key: string]: unknown; type: string };

export type ResponsesApiResponse = {
  error?: { message?: string } | null;
  id: string;
  output?: ResponseOutputItem[];
  status?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
    total_tokens?: number;
  } | null;
};

export type SafetyCheck = {
  code?: string;
  message?: string;
};

export type ToolOutput =
  | {
      text: string;
      type: "input_text";
    }
  | {
      detail: "original";
      image_url: string;
      type: "input_image";
    };
