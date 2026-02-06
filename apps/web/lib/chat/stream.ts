import type { ChatStreamEvent } from "./types";

/**
 * Parse SSE stream from chat API.
 * Yields ChatStreamEvent objects.
 */
export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<ChatStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as ChatStreamEvent;
          yield event;
        } catch {
          // Skip malformed events
        }
      }
    }
  }
}
