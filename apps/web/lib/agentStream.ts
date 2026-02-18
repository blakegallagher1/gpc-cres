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
    const parseSseBody = async (response: Response) => {
      if (!response.body) {
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
          } catch {
            data = { raw: dataPayload };
          }

          onChunk?.({ event, data });
        }
      }
    };

    const externalResponse = await fetch(`${apiBaseUrl}/agents/${agentName}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        project_id: projectId ?? undefined,
      }),
    });

    if (externalResponse.ok && externalResponse.body) {
      await parseSseBody(externalResponse);
      return;
    }

    const shouldFallbackToInternal =
      externalResponse.status === 404 ||
      externalResponse.status === 405 ||
      externalResponse.status === 0;
    if (!shouldFallbackToInternal) {
      throw new Error(`Stream failed with status ${externalResponse.status}`);
    }

    const internalUrl = new URL("/api/agent", apiBaseUrl).toString();
    const internalResponse = await fetch(internalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: query,
        runType: "ENRICHMENT",
        persistConversation: true,
        injectSystemContext: true,
      }),
    });
    if (!internalResponse.ok || !internalResponse.body) {
      throw new Error(`Internal stream failed with status ${internalResponse.status}`);
    }
    await parseSseBody(internalResponse);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Stream failed");
    onError?.(err);
  }
}
