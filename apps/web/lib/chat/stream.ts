import type { ChatStreamEvent } from "./types";

function parseEventBlock(rawBlock: string): ChatStreamEvent | null {
  const lines = rawBlock.split(/\r?\n/);
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .filter((line) => line.length > 0);

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return JSON.parse(dataLines.join("\n")) as ChatStreamEvent;
  } catch {
    return null;
  }
}

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
  let done = false;

  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    const value = chunk.value;
    if (!value) {
      continue;
    }

    buffer += decoder.decode(value, { stream: true });
    const normalized = buffer.replace(/\r\n/g, "\n");
    const eventBlocks = normalized.split("\n\n");
    buffer = eventBlocks.pop() ?? "";

    for (const block of eventBlocks) {
      const event = parseEventBlock(block);
      if (event) {
        yield event;
      }
    }
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    buffer += finalChunk;
  }

  const finalEvent = parseEventBlock(buffer.trim());
  if (finalEvent) {
    yield finalEvent;
  }
}
