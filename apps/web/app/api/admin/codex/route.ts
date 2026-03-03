import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import {
  CLIENT_INFO,
  parseCodexMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
} from "@/app/admin/codex/_lib/codex-protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INITIALIZE_MESSAGE_ID = "init";
const HANDSHAKE_WAIT_MS = 50;
const UPSTREAM_OPEN_WAIT_MS = 3_000;
const LOG_PREFIX = "[codex-relay]";

interface RelayPayload {
  connectionId: string;
  payload: unknown;
}

interface RelayConnection {
  connectionId: string;
  upstream?: WebSocket;
  controller?: ReadableStreamDefaultController<Uint8Array> | null;
  encoder: TextEncoder;
  initializedAt: number;
}

type AdminAuthState =
  | {
      status: "authorized";
      auth: {
        userId: string;
        orgId: string;
      };
    }
  | {
      status: "unauthenticated";
    }
  | {
      status: "forbidden";
    };

const relayConnections = new Map<string, RelayConnection>();
const encoder = new TextEncoder();

function isAuthBypassedForLocalDev(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";
}

function logRelay(connectionId: string, event: string, detail?: unknown) {
  const debugEnabled =
    process.env.CODEX_RELAY_DEBUG === "true" || process.env.NODE_ENV === "development";

  if (!debugEnabled) {
    return;
  }

  if (detail !== undefined) {
    console.log(`${LOG_PREFIX} [${connectionId}] ${event}`, detail);
    return;
  }
  console.log(`${LOG_PREFIX} [${connectionId}] ${event}`);
}

function summarizeWsPayload(raw: MessageEvent["data"]): string {
  if (typeof raw === "string") {
    return raw.length > 200 ? `${raw.slice(0, 200)}...` : raw;
  }

  if (raw instanceof ArrayBuffer) {
    return `ArrayBuffer(${raw.byteLength})`;
  }

  if (ArrayBuffer.isView(raw)) {
    return `TypedArray(${raw.byteLength})`;
  }

  if (raw instanceof Buffer) {
    return `Buffer(${raw.byteLength})`;
  }

  return Object.prototype.toString.call(raw);
}

async function resolveAdminAuth(): Promise<AdminAuthState> {
  if (isAuthBypassedForLocalDev()) {
    return {
      status: "authorized",
      auth: {
        userId: "local-dev-user",
        orgId: "local-dev-org",
      },
    };
  }

  const auth = await resolveAuth();
  if (!auth) {
    return { status: "unauthenticated" };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: auth.userId,
    },
    select: {
      email: true,
    },
  });

  if (!isEmailAllowed(user?.email ?? null)) {
    return { status: "forbidden" };
  }

  return { status: "authorized", auth };
}

function parsePostBody(raw: unknown): RelayPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    connectionId?: string;
    payload?: unknown;
  };

  if (typeof candidate.connectionId !== "string" || !candidate.connectionId.trim()) {
    return null;
  }

  if (candidate.payload === undefined) {
    return null;
  }

  const parsed = parseCodexMessage(candidate.payload);
  if (!parsed) {
    return null;
  }

  return {
    connectionId: candidate.connectionId,
    payload: parsed,
  };
}

function parseUpstreamText(raw: string | Buffer | ArrayBuffer | null): unknown | null {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (raw instanceof ArrayBuffer) {
    return parseUpstreamText(Buffer.from(raw).toString("utf8"));
  }

  if (raw instanceof Buffer) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      return null;
    }
  }

  return null;
}

function parseWsMessage(raw: MessageEvent["data"]): unknown | null {
  if (typeof raw === "string") {
    return parseUpstreamText(raw);
  }

  if (raw instanceof ArrayBuffer) {
    return parseUpstreamText(raw);
  }

  if (ArrayBuffer.isView(raw)) {
    return parseUpstreamText(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
  }

  if (raw instanceof Buffer) {
    return parseUpstreamText(raw);
  }

  return null;
}

function toSseFrame(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildInitializeNotification(): JsonRpcNotification {
  return {
    jsonrpc: "2.0",
    method: "initialized",
    params: {},
  };
}

function buildInitializeRequest(): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: INITIALIZE_MESSAGE_ID,
    method: "initialize",
    params: {
      clientInfo: CLIENT_INFO,
    },
  };
}

function enqueueConnectionState(
  connection: RelayConnection,
  type: "connected" | "upstream_open" | "upstream_closed" | "upstream_error" | "error",
  message?: string,
) {
  if (!connection.controller) {
    return;
  }

  try {
    connection.controller.enqueue(
      toSseFrame({
        jsonrpc: "2.0",
        method: "connection",
        params: {
          type,
          message,
        },
      }),
    );
  } catch (error) {
    // SSE disconnect races can close the stream while ws callbacks are still firing.
    connection.controller = null;
    logRelay(connection.connectionId, "sse_enqueue_failed", error);
  }
}

function cleanupRelay(
  connectionId: string,
  options?: {
    expectedRelay?: RelayConnection;
    reason?: string;
    closeUpstream?: boolean;
    closeController?: boolean;
  },
) {
  const relay = relayConnections.get(connectionId);
  if (!relay) {
    return;
  }

  if (options?.expectedRelay && relay !== options.expectedRelay) {
    logRelay(connectionId, "cleanup_skipped_stale", options.reason);
    return;
  }

  relayConnections.delete(connectionId);

  if (options?.closeController !== false && relay.controller) {
    try {
      relay.controller.close();
    } catch {
      // no-op
    }
  }
  relay.controller = null;

  const upstream = relay.upstream;
  if (
    options?.closeUpstream !== false &&
    upstream &&
    (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)
  ) {
    try {
      upstream.close(1000, "Relay connection closed");
    } catch (error) {
      logRelay(connectionId, "upstream_close_failed", error);
    }
  }
  relay.upstream = undefined;
  logRelay(connectionId, "cleanup", options?.reason ?? "unknown");
}

function connectUpstream(connectionId: string) {
  const appServerUrl = process.env.CODEX_APP_SERVER_URL?.trim();
  if (!appServerUrl) {
    throw new Error("CODEX_APP_SERVER_URL is not configured");
  }

  const relay = relayConnections.get(connectionId);
  if (!relay) {
    throw new Error("Relay not registered");
  }

  if (relay.upstream && relay.upstream.readyState === WebSocket.OPEN) {
    return;
  }

  const upstream = new globalThis.WebSocket(appServerUrl);
  relay.upstream = upstream;
  logRelay(connectionId, "upstream_connecting", { appServerUrl });

  upstream.addEventListener("open", () => {
    const activeRelay = relayConnections.get(connectionId);
    if (!activeRelay || activeRelay.upstream !== upstream || !activeRelay.controller) {
      logRelay(connectionId, "upstream_open_ignored_stale");
      return;
    }

    activeRelay.initializedAt = Date.now();
    logRelay(connectionId, "upstream_open", { readyState: upstream.readyState });
    enqueueConnectionState(activeRelay, "upstream_open");

    const initializeRequest = buildInitializeRequest();
    try {
      upstream.send(JSON.stringify(initializeRequest));
      logRelay(connectionId, "sent_initialize", initializeRequest);
    } catch (error) {
      logRelay(connectionId, "send_initialize_failed", error);
    }

    setTimeout(() => {
      if (upstream.readyState !== WebSocket.OPEN) {
        logRelay(connectionId, "skip_initialized_notification_not_open", {
          readyState: upstream.readyState,
        });
        return;
      }
      const initializedNotification = buildInitializeNotification();
      try {
        upstream.send(JSON.stringify(initializedNotification));
        logRelay(connectionId, "sent_initialized", initializedNotification);
      } catch (error) {
        logRelay(connectionId, "send_initialized_failed", error);
      }
    }, HANDSHAKE_WAIT_MS);
  });

  upstream.addEventListener("message", (event) => {
    const relayForMessage = relayConnections.get(connectionId);
    if (!relayForMessage || relayForMessage.upstream !== upstream || !relayForMessage.controller) {
      logRelay(connectionId, "upstream_message_ignored_stale");
      return;
    }

    logRelay(connectionId, "upstream_message", summarizeWsPayload(event.data));
    const parsed = parseWsMessage(event.data);
    const payload = parsed ?? (typeof event.data === "string" ? event.data : null);
    if (payload !== null) {
      try {
        relayForMessage.controller.enqueue(toSseFrame(payload));
      } catch (error) {
        relayForMessage.controller = null;
        logRelay(connectionId, "sse_enqueue_message_failed", error);
      }
      if (parsed && typeof parsed === "object" && parsed !== null) {
        const parsedRecord = parsed as Record<string, unknown>;
        if (parsedRecord.id === INITIALIZE_MESSAGE_ID) {
          logRelay(connectionId, "received_initialize_response", parsed);
        }
      }
    }
  });

  upstream.addEventListener("close", (event) => {
    const relayForClose = relayConnections.get(connectionId);
    logRelay(connectionId, "upstream_close", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
    if (!relayForClose || relayForClose.upstream !== upstream) {
      logRelay(connectionId, "upstream_close_ignored_stale");
      return;
    }
    if (relayForClose.controller) {
      enqueueConnectionState(relayForClose, "upstream_closed");
    }
    cleanupRelay(connectionId, {
      expectedRelay: relayForClose,
      reason: "upstream_close",
      closeUpstream: false,
    });
  });

  upstream.addEventListener("error", (event) => {
    const relayForError = relayConnections.get(connectionId);
    logRelay(connectionId, "upstream_error", event);
    if (!relayForError || relayForError.upstream !== upstream) {
      logRelay(connectionId, "upstream_error_ignored_stale");
      return;
    }
    if (relayForError.controller) {
      enqueueConnectionState(relayForError, "upstream_error");
    }
  });
}

function waitForUpstreamOpen(
  connectionId: string,
  relay: RelayConnection,
): Promise<WebSocket | null> {
  const upstream = relay.upstream;
  if (!upstream) {
    return Promise.resolve(null);
  }

  if (upstream.readyState === WebSocket.OPEN) {
    return Promise.resolve(upstream);
  }

  if (upstream.readyState !== WebSocket.CONNECTING) {
    return Promise.resolve(null);
  }

  return new Promise<WebSocket | null>((resolve) => {
    let done = false;

    const finish = (value: WebSocket | null) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timeout);
      upstream.removeEventListener("open", handleOpen);
      upstream.removeEventListener("error", handleError);
      upstream.removeEventListener("close", handleClose);
      resolve(value);
    };

    const handleOpen = () => {
      const activeRelay = relayConnections.get(connectionId);
      if (!activeRelay || activeRelay !== relay || activeRelay.upstream !== upstream) {
        finish(null);
        return;
      }
      finish(upstream);
    };

    const handleError = () => {
      finish(null);
    };

    const handleClose = () => {
      finish(null);
    };

    const timeout = setTimeout(() => {
      logRelay(connectionId, "upstream_open_wait_timeout", {
        readyState: upstream.readyState,
      });
      finish(null);
    }, UPSTREAM_OPEN_WAIT_MS);

    upstream.addEventListener("open", handleOpen, { once: true });
    upstream.addEventListener("error", handleError, { once: true });
    upstream.addEventListener("close", handleClose, { once: true });
  });
}

export async function GET(request: NextRequest) {
  const auth = await resolveAdminAuth();
  if (auth.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.status === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connectionId = request.nextUrl.searchParams.get("connectionId")?.trim();
  if (!connectionId) {
    return NextResponse.json({ error: "Missing connectionId" }, { status: 400 });
  }

  let streamRelay: RelayConnection | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const previous = relayConnections.get(connectionId);
      if (previous?.controller && previous.controller !== controller) {
        cleanupRelay(connectionId, {
          expectedRelay: previous,
          reason: "replace_existing_sse",
        });
      }

      const connection: RelayConnection = {
        connectionId,
        controller,
        encoder,
        initializedAt: Date.now(),
      };
      streamRelay = connection;
      relayConnections.set(connectionId, connection);

      try {
        connectUpstream(connectionId);
        enqueueConnectionState(connection, "connected");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Relay failed";
        enqueueConnectionState(connection, "error", message);
        cleanupRelay(connectionId, {
          expectedRelay: connection,
          reason: "connect_upstream_failed",
        });
      }
    },
    cancel() {
      cleanupRelay(connectionId, {
        expectedRelay: streamRelay ?? undefined,
        reason: "sse_cancel",
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await resolveAdminAuth();
  if (auth.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.status === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: RelayPayload | null;
  try {
    body = parsePostBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const relay = relayConnections.get(body.connectionId);
  if (!relay?.upstream) {
    logRelay(body.connectionId, "post_rejected_upstream_unavailable", {
      hasRelay: Boolean(relay),
      readyState: null,
      payloadMethod:
        typeof body.payload === "object" &&
        body.payload !== null &&
        "method" in body.payload &&
        typeof (body.payload as { method?: unknown }).method === "string"
          ? (body.payload as { method: string }).method
          : null,
    });
    return NextResponse.json({ error: "Relay connection unavailable" }, { status: 409 });
  }

  if (relay.upstream.readyState === WebSocket.CONNECTING) {
    await waitForUpstreamOpen(body.connectionId, relay);
  }

  if (!relay.upstream || relay.upstream.readyState !== WebSocket.OPEN) {
    logRelay(body.connectionId, "post_rejected_upstream_not_open", {
      hasRelay: true,
      readyState: relay.upstream?.readyState ?? null,
      payloadMethod:
        typeof body.payload === "object" &&
        body.payload !== null &&
        "method" in body.payload &&
        typeof (body.payload as { method?: unknown }).method === "string"
          ? (body.payload as { method: string }).method
          : null,
    });
    return NextResponse.json({ error: "Relay connection unavailable" }, { status: 409 });
  }

  try {
    relay.upstream.send(JSON.stringify(body.payload));
    logRelay(body.connectionId, "post_relayed", {
      method:
        typeof body.payload === "object" &&
        body.payload !== null &&
        "method" in body.payload &&
        typeof (body.payload as { method?: unknown }).method === "string"
          ? (body.payload as { method: string }).method
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to relay payload",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }

  return new Response(null, { status: 204 });
}
