/**
 * Fastify HTTP server for CUA Worker
 * Implements task management, SSE streaming, and browser automation endpoints
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify from "fastify";
import OpenAI from "openai";
import { z } from "zod";
import { launchBrowserSession } from "./browser-session.js";
import {
  bootstrapFirstPartyLogin,
  buildFirstPartyAuthProfile,
  isFirstPartyUrl,
} from "./first-party-auth.js";
import { runCodeMode, runNativeComputerLoop } from "./responses-loop.js";
import type { TaskEvent, TaskRequest, TaskResult, TaskState } from "./types.js";

// ============================================================================
// Type Definitions
// ============================================================================

type EventSubscriber = (event: TaskEvent) => void;

// ============================================================================
// Zod Schemas
// ============================================================================

const TaskRequestSchema = z.object({
  url: z.string().min(1),
  instructions: z.string().min(1),
  model: z.enum(["gpt-5.4", "gpt-5.4-mini"]),
  mode: z.enum(["native", "code", "auto"]).optional(),
  playbook: z
    .object({
      strategy: z.string().optional(),
      codeSnippet: z.string().optional(),
      selectors: z.record(z.string().or(z.unknown())).optional(),
    })
    .optional(),
  maxTurns: z.number().int().min(1).max(100).optional(),
}) as z.ZodType<TaskRequest>;

// ============================================================================
// Configuration
// ============================================================================

const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? "0.0.0.0",
  apiKey: process.env.API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  browserMode: process.env.BROWSER_MODE ?? "headless",
  defaultModel: process.env.DEFAULT_MODEL ?? "gpt-5.4-mini",
  maxTurns: Number(process.env.MAX_TURNS ?? 24),
  screenshotDir: process.env.SCREENSHOT_DIR ?? "/tmp/cua-screenshots",
  firstPartyAuth: buildFirstPartyAuthProfile(process.env),
};

// ============================================================================
// Global State
// ============================================================================

const tasks = new Map<string, TaskState>();
const subscribers = new Map<string, Set<EventSubscriber>>();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return crypto.randomUUID();
}

/**
 * Get or create subscriber set for a task
 */
function getSubscribers(taskId: string): Set<EventSubscriber> {
  if (!subscribers.has(taskId)) {
    subscribers.set(taskId, new Set());
  }
  return subscribers.get(taskId)!;
}

/**
 * Publish event to all subscribers
 */
function publishEvent(taskId: string, event: TaskEvent): void {
  const subs = getSubscribers(taskId);
  subs.forEach((subscriber) => {
    try {
      subscriber(event);
    } catch (error) {
      console.error("Error calling subscriber:", error);
    }
  });
}

/**
 * Check authorization header
 */
function checkAuth(authHeader: string | undefined): boolean {
  if (!config.apiKey) return true; // No auth configured
  if (!authHeader) return false;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const token = match[1];
  return token === config.apiKey;
}

/**
 * Format event as JSON with newlines for SSE
 */
function formatEventData(event: TaskEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function maybeBootstrapFirstPartySession(options: {
  request: TaskRequest;
  session: Awaited<ReturnType<typeof launchBrowserSession>>;
  taskId: string;
}): Promise<void> {
  const { request, session, taskId } = options;
  if (!isFirstPartyUrl(request.url, config.firstPartyAuth)) {
    return;
  }

  publishEvent(taskId, {
    type: "status",
    turn: 0,
    timestamp: new Date().toISOString(),
    action: "Bootstrapping authenticated first-party session",
  });

  const authResult = await bootstrapFirstPartyLogin({
    profile: config.firstPartyAuth,
    session,
    targetUrl: request.url,
  });

  publishEvent(taskId, {
    type: "status",
    turn: 0,
    timestamp: new Date().toISOString(),
    action: authResult.detail,
  });
}

// ============================================================================
// Task Execution
// ============================================================================

/**
 * Execute a browser task asynchronously
 */
async function executeTask(taskId: string, request: TaskRequest): Promise<void> {
  const task = tasks.get(taskId)!;

  try {
    const controller = new AbortController();
    task.abortController = controller;
    task.signal = controller.signal;

    // Launch browser session
    publishEvent(taskId, {
      type: "status",
      turn: 0,
      timestamp: new Date().toISOString(),
      action: "Launching browser",
    });

    const headless = config.browserMode !== "headed";
    const session = await launchBrowserSession({
      url: request.url,
      screenshotDir: config.screenshotDir,
      headless,
    });

    try {
      await maybeBootstrapFirstPartySession({ request, session, taskId });

      // Initialize OpenAI client
      const client = new OpenAI({
        apiKey: config.openaiApiKey,
      });

      // Determine execution mode
      const mode = request.mode ?? "auto";
      const hasCodeSnippet = Boolean(request.playbook?.codeSnippet);
      const shouldUseCode = mode === "code" || (mode === "auto" && hasCodeSnippet);

      // Execute the appropriate mode
      let result: TaskResult;
      if (shouldUseCode && request.playbook?.codeSnippet) {
        result = await runCodeMode({
          client,
          model: request.model,
          session,
          instructions: request.instructions,
          codeSnippet: request.playbook.codeSnippet,
          onEvent: (event) => {
            publishEvent(taskId, event);
          },
          signal: controller.signal,
        });
      } else {
        result = await runNativeComputerLoop({
          client,
          model: request.model,
          session,
          instructions: request.instructions,
          playbook: request.playbook,
          maxTurns: request.maxTurns ?? config.maxTurns,
          onEvent: (event) => {
            publishEvent(taskId, event);
          },
          signal: controller.signal,
        });
      }

      // Update task with result
      task.status = "completed";
      task.result = result;
      task.completedAt = new Date().toISOString();
    } finally {
      await session.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Task ${taskId} failed:`, errorMsg);

    task.status = "failed";
    task.completedAt = new Date().toISOString();
    task.result = {
      success: false,
      error: errorMsg,
      data: null,
      screenshots: [],
      turns: 0,
      modeUsed: "native",
      cost: { inputTokens: 0, outputTokens: 0 },
      source: {
        url: "(unknown)",
        fetchedAt: new Date().toISOString(),
      },
    };

    publishEvent(taskId, {
      type: "error",
      turn: 0,
      timestamp: new Date().toISOString(),
      data: { error: errorMsg },
    });
  }
}

// ============================================================================
// Server Setup
// ============================================================================

export async function createServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  // CORS headers helper
  const setCorsHeaders = (reply: any): void => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  };

  // OPTIONS handler for CORS preflight
  app.options("/*", async (request: any, reply: any) => {
    setCorsHeaders(reply);
    reply.code(200);
  });

  // ========================================================================
  // GET /health
  // ========================================================================

  app.get("/health", async (request: any, reply: any) => {
    setCorsHeaders(reply);
    return { status: "ok", browser: "ready" };
  });

  // ========================================================================
  // POST /tasks
  // ========================================================================

  app.post<{ Body: unknown }>("/tasks", async (request: any, reply: any) => {
    setCorsHeaders(reply);

    // Check authorization
    const authHeader = request.headers.authorization;
    if (!checkAuth(authHeader)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    // Validate request body
    let parsedRequest: TaskRequest;
    try {
      parsedRequest = TaskRequestSchema.parse(request.body);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: `Invalid request: ${errorMsg}` });
    }

    // Create task
    const taskId = generateTaskId();
    const task: TaskState = {
      id: taskId,
      status: "running",
      request: parsedRequest,
      events: [],
      startedAt: new Date().toISOString(),
    };

    tasks.set(taskId, task);

    // Launch task execution asynchronously (don't await)
    executeTask(taskId, parsedRequest).catch((error) => {
      console.error(`Unhandled error in task ${taskId}:`, error);
    });

    // Return 202 Accepted with task info
    return reply.code(202).send({
      taskId,
      statusUrl: `/tasks/${taskId}`,
      eventStreamUrl: `/tasks/${taskId}/events`,
    });
  });

  // ========================================================================
  // GET /tasks/:id
  // ========================================================================

  app.get<{ Params: { id: string } }>("/tasks/:id", async (request: any, reply: any) => {
    setCorsHeaders(reply);

    const { id } = request.params;
    const task = tasks.get(id);

    if (!task) {
      return reply.code(404).send({ error: "Task not found" });
    }

    return {
      id: task.id,
      status: task.status,
      request: task.request,
      result: task.result,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  });

  // ========================================================================
  // GET /tasks/:id/events (SSE)
  // ========================================================================

  app.get<{ Params: { id: string } }>(
    "/tasks/:id/events",
    async (request: any, reply: any) => {
      setCorsHeaders(reply);

      const { id } = request.params;
      const task = tasks.get(id);

      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }

      // Set up SSE headers
      reply.raw.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });

      // Write existing events
      for (const event of task.events) {
        reply.raw.write(formatEventData(event));
      }

      // Subscribe to new events
      const subscriber = (event: TaskEvent) => {
        reply.raw.write(formatEventData(event));
      };

      const subs = getSubscribers(id);
      subs.add(subscriber);

      // Store events as they arrive
      const originalSub = subscriber;
      const wrappedSub = (event: TaskEvent) => {
        task.events.push(event);
        originalSub(event);
      };

      subs.delete(subscriber);
      subs.add(wrappedSub);

      // Clean up on disconnect
      request.raw.on("close", () => {
        subs.delete(wrappedSub);
        reply.raw.end();
      });

      return reply.hijack();
    }
  );

  // ========================================================================
  // GET /tasks/:id/screenshots/:name
  // ========================================================================

  app.get<{ Params: { id: string; name: string } }>(
    "/tasks/:id/screenshots/:name",
    async (request: any, reply: any) => {
      setCorsHeaders(reply);

      const { id, name } = request.params;
      const task = tasks.get(id);

      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }

      // Validate filename to prevent directory traversal
      if (
        name.includes("..") ||
        name.includes("/") ||
        name.includes("\\") ||
        !name.endsWith(".png")
      ) {
        return reply.code(400).send({ error: "Invalid screenshot name" });
      }

      try {
        const filePath = resolve(config.screenshotDir, name);
        const screenshot = readFileSync(filePath);
        reply.header("Content-Type", "image/png");
        return reply.send(screenshot);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return reply
          .code(404)
          .send({ error: `Screenshot not found: ${errorMsg}` });
      }
    }
  );

  // ========================================================================
  // POST /tasks/:id/stop
  // ========================================================================

  app.post<{ Params: { id: string } }>(
    "/tasks/:id/stop",
    async (request: any, reply: any) => {
      setCorsHeaders(reply);

      // Check authorization
      const authHeader = request.headers.authorization;
      if (!checkAuth(authHeader)) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const { id } = request.params;
      const task = tasks.get(id);

      if (!task) {
        return reply.code(404).send({ error: "Task not found" });
      }

      if (task.status !== "running") {
        return reply.code(400).send({ error: "Task is not running" });
      }

      // Signal abort to running task
      if (task.abortController) {
        task.abortController.abort();
      }

      task.status = "cancelled";
      task.completedAt = new Date().toISOString();

      publishEvent(id, {
        type: "status",
        turn: 0,
        timestamp: new Date().toISOString(),
        action: "Task cancelled",
      });

      return { status: "cancelled" };
    }
  );

  return app;
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  try {
    const app = await createServer();

    const address = await app.listen({
      port: config.port,
      host: config.host,
    });

    console.log(`CUA Worker listening at ${address}`);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

if (process.env.CUA_WORKER_DISABLE_AUTOSTART !== "true") {
  void main();
}
