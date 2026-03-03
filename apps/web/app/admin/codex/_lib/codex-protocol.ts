export type CodexJsonRpcId = string | number;
export type CodexJsonRpcVersion = "2.0";

export const CLIENT_INFO = {
  name: "magnolia_admin",
  title: "Magnolia Admin",
  version: "1.0.0",
} as const;

export interface CodexClientInfo {
  name: string;
  title: string;
  version: string;
}

export interface JsonRpcBase {
  readonly jsonrpc: CodexJsonRpcVersion;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcRequest<TParams = unknown> extends JsonRpcBase {
  readonly id: CodexJsonRpcId;
  readonly method: string;
  readonly params: TParams;
}

export interface JsonRpcNotification<TParams = unknown> extends JsonRpcBase {
  readonly method: string;
  readonly params: TParams;
  readonly id?: never;
}

export interface JsonRpcResponseEnvelope<TResult = unknown> extends JsonRpcBase {
  readonly id: CodexJsonRpcId;
  readonly result?: TResult;
  readonly error?: JsonRpcErrorPayload;
}

export type JsonRpcIncomingMessage =
  | JsonRpcNotification<unknown>
  | JsonRpcRequest<unknown>
  | JsonRpcResponseEnvelope<unknown>;

export interface InitializeParams {
  clientInfo: CodexClientInfo;
}

export interface InitializeResult {
  sessionId?: string;
}

export interface TurnDiffLine {
  line: string;
}

export interface TurnDiffFile {
  path: string;
  lines: string[];
}

export interface ThreadStartParams {
  model: string | null;
  modelProvider?: string | null;
  cwd?: string | null;
  approvalPolicy:
    | "untrusted"
    | "on-failure"
    | "on-request"
    | "reject"
    | "never"
    | "onRequest";
  sandboxPolicy?: {
    type:
      | "workspace-write"
      | "danger-full-access"
      | "read-only"
      | "workspaceWrite";
    writableRoots: string[];
    networkAccess: boolean;
    excludeTmpdirEnvVar?: boolean;
    excludeSlashTmp?: boolean;
  };
  sandbox?: {
    type: "dangerFullAccess" | "readOnly" | "workspaceWrite";
    writableRoots?: string[];
    networkAccess?: boolean;
    excludeTmpdirEnvVar?: boolean;
    excludeSlashTmp?: boolean;
  } | null;
  config?: Record<string, unknown> | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
}

export interface ThreadResumeParams {
  threadId: string;
}

export interface ThreadListParams {
  includeArchived?: boolean;
}

export interface ThreadArchiveParams {
  threadId: string;
}

export interface ThreadStartResult {
  threadId: string;
  model: string | null;
  createdAt?: string;
}

export interface ThreadResumeResult {
  threadId: string;
  resumed: boolean;
  model?: string | null;
}

export interface ThreadSummary {
  threadId: string;
  title?: string | null;
  model: string | null;
  updatedAt: string;
  createdAt: string;
  isArchived: boolean;
  lastTurnId?: string | null;
}

export interface ThreadListResult {
  threads: ThreadSummary[];
}

export interface ThreadArchiveResult {
  threadId: string;
  archived: boolean;
}

export interface TurnStartParams {
  threadId: string;
  input: Array<{
    type: "text";
    text: string;
  }>;
  cwd?: string | null;
  approvalPolicy?: "unlessTrusted" | "onFailure" | "onRequest" | "never" | null;
  sandboxPolicy?: ThreadStartParams["sandboxPolicy"] | null;
  model?: string | null;
  effort?: "low" | "medium" | "high" | null;
  summary?: "auto" | "detailed" | null;
}

export interface TurnSteerParams {
  threadId: string;
  turnId: string;
  expectedTurnId: string;
  input: Array<{
    type: "text";
    text: string;
  }>;
}

export interface TurnStartedParams {
  threadId: string;
  turnId: string;
  turn?: {
    id: string;
    status?: "completed" | "failed" | "inProgress" | "interrupted";
  };
}

export interface CodexErrorInfo {
  message?: string;
  codexErrorInfo?: string;
}

export interface TurnCompletedParams {
  threadId: string;
  turnId?: string;
  status?: "completed" | "failed" | "inProgress" | "interrupted";
  error?: CodexErrorInfo;
  turn?: {
    id: string;
    status: "completed" | "failed" | "inProgress" | "interrupted";
    error?: CodexErrorInfo;
  };
}

export interface PlanStep {
  id: string;
  text: string;
  completed: boolean;
}

export interface TurnPlanUpdatedParams {
  threadId: string;
  turnId: string;
  steps?: PlanStep[];
  plan?: Array<{
    step: string;
    status: "pending" | "in_progress" | "completed";
  }>;
  explanation?: string | null;
}

export interface TurnDiffUpdatedParams {
  threadId: string;
  turnId: string;
  files?: TurnDiffFile[];
  diff?: string;
}

export interface BaseItem {
  id: string;
}

export interface AgentMessageItem extends BaseItem {
  type: "agentMessage";
}

export interface CommandExecutionItem extends BaseItem {
  type: "commandExecution";
  command: string;
  cwd: string;
  status?: "inProgress" | "completed" | "failed" | "declined";
  exitCode?: number | null;
}

export interface FileChangeChunk {
  path: string;
  diff: string;
}

export interface FileChangeItem extends BaseItem {
  type: "fileChange";
  files?: FileChangeChunk[];
  changes?: FileChangeChunk[];
  status?: "inProgress" | "completed" | "failed" | "declined";
}

export type CodexItem = AgentMessageItem | CommandExecutionItem | FileChangeItem;

export interface ItemStartedParams {
  threadId: string;
  turnId: string;
  item: CodexItem;
}

export interface ItemCompletedParams {
  threadId: string;
  turnId: string;
  item: CodexItem & {
    status: "completed" | "failed" | "declined" | "inProgress";
    exitCode?: number | null;
  };
}

export interface AgentMessageDeltaParams {
  threadId: string;
  turnId: string;
  itemId?: string;
  item?: AgentMessageItem;
  delta: string;
}

export interface CommandExecutionOutputParams {
  threadId: string;
  turnId: string;
  itemId?: string;
  item?: CommandExecutionItem;
  output?: string;
  delta?: string;
}

export interface FileChangeOutputParams {
  threadId: string;
  turnId: string;
  itemId?: string;
  item?: FileChangeItem;
  output?: string;
  delta?: string;
}

export interface CommandExecutionApprovalParams {
  requestId: CodexJsonRpcId;
  threadId: string;
  turnId: string;
  itemId?: string;
  reason?: string | null;
  item?: {
    id: string;
    type: "commandExecution";
    command: string;
    cwd: string;
  };
}

export interface FileChangeApprovalParams {
  requestId: CodexJsonRpcId;
  threadId: string;
  turnId: string;
  itemId?: string;
  reason?: string | null;
  item?: {
    id: string;
    type: "fileChange";
    files: FileChangeChunk[];
  };
}

export interface TurnStartResult {
  turn?: {
    id: string;
    status?: "completed" | "failed" | "inProgress" | "interrupted";
  };
}

export type CodexClientMethod =
  | "initialize"
  | "thread/start"
  | "thread/resume"
  | "thread/list"
  | "thread/archive"
  | "turn/start"
  | "turn/steer";

export type CodexClientRequestByMethod = {
  initialize: InitializeParams;
  "thread/start": ThreadStartParams;
  "thread/resume": ThreadResumeParams;
  "thread/list": ThreadListParams;
  "thread/archive": ThreadArchiveParams;
  "turn/start": TurnStartParams;
  "turn/steer": TurnSteerParams;
};

export type CodexClientResultByMethod = {
  initialize: InitializeResult;
  "thread/start": ThreadStartResult;
  "thread/resume": ThreadResumeResult;
  "thread/list": ThreadListResult;
  "thread/archive": ThreadArchiveResult;
  "turn/start": TurnStartResult;
  "turn/steer": TurnStartedParams;
};

export type CodexServerNotificationMethod =
  | "initialized"
  | "error"
  | "thread/started"
  | "turn/start"
  | "turn/started"
  | "turn/completed"
  | "item/started"
  | "item/completed"
  | "item/agentMessage/delta"
  | "item/commandExecution/requestApproval"
  | "item/fileChange/requestApproval"
  | "turn/diff/updated"
  | "turn/plan/updated"
  | "turn/steer"
  | "item/commandExecution/outputDelta"
  | "item/fileChange/outputDelta";

export type CodexServerNotification =
  | { method: "initialized"; params: Record<string, never> }
  | {
      method: "error";
      params: {
        threadId?: string;
        turnId?: string;
        error: {
          message: string;
          codexErrorInfo?: string;
        };
      };
    }
  | { method: "thread/started"; params: { thread?: { id: string } } }
  | { method: "turn/start"; params: TurnStartedParams }
  | { method: "turn/started"; params: TurnStartedParams }
  | { method: "turn/completed"; params: TurnCompletedParams }
  | { method: "item/started"; params: ItemStartedParams }
  | { method: "item/completed"; params: ItemCompletedParams }
  | { method: "item/agentMessage/delta"; params: AgentMessageDeltaParams }
  | {
      method: "item/commandExecution/requestApproval";
      params: CommandExecutionApprovalParams;
    }
  | {
      method: "item/fileChange/requestApproval";
      params: FileChangeApprovalParams;
    }
  | { method: "turn/diff/updated"; params: TurnDiffUpdatedParams }
  | { method: "turn/plan/updated"; params: TurnPlanUpdatedParams }
  | { method: "turn/steer"; params: TurnStartedParams }
  | { method: "item/commandExecution/outputDelta"; params: CommandExecutionOutputParams }
  | { method: "item/fileChange/outputDelta"; params: FileChangeOutputParams };

interface JsonObject {
  [key: string]: unknown;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRpcId(value: unknown): CodexJsonRpcId | null {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
}

export function parseCodexMessage(raw: unknown): JsonRpcIncomingMessage | null {
  if (!isObject(raw)) {
    return null;
  }

  if (typeof raw.jsonrpc !== "undefined" && raw.jsonrpc !== "2.0") {
    return null;
  }

  const id = parseRpcId(raw.id);
  if (typeof raw.method === "string") {
    if (id !== null) {
      return {
        jsonrpc: "2.0",
        id,
        method: raw.method,
        params: raw.params ?? {},
      };
    }

    return {
      jsonrpc: "2.0",
      method: raw.method,
      params: raw.params ?? {},
    };
  }

  if (id === null) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(raw, "result") && !Object.prototype.hasOwnProperty.call(raw, "error")) {
    return null;
  }

  return {
    jsonrpc: "2.0",
    id,
    result: raw.result,
    error: raw.error as JsonRpcErrorPayload | undefined,
  } as JsonRpcResponseEnvelope<unknown>;
}

export function isCodexResponse<TResult>(
  message: JsonRpcIncomingMessage,
): message is JsonRpcResponseEnvelope<TResult> {
  return "id" in message && ("result" in message || "error" in message);
}

export function isCodexNotification(message: JsonRpcIncomingMessage): message is JsonRpcNotification<unknown> {
  return "method" in message && !Object.prototype.hasOwnProperty.call(message, "id");
}
