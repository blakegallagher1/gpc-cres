import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import { GET, POST } from "./route";

const TEST_SESSION = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "blake@gallagherpropco.com",
    orgId: "22222222-2222-4222-8222-222222222222",
  },
  expires: new Date(Date.now() + 86_400_000).toISOString(),
};

class MockWebSocket extends EventTarget {
  static instances: MockWebSocket[] = [];

  static readonly CONNECTING = 0;

  static readonly OPEN = 1;

  static readonly CLOSING = 2;

  static readonly CLOSED = 3;

  readonly sent: string[] = [];

  readyState = MockWebSocket.CONNECTING;

  constructor(public readonly url: string) {
    super();
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  emitMessage(data: unknown) {
    const event = Object.assign(new Event("message"), { data });
    this.dispatchEvent(event);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    const event = Object.assign(new Event("close"), {
      code,
      reason,
      wasClean: true,
    });
    this.dispatchEvent(event);
  }

  static reset() {
    this.instances = [];
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalEnv = { ...process.env };

function setDefaultAuthMocks() {
  authMock.mockResolvedValue(TEST_SESSION);
}

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/codex", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("/api/admin/codex relay route", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.clearAllMocks();
    vi.useRealTimers();

    process.env.CODEX_APP_SERVER_URL = "ws://127.0.0.1:8765";
    process.env.NEXT_PUBLIC_DISABLE_AUTH = "false";
    delete process.env.CODEX_RELAY_DEBUG;

    setDefaultAuthMocks();

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });

    vi.useRealTimers();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=unauth");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when authenticated user is not admin", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "33333333-3333-4333-8333-333333333333",
        email: "viewer@example.com",
        orgId: "44444444-4444-4444-8444-444444444444",
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=forbidden");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });

  it("returns 400 for invalid POST payload", async () => {
    const req = makePostRequest({
      payload: {
        jsonrpc: "2.0",
        method: "thread/list",
        params: {
          includeArchived: false,
        },
      },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid payload" });
  });

  it("sends initialize handshake and initialized notification when upstream opens", async () => {
    vi.useFakeTimers();

    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=handshake");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(MockWebSocket.instances).toHaveLength(1);

    const ws = MockWebSocket.instances[0];
    ws.open();

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toMatchObject({
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: {
        clientInfo: {
          name: "magnolia_admin",
          title: "Magnolia Admin",
          version: "1.0.0",
        },
      },
    });

    await vi.advanceTimersByTimeAsync(60);

    expect(ws.sent).toHaveLength(2);
    expect(JSON.parse(ws.sent[1])).toMatchObject({
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    });
  });

  it("waits for upstream open before relaying POST payload", async () => {
    const connectionId = "post-wait";
    const streamReq = new NextRequest(`http://localhost/api/admin/codex?connectionId=${connectionId}`);
    const streamRes = await GET(streamReq);

    expect(streamRes.status).toBe(200);
    expect(MockWebSocket.instances).toHaveLength(1);

    const ws = MockWebSocket.instances[0];

    const postPromise = POST(
      makePostRequest({
        connectionId,
        payload: {
          jsonrpc: "2.0",
          id: 123,
          method: "thread/list",
          params: {
            includeArchived: false,
          },
        },
      }),
    );

    await Promise.resolve();
    ws.open();

    const postRes = await postPromise;

    expect(postRes.status).toBe(204);

    const parsedMethods = ws.sent.map((raw) => {
      const parsed = JSON.parse(raw) as { method?: string };
      return parsed.method ?? null;
    });

    expect(parsedMethods).toContain("thread/list");
  });

  it("allows default allowlisted login email", async () => {
    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=allowlisted-email");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("returns 401 when session has no user", async () => {
    authMock.mockResolvedValue({ expires: new Date().toISOString() });

    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=no-user");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when session user has no orgId", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "blake@gallagherpropco.com",
      },
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=no-orgid");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  // ---- SSE stream event helpers ----

  function parseSseEvents(text: string): Record<string, unknown>[] {
    return text
      .split("\n\n")
      .filter((chunk) => chunk.trim().length > 0)
      .map((chunk) => {
        const dataLine = chunk.replace(/^data: /, "");
        return JSON.parse(dataLine) as Record<string, unknown>;
      });
  }

  it("emits error state when CODEX_APP_SERVER_URL is not set", async () => {
    delete process.env.CODEX_APP_SERVER_URL;

    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=missing-env");
    const res = await GET(req);

    expect(res.status).toBe(200);

    const text = await res.text();
    const events = parseSseEvents(text);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      jsonrpc: "2.0",
      method: "connection",
      params: {
        type: "error",
      },
    });
    expect((events[0].params as Record<string, unknown>).message).toContain(
      "CODEX_APP_SERVER_URL",
    );
  });

  it("includes close code and reason in upstream_closed state event", async () => {
    vi.useFakeTimers();

    const req = new NextRequest("http://localhost/api/admin/codex?connectionId=close-detail");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(MockWebSocket.instances).toHaveLength(1);

    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.close(1006, "connection lost");

    // Advance past TEARDOWN_GRACE_MS (200ms) and HANDSHAKE_WAIT_MS (50ms)
    await vi.advanceTimersByTimeAsync(250);

    const text = await res.text();
    const events = parseSseEvents(text);

    const closedEvent = events.find(
      (e) =>
        e.method === "connection" &&
        (e.params as Record<string, unknown>)?.type === "upstream_closed",
    );

    expect(closedEvent).toBeDefined();
    const message = (closedEvent!.params as Record<string, unknown>).message as string;
    expect(message).toContain("1006");
    expect(message).toContain("connection lost");
  });

  it("returns 409 when POST times out waiting for upstream open", async () => {
    vi.useFakeTimers();

    const connectionId = "post-timeout";
    const streamReq = new NextRequest(
      `http://localhost/api/admin/codex?connectionId=${connectionId}`,
    );
    await GET(streamReq);

    expect(MockWebSocket.instances).toHaveLength(1);

    // Don't open the WebSocket — leave it in CONNECTING state
    const postPromise = POST(
      makePostRequest({
        connectionId,
        payload: {
          jsonrpc: "2.0",
          id: 456,
          method: "thread/list",
          params: { includeArchived: false },
        },
      }),
    );

    // Advance past UPSTREAM_OPEN_WAIT_MS (3_000ms)
    await vi.advanceTimersByTimeAsync(3_100);

    const postRes = await postPromise;
    expect(postRes.status).toBe(409);

    const body = await postRes.json();
    expect(body.error).toBe("Relay connection unavailable");
  });
});
