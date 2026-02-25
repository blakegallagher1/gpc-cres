/**
 * E2E WebSocket test: Tool call flow
 * Browser → Worker → DO → OpenAI → tool_call → DO executes tool → result → response
 *
 * Usage: node scripts/test-ws-tools.mjs <jwt_token> [message]
 */
import WebSocket from "ws";

const token = process.argv[2];
const msg = process.argv[3] || "What is parcel 001-5096-7 zoned as? Use the get_parcel_details tool.";

if (!token) {
  console.error("Usage: node scripts/test-ws-tools.mjs <jwt_token> [message]");
  process.exit(1);
}

const conversationId = crypto.randomUUID();
const wsUrl = `wss://agents.gallagherpropco.com/ws?token=${encodeURIComponent(token)}&conversationId=${conversationId}`;

console.log(`Message: "${msg}"`);
console.log(`Connecting to DO with conversationId=${conversationId}...`);

const ws = new WebSocket(wsUrl);
const events = [];
let done = false;
let textContent = "";

ws.on("open", () => {
  console.log("WebSocket OPEN - sending message...\n");
  ws.send(JSON.stringify({ type: "message", text: msg }));
});

ws.on("message", (data) => {
  const str = data.toString();
  try {
    const evt = JSON.parse(str);
    events.push(evt);

    switch (evt.type) {
      case "text_delta":
        process.stdout.write(evt.content);
        textContent += evt.content;
        break;
      case "tool_start":
        console.log(`\n  [TOOL START] ${evt.name}(${JSON.stringify(evt.args || {}).slice(0, 200)})`);
        break;
      case "tool_end":
        const resultStr = JSON.stringify(evt.result || {});
        console.log(`  [TOOL END] ${evt.name} → ${evt.status} (${resultStr.length} chars)`);
        if (resultStr.length < 500) console.log(`    Result: ${resultStr}`);
        break;
      case "agent_switch":
        console.log(`\n  [AGENT SWITCH] → ${evt.agentName}`);
        break;
      case "error":
        console.log(`\n  [ERROR] ${evt.code || ""}: ${evt.message}`);
        break;
      case "done":
        done = true;
        console.log("\n\n--- DONE ---");
        console.log(`Total events: ${events.length}`);
        const types = {};
        events.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
        console.log("Event counts:", types);
        ws.close();
        break;
      default:
        console.log(`\n  [${evt.type}]`, JSON.stringify(evt).slice(0, 200));
    }
  } catch {
    console.log("\n  [raw]", str.slice(0, 200));
  }
});

ws.on("error", (err) => {
  console.error("WebSocket ERROR:", err.message);
});

ws.on("close", (code, reason) => {
  console.log(`WebSocket CLOSED: code=${code}`);
  if (!done) {
    console.log(`Events received before close: ${events.length}`);
    const types = {};
    events.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
    console.log("Event counts:", types);
  }
  process.exit(done ? 0 : 1);
});

// Timeout after 120s (tool calls can take time)
setTimeout(() => {
  if (!done) {
    console.error("\nTIMEOUT after 120s");
    console.log(`Events received: ${events.length}`);
    const types = {};
    events.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
    console.log("Event counts:", types);
    ws.close();
    process.exit(1);
  }
}, 120000);
