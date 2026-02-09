export interface StreamChunk {
  event: string;
  data: Record<string, unknown>;
}

export interface StreamAgentOptions {
  apiBaseUrl: string;
  agentName: string;
  query: string;
  projectId?: string | null;
  onChunk?: (chunk: StreamChunk) => void;
  onError?: (error: Error) => void;
}

export async function streamAgentRun({
  apiBaseUrl,
  agentName,
  query,
  projectId,
  onChunk,
  onError,
}: StreamAgentOptions) {
  try {
    const response = await fetch(`${apiBaseUrl}/agents/${agentName}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        project_id: projectId ?? undefined,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n").filter(Boolean);
        let event = "message";
        let dataPayload = "{}";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            event = line.replace("event:", "").trim();
          }
          if (line.startsWith("data:")) {
            dataPayload = line.replace("data:", "").trim();
          }
        }

        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(dataPayload);
        } catch (error) {
          data = { raw: dataPayload };
        }

        onChunk?.({ event, data });
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Stream failed");
    onError?.(err);
  }
}
