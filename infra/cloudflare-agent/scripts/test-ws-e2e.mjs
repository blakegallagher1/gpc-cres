/**
 * E2E WebSocket test: Browser → Worker → Durable Object → OpenAI → response
 *
 * Usage: node scripts/test-ws-e2e.mjs <jwt_token>
 */
import WebSocket from "ws";

const token = process.argv[2];
if (!token) {
  console.error("Usage: node scripts/test-ws-e2e.mjs <jwt_token>");
  process.exit(1);
}

const conversationId = crypto.randomUUID();
const wsUrl = `wss://agents.gallagherpropco.com/ws?token=${encodeURIComponent(token)}&conversationId=${conversationId}`;

console.log(`Connecting to DO with conversationId=${conversationId}...`);

const ws = new WebSocket(wsUrl);
const events = [];
let done = false;

ws.on("open", () => {
  console.log("WebSocket OPEN - sending message...");
  ws.send(JSON.stringify({ type: "message", text: "Say hello in one word." }));
});

ws.on("message", (data) => {
  const str = data.toString();
  try {
    const evt = JSON.parse(str);
    events.push(evt);
    console.log(`  [${evt.type}]`, evt.type === "text_delta" ? evt.content : "");
    if (evt.type === "done" || evt.type === "error") {
      done = true;
      console.log("\n--- DONE ---");
      console.log(`Total events: ${events.length}`);
      console.log(`Event types: ${events.map(e => e.type).join(", ")}`);
      ws.close();
    }
  } catch {
    console.log("  [raw]", str.slice(0, 200));
  }
});

ws.on("error", (err) => {
  console.error("WebSocket ERROR:", err.message);
});

ws.on("close", (code, reason) => {
  console.log(`WebSocket CLOSED: code=${code}, reason=${reason.toString()}`);
  if (!done) {
    console.log(`Events received before close: ${events.length}`);
    events.forEach((e, i) => console.log(`  ${i}: ${e.type}`));
  }
  process.exit(done ? 0 : 1);
});

// Timeout after 60s
setTimeout(() => {
  if (!done) {
    console.error("TIMEOUT after 60s");
    console.log(`Events received: ${events.length}`);
    events.forEach((e, i) => console.log(`  ${i}: ${e.type}`));
    ws.close();
    process.exit(1);
  }
}, 60000);
