/**
 * E2E WebSocket test: Multi-turn conversation
 * Tests that previous_response_id chaining works correctly.
 *
 * Usage: node scripts/test-ws-multiturn.mjs <jwt_token>
 */
import WebSocket from "ws";

const token = process.argv[2];
if (!token) {
  console.error("Usage: node scripts/test-ws-multiturn.mjs <jwt_token>");
  process.exit(1);
}

const conversationId = crypto.randomUUID();
const wsUrl = `wss://agents.gallagherpropco.com/ws?token=${encodeURIComponent(token)}&conversationId=${conversationId}`;

const messages = [
  "What is the address for parcel 001-5096-7? Use get_parcel_details.",
  "Who owns that parcel? Use the info you already have from the previous response.",
];

let msgIndex = 0;
let turnCount = 0;

console.log(`Multi-turn test with ${messages.length} messages`);
console.log(`conversationId=${conversationId}\n`);

const ws = new WebSocket(wsUrl);
const events = [];

ws.on("open", () => {
  console.log("WebSocket OPEN");
  sendNext();
});

function sendNext() {
  if (msgIndex >= messages.length) {
    console.log("\n=== ALL TURNS COMPLETE ===");
    console.log(`Total events: ${events.length}, Turns: ${turnCount}`);
    ws.close();
    return;
  }
  const msg = messages[msgIndex];
  console.log(`\n--- Turn ${msgIndex + 1}: "${msg}" ---\n`);
  ws.send(JSON.stringify({ type: "message", text: msg }));
  msgIndex++;
}

ws.on("message", (data) => {
  const str = data.toString();
  try {
    const evt = JSON.parse(str);
    events.push(evt);

    switch (evt.type) {
      case "text_delta":
        process.stdout.write(evt.content);
        break;
      case "tool_start":
        console.log(`\n  [TOOL START] ${evt.name}`);
        break;
      case "tool_end":
        console.log(`  [TOOL END] ${evt.name} → ${evt.status} (${JSON.stringify(evt.result || {}).length} chars)`);
        break;
      case "done":
        turnCount++;
        console.log(`\n  [DONE turn ${turnCount}]`);
        // Send next message after a short delay
        setTimeout(sendNext, 1000);
        break;
      case "error":
        console.log(`\n  [ERROR] ${evt.code || ""}: ${evt.message}`);
        break;
      default:
        break;
    }
  } catch {
    console.log("\n  [raw]", str.slice(0, 200));
  }
});

ws.on("error", (err) => {
  console.error("WebSocket ERROR:", err.message);
});

ws.on("close", (code) => {
  console.log(`\nWebSocket CLOSED: code=${code}`);
  process.exit(turnCount >= messages.length ? 0 : 1);
});

setTimeout(() => {
  console.error("\nTIMEOUT after 180s");
  ws.close();
  process.exit(1);
}, 180000);
