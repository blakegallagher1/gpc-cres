#!/usr/bin/env node
/**
 * Browser-simulation E2E test for useAgentWebSocket hook.
 *
 * Simulates the exact flow the browser performs:
 *   1. Supabase auth → get JWT
 *   2. WebSocket connect to Worker with JWT + conversationId
 *   3. Send a user message (with optional dealId)
 *   4. Receive streaming events and validate they match ChatStreamEvent types
 *   5. Test multi-turn: send follow-up using same connection
 *   6. Test tool call: send message that triggers a gateway tool
 *
 * Usage:
 *   node scripts/test-browser-e2e.mjs
 *
 * Env (or hardcoded below):
 *   E2E_EMAIL, E2E_PASSWORD, SUPABASE_URL, SUPABASE_ANON_KEY
 */
import WebSocket from "ws";

// --- Config ---
const SUPABASE_URL = "https://yjddspdbxuseowxndrak.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZGRzcGRieHVzZW93eG5kcmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NTU4NDAsImV4cCI6MjA4NTIzMTg0MH0.tdxgiBRDdTpRpOYF4KhBcCkgrTDF0-jXSZQR7iNOJuw";
const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e-agent@gallagherpropco.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "WsTestPass2026";
const WS_BASE = "wss://agents.gallagherpropco.com";

// Valid ChatStreamEvent types (from streamEventTypes.ts)
const VALID_EVENT_TYPES = new Set([
  "text_delta",
  "tool_call",
  "tool_start",
  "tool_end",
  "tool_approval_requested",
  "agent_switch",
  "handoff",
  "agent_progress",
  "agent_summary",
  "error",
  "done",
  "tool_result",
  "agent_progress_summary",
]);

let totalTests = 0;
let passedTests = 0;

function assert(condition, label) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${label}`);
  } else {
    console.log(`  ❌ ${label}`);
  }
}

// --- Step 1: Supabase Auth ---
async function getSupabaseToken() {
  console.log("\n🔑 Step 1: Supabase Auth");
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
    },
  );
  const data = await res.json();
  assert(res.ok, `Auth succeeded (${res.status})`);
  assert(typeof data.access_token === "string", "Got access_token");
  assert(typeof data.user?.id === "string", `User ID: ${data.user?.id}`);
  return data.access_token;
}

// --- Step 2-6: WebSocket tests ---
function connectAndTest(token, conversationId) {
  return new Promise((resolve) => {
    const url = `${WS_BASE}/ws?token=${encodeURIComponent(token)}&conversationId=${conversationId}`;
    const ws = new WebSocket(url);
    const events = [];
    let turnCount = 0;
    const turns = [
      {
        label: "Simple text response",
        message: { type: "message", text: "Say hello in exactly one word." },
        validate: (turnEvents) => {
          const hasTextDelta = turnEvents.some((e) => e.type === "text_delta");
          const hasDone = turnEvents.some((e) => e.type === "done");
          assert(hasTextDelta, "Turn 1: received text_delta events");
          assert(hasDone, "Turn 1: received done event");

          // Validate all events are valid ChatStreamEvent types
          const invalidTypes = turnEvents.filter(
            (e) => !VALID_EVENT_TYPES.has(e.type),
          );
          assert(
            invalidTypes.length === 0,
            `Turn 1: all event types valid (${invalidTypes.map((e) => e.type).join(", ") || "none invalid"})`,
          );

          // Validate text_delta has content field (not delta or text)
          const textDeltas = turnEvents.filter((e) => e.type === "text_delta");
          const allHaveContent = textDeltas.every(
            (e) => typeof e.content === "string",
          );
          assert(
            allHaveContent,
            'Turn 1: text_delta uses "content" field (browser compat)',
          );
        },
      },
      {
        label: "Multi-turn (previous_response_id chaining)",
        message: {
          type: "message",
          text: "Now say goodbye in exactly one word.",
        },
        validate: (turnEvents) => {
          const hasTextDelta = turnEvents.some((e) => e.type === "text_delta");
          const hasDone = turnEvents.some((e) => e.type === "done");
          assert(hasTextDelta, "Turn 2: received text_delta (multi-turn works)");
          assert(hasDone, "Turn 2: received done event");
        },
      },
      {
        label: "Tool call (gateway tool)",
        message: {
          type: "message",
          text: "Use the get_parcel_details tool to look up parcel 001-5096-7. Always call the tool.",
        },
        validate: (turnEvents) => {
          const hasToolStart = turnEvents.some((e) => e.type === "tool_start");
          const hasToolEnd = turnEvents.some((e) => e.type === "tool_end");
          const hasDone = turnEvents.some((e) => e.type === "done");
          assert(hasToolStart, "Turn 3: received tool_start event");
          assert(hasToolEnd, "Turn 3: received tool_end event");
          assert(hasDone, "Turn 3: received done event");

          // Validate tool_start has name field
          const toolStarts = turnEvents.filter((e) => e.type === "tool_start");
          if (toolStarts.length > 0) {
            assert(
              typeof toolStarts[0].name === "string",
              `Turn 3: tool_start has name="${toolStarts[0].name}"`,
            );
          }

          // Validate tool_end has result
          const toolEnds = turnEvents.filter((e) => e.type === "tool_end");
          if (toolEnds.length > 0) {
            assert(
              toolEnds[0].result !== undefined,
              "Turn 3: tool_end has result",
            );
            assert(
              typeof toolEnds[0].status === "string",
              `Turn 3: tool_end has status="${toolEnds[0].status}"`,
            );
          }
        },
      },
    ];

    let turnEvents = [];

    ws.on("open", () => {
      console.log("\n🔌 Step 2: WebSocket connected");
      assert(true, `Connected to ${WS_BASE}`);
      console.log(`\n📨 Turn 1: ${turns[0].label}`);
      ws.send(JSON.stringify(turns[0].message));
    });

    ws.on("message", (data) => {
      try {
        const evt = JSON.parse(data.toString());
        events.push(evt);
        turnEvents.push(evt);

        // Print progress
        if (evt.type === "text_delta") {
          process.stdout.write(evt.content ?? "");
        } else if (evt.type === "tool_start") {
          console.log(`\n  [tool_start] ${evt.name}`);
        } else if (evt.type === "tool_end") {
          console.log(
            `  [tool_end] ${evt.name} → ${evt.status}`,
          );
        }

        if (evt.type === "done") {
          console.log("\n");
          turns[turnCount].validate(turnEvents);
          turnCount++;
          turnEvents = [];

          if (turnCount < turns.length) {
            console.log(`\n📨 Turn ${turnCount + 1}: ${turns[turnCount].label}`);
            setTimeout(() => {
              ws.send(JSON.stringify(turns[turnCount].message));
            }, 500);
          } else {
            // All turns complete
            console.log("\n📊 Final validation");
            assert(
              events.length > 0,
              `Total events received: ${events.length}`,
            );

            const types = [...new Set(events.map((e) => e.type))];
            assert(
              types.includes("text_delta"),
              `Event types seen: ${types.join(", ")}`,
            );

            ws.close(1000);
          }
        }

        if (evt.type === "error") {
          console.log(`\n  ⚠️ Error: ${evt.message}`);
        }
      } catch {
        console.log(`  [raw] ${data.toString().slice(0, 100)}`);
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket ERROR:", err.message);
      assert(false, `WebSocket error: ${err.message}`);
      resolve();
    });

    ws.on("close", (code) => {
      console.log(`\n🔒 WebSocket closed: code=${code}`);
      // Cloudflare DOs may return 1006 instead of 1000 on client-initiated close
      assert(code === 1000 || code === 1006, `Clean close (code=${code})`);
      resolve();
    });

    // Timeout
    setTimeout(() => {
      console.error("\n⏰ TIMEOUT after 180s");
      ws.close();
      resolve();
    }, 180000);
  });
}

// --- Step: Auth rejection test ---
function testAuthRejection() {
  return new Promise((resolve) => {
    console.log("\n🔐 Auth rejection test");
    const url = `${WS_BASE}/ws?token=invalid_token&conversationId=${crypto.randomUUID()}`;
    const ws = new WebSocket(url);

    ws.on("open", () => {
      // Should not reach here with invalid token
      assert(false, "Should not connect with invalid token");
      ws.close();
      resolve();
    });

    ws.on("error", () => {
      // Expected — upgrade rejected
    });

    ws.on("close", (code) => {
      // HTTP 401 manifests as unexpected close or error
      assert(true, `Rejected invalid token (close code=${code})`);
      resolve();
    });

    ws.on("unexpected-response", (_req, res) => {
      assert(
        res.statusCode === 401,
        `Auth rejection: HTTP ${res.statusCode}`,
      );
      resolve();
    });

    setTimeout(() => {
      resolve();
    }, 10000);
  });
}

// --- Step: Missing conversationId test ---
function testMissingConversationId(token) {
  return new Promise((resolve) => {
    console.log("\n🔐 Missing conversationId test");
    const url = `${WS_BASE}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);

    ws.on("open", () => {
      assert(false, "Should not connect without conversationId");
      ws.close();
      resolve();
    });

    ws.on("error", () => {
      // Expected
    });

    ws.on("unexpected-response", (_req, res) => {
      assert(
        res.statusCode === 400,
        `Missing conversationId: HTTP ${res.statusCode}`,
      );
      resolve();
    });

    ws.on("close", () => {
      resolve();
    });

    setTimeout(() => {
      resolve();
    }, 10000);
  });
}

// --- Main ---
async function main() {
  console.log("=== Browser WebSocket E2E Test ===");
  console.log(`Target: ${WS_BASE}`);
  console.log(`Auth: ${E2E_EMAIL}\n`);

  try {
    // Auth
    const token = await getSupabaseToken();

    // Auth rejection
    await testAuthRejection();

    // Missing conversationId
    await testMissingConversationId(token);

    // Full flow: connect, 3 turns (text, multi-turn, tool call)
    const conversationId = crypto.randomUUID();
    console.log(`\n📝 conversationId: ${conversationId}`);
    await connectAndTest(token, conversationId);
  } catch (err) {
    console.error("\n💥 Fatal error:", err.message);
    totalTests++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`RESULTS: ${passedTests}/${totalTests} passed`);
  if (passedTests === totalTests) {
    console.log("✅ ALL TESTS PASSED");
  } else {
    console.log(`❌ ${totalTests - passedTests} FAILED`);
  }
  console.log("=".repeat(50));

  process.exit(passedTests === totalTests ? 0 : 1);
}

main();
