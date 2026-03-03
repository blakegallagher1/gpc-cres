import type {
  CodexClientMethod,
  CodexClientRequestByMethod,
  CodexClientResultByMethod,
  CodexJsonRpcId,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponseEnvelope,
} from "./codex-protocol";

let requestCounter = 1;

export function nextRequestId(): CodexJsonRpcId {
  const next = requestCounter;
  requestCounter = requestCounter >= Number.MAX_SAFE_INTEGER ? 1 : requestCounter + 1;
  return next;
}

export interface PendingResponseState<TResult = unknown> {
  resolve: (value: TResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function makeRequest<M extends CodexClientMethod>(
  method: M,
  params: CodexClientRequestByMethod[M],
  id?: CodexJsonRpcId,
): JsonRpcRequest<CodexClientRequestByMethod[M]> {
  return {
    jsonrpc: "2.0",
    id: id ?? nextRequestId(),
    method,
    params,
  };
}

export function makeNotification<T>(method: string, params: T): JsonRpcNotification<T> {
  return {
    jsonrpc: "2.0",
    method,
    params,
  };
}

export function decodeTypedResult<M extends CodexClientMethod>(
  method: M,
  raw: JsonRpcResponseEnvelope<unknown> | null,
): CodexClientResultByMethod[M] {
  if (!raw || "error" in raw || raw.result === undefined) {
    throw new Error("Invalid Codex response");
  }
  return raw.result as CodexClientResultByMethod[M];
}

export function buildResponseResult(
  id: CodexJsonRpcId,
  result: unknown,
) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  } as const;
}

export function buildResponseError(
  id: CodexJsonRpcId,
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data,
    },
  } as const;
}

export function rpcErrorFromCodexResponse(
  payload?: { code?: number; message?: string },
): Error {
  const code = typeof payload?.code === "number" ? `${payload.code}` : "unknown";
  return new Error(`Codex RPC failed (code ${code}): ${payload?.message ?? "Unknown error"}`);
}

export function toJsonString(payload: unknown): string {
  return JSON.stringify(payload);
}
