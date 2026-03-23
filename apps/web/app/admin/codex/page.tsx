"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ChatAgentMessage,
  type ChatCommandMessage,
  type ChatErrorMessage,
  type ChatFileChangeMessage,
  type ChatMessageEntry,
  type ChatUserMessage,
  ChatPanel,
} from "./_components/ChatPanel";
import { ApprovalModal } from "./_components/ApprovalModal";
import { DiffViewer } from "./_components/DiffViewer";
import { InputBar } from "./_components/InputBar";
import { PlanChecklist } from "./_components/PlanChecklist";
import { StatusBar } from "./_components/StatusBar";
import { ThreadSidebar } from "./_components/ThreadSidebar";
import {
  CODEX_ERROR_EXPLANATIONS,
  DEFAULT_THREAD_START_CONFIG,
  ACTIVE_THREAD_STORAGE_KEY,
} from "./_lib/constants";
import {
  buildResponseResult,
} from "./_lib/codex-rpc";
import {
  type CodexServerNotification,
  type PlanStep,
  type ThreadResumeResult,
  type ThreadStartResult,
  type TurnDiffFile,
  type TurnCompletedParams,
  type AgentMessageDeltaParams,
  type CommandExecutionOutputParams,
  type FileChangeOutputParams,
} from "./_lib/codex-protocol";
import { useApprovals } from "./_hooks/useApprovals";
import { useCodexSocket } from "./_hooks/useCodexSocket";
import { useThreads } from "./_hooks/useThreads";

type TurnWorkflowState = "idle" | "in_progress" | "waiting_on_approval";

type ApprovalAction = "accept" | "acceptForSession" | "decline" | "cancel";
const NO_THREAD_ID = "none";

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function isValidThreadId(threadId: string | null): threadId is string {
  return Boolean(threadId && threadId !== NO_THREAD_ID);
}

function getErrorMessage(error?: {
  message?: string;
  codexErrorInfo?: string;
}): string {
  if (!error) {
    return "Turn failed.";
  }

  if (error.codexErrorInfo && CODEX_ERROR_EXPLANATIONS[error.codexErrorInfo]) {
    return CODEX_ERROR_EXPLANATIONS[error.codexErrorInfo];
  }

  return error.message ?? "Turn failed.";
}

function computeTurnStatusMessage(
  status: TurnWorkflowState,
  waitingForApproval: boolean,
): "idle" | "in_progress" | "waiting on approval" {
  if (status === "in_progress") {
    return "in_progress";
  }
  if (status === "waiting_on_approval" || waitingForApproval) {
    return "waiting on approval";
  }
  return "idle";
}

function makeTurnInput(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}

function formatConnectionPanelDetail(detail: string | null): string {
  if (!detail) {
    return "The Codex relay is unavailable. Retry the connection or check the upstream Codex service.";
  }

  const normalized = detail.toLowerCase();

  if (
    normalized.includes("websocket") ||
    normalized.includes("relay") ||
    normalized.includes("upstream") ||
    normalized.includes("reconnect") ||
    normalized.includes("timed out")
  ) {
    return "The Codex relay is unavailable. Retry the connection or check the upstream Codex service.";
  }

  return detail;
}

function resolveConnectionPanelState(params: {
  socketStatus: "idle" | "connecting" | "connected" | "reconnecting" | "failed";
  isConnected: boolean;
  connectionError: string | null;
  statusError: string | null;
  messageCount: number;
}): null | {
  title: string;
  body: string;
  tone: "neutral" | "warning" | "danger";
  cta: string;
} {
  if (params.messageCount > 0 || params.isConnected) {
    return null;
  }

  const detail = formatConnectionPanelDetail(
    params.connectionError ?? params.statusError ?? null,
  );

  if (params.socketStatus === "failed") {
    return {
      title: "Codex is offline",
      body: detail,
      tone: "danger",
      cta: "Retry connection",
    };
  }

  if (params.socketStatus === "reconnecting") {
    return {
      title: "Reconnecting to Codex",
      body: detail,
      tone: "warning",
      cta: "Reconnect now",
    };
  }

  if (params.socketStatus === "connecting" && params.connectionError) {
    return {
      title: "Waiting on Codex relay",
      body: detail,
      tone: "warning",
      cta: "Retry connection",
    };
  }

  if (params.socketStatus === "connecting") {
    return {
      title: "Connecting to Codex",
      body: "Establishing the relay and upstream session.",
      tone: "neutral",
      cta: "Retry connection",
    };
  }

  if (params.socketStatus === "idle") {
    return {
      title: "Codex session not connected",
      body: detail,
      tone: "warning",
      cta: "Connect",
    };
  }

  return null;
}

function parseUnifiedDiff(diff: string): TurnDiffFile[] {
  const files: TurnDiffFile[] = [];
  let current: TurnDiffFile | null = null;
  const lines = diff.replace(/\r/g, "").split("\n");

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) {
        files.push(current);
      }
      const fileMatch = line.match(/ b\/(.+)$/);
      current = {
        path: fileMatch?.[1] ?? "unknown",
        lines: [],
      };
      continue;
    }

    if (!current && line.startsWith("+++ b/")) {
      current = {
        path: line.replace("+++ b/", ""),
        lines: [],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    files.push(current);
  }

  return files;
}

function normalizePlanSteps(params: {
  steps?: PlanStep[];
  plan?: Array<{ step: string; status: "pending" | "in_progress" | "completed" }>;
}): PlanStep[] {
  if (Array.isArray(params.steps)) {
    return params.steps;
  }

  if (!Array.isArray(params.plan)) {
    return [];
  }

  return params.plan.map((entry, index) => ({
    id: `${index}-${entry.step}`,
    text: entry.step,
    completed: entry.status === "completed",
  }));
}

function resolveTurnStartedId(params: {
  turnId?: string;
  turn?: { id: string };
}): string | null {
  return params.turnId ?? params.turn?.id ?? null;
}

function resolveTurnCompletedState(params: TurnCompletedParams): {
  turnId: string | null;
  status: "completed" | "failed" | "inProgress" | "interrupted";
  error?: { message?: string; codexErrorInfo?: string };
} {
  const nested = params.turn;
  const status = nested?.status ?? params.status ?? "completed";
  const turnId = nested?.id ?? params.turnId ?? null;
  return {
    turnId,
    status,
    error: nested?.error ?? params.error,
  };
}

function resolveAgentDeltaItemId(params: AgentMessageDeltaParams): string | null {
  return params.item?.id ?? params.itemId ?? null;
}

function resolveCommandOutputItemId(params: CommandExecutionOutputParams): string | null {
  return params.item?.id ?? params.itemId ?? null;
}

function resolveCommandOutputText(params: CommandExecutionOutputParams): string {
  return params.output ?? params.delta ?? "";
}

function resolveFileChangeOutputItemId(params: FileChangeOutputParams): string | null {
  return params.item?.id ?? params.itemId ?? null;
}

function resolveFileChangeOutputText(params: FileChangeOutputParams): string {
  return params.output ?? params.delta ?? "";
}

function normalizeFileChangeEntries(item: {
  files?: Array<{ path: string; diff: string }>;
  changes?: Array<{ path: string; diff: string }>;
}): Array<{ path: string; diff: string }> {
  if (Array.isArray(item.files)) {
    return item.files.map((entry) => ({ path: entry.path, diff: entry.diff }));
  }
  if (Array.isArray(item.changes)) {
    return item.changes.map((entry) => ({ path: entry.path, diff: entry.diff }));
  }
  return [];
}

export default function CodexAdminPage() {
  const connectionId = useMemo(createId, []);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [modelName, setModelName] = useState(DEFAULT_THREAD_START_CONFIG.model);
  const [messages, setMessages] = useState<ChatMessageEntry[]>([]);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [diffFiles, setDiffFiles] = useState<TurnDiffFile[]>([]);
  const [turnState, setTurnState] = useState<TurnWorkflowState>("idle");
  const [isWaitingForFirstItem, setIsWaitingForFirstItem] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isSteering, setIsSteering] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const {
    activeApproval,
    approvalCount,
    pushApproval,
    popCurrent,
  } = useApprovals();

  const addMessage = useCallback((message: ChatMessageEntry) => {
    setMessages((current) => [...current, message]);
  }, []);

  const upsertAgentMessage = useCallback((itemId: string, delta: string, isStreaming: boolean) => {
    setMessages((current) => {
      const index = current.findIndex((entry) => entry.kind === "agent" && entry.id === itemId);
      if (index === -1) {
        return [
          ...current,
          {
            id: itemId,
            kind: "agent",
            text: delta,
            isStreaming,
            createdAt: Date.now(),
          } as ChatAgentMessage,
        ];
      }

      const existing = current[index] as ChatAgentMessage;
      const nextMessage = {
        ...existing,
        text: existing.text + delta,
        isStreaming,
      };
      const next = [...current];
      next[index] = nextMessage;
      return next;
    });
  }, []);

  const completeAgentMessage = useCallback((itemId: string) => {
    setMessages((current) => {
      const index = current.findIndex((entry) => entry.kind === "agent" && entry.id === itemId);
      if (index === -1) {
        return current;
      }

      const existing = current[index] as ChatAgentMessage;
      const next = [...current];
      next[index] = {
        ...existing,
        isStreaming: false,
      };
      return next;
    });
  }, []);

  const upsertCommandMessage = useCallback(
    (itemId: string, partial: Partial<ChatCommandMessage>, appendOutput = "") => {
      setMessages((current) => {
        const index = current.findIndex((entry) => entry.kind === "command" && entry.itemId === itemId);
        if (index === -1) {
          return [
            ...current,
            {
              id: createId(),
              kind: "command",
              itemId,
              command: partial.command ?? "",
              cwd: partial.cwd ?? "",
              output: partial.output ?? "",
              status: (partial.status as ChatCommandMessage["status"]) ?? "running",
              exitCode: partial.exitCode,
              createdAt: Date.now(),
            },
          ];
        }

        const existing = current[index] as ChatCommandMessage;
        const next = [...current];
        const nextOutput = appendOutput.length > 0 ? `${existing.output}${appendOutput}` : existing.output;
        next[index] = {
          ...existing,
          ...partial,
          output: appendOutput.length > 0 ? nextOutput : existing.output,
        };
        return next;
      });
    },
    [],
  );

  const upsertFileChangeMessage = useCallback((itemId: string, files: { path: string; diff: string }[], status?: "pending" | "applied" | "declined") => {
    setMessages((current) => {
      const index = current.findIndex((entry) => entry.kind === "fileChange" && entry.itemId === itemId);
      if (index === -1) {
        return [
          ...current,
          {
            id: createId(),
            kind: "fileChange",
            itemId,
            files,
            status: status ?? "pending",
            createdAt: Date.now(),
          } as ChatFileChangeMessage,
        ];
      }

      const existing = current[index] as ChatFileChangeMessage;
      const next = [...current];
      next[index] = {
        ...existing,
        files: files.length > 0 ? files : existing.files,
        status: status ?? existing.status,
      };
      return next;
    });
  }, []);

  const updateCommandOutput = useCallback((itemId: string, output: string) => {
    if (!output) {
      return;
    }
    upsertCommandMessage(itemId, {}, output);
  }, [upsertCommandMessage]);

  const completeCommand = useCallback(
    (itemId: string, status: "completed" | "failed", exitCode: number | null) => {
      upsertCommandMessage(itemId, {
        status,
        exitCode,
      });
    },
    [upsertCommandMessage],
  );

  const completeFileChange = useCallback((itemId: string, status: "applied" | "declined") => {
    upsertFileChangeMessage(itemId, [], status);
  }, [upsertFileChangeMessage]);

  const addSystemMessage = useCallback(
    (text: string) => {
      addMessage({
        id: createId(),
        kind: "system",
        text,
        tone: "info",
        createdAt: Date.now(),
      });
    },
    [addMessage],
  );

  const addErrorMessage = useCallback(
    (text: string) => {
      addMessage({
        id: createId(),
        kind: "error",
        text,
        createdAt: Date.now(),
      } as ChatErrorMessage);
    },
    [addMessage],
  );

  const addUserMessage = useCallback(
    (text: string) => {
      addMessage({
        id: createId(),
        kind: "user",
        text,
        createdAt: Date.now(),
      } as ChatUserMessage);
    },
    [addMessage],
  );

  const setModelForThread = useCallback((thread: string | null) => {
    if (isValidThreadId(thread)) {
      setActiveThreadId(thread);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, thread);
      }
      return;
    }

    setActiveThreadId(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
    }
  }, []);

  const clearThreadState = useCallback(() => {
    setActiveTurnId(null);
    setTurnState("idle");
    setIsWaitingForFirstItem(false);
    setPlanSteps([]);
    setDiffFiles([]);
    setIsSteering(false);
  }, []);

  const socket = useCodexSocket({
    connectionId,
    enabled: true,
    handlers: {
      onNotification: (notification) => {
        if (!notification || typeof (notification as { method?: unknown }).method !== "string") {
          return;
        }

        const message = notification as CodexServerNotification & { method: string; params: Record<string, unknown> };

        switch (message.method) {
          case "turn/start":
          case "turn/started": {
            const params = message as { params: { turnId?: string; turn?: { id: string } } };
            const turnId = resolveTurnStartedId(params.params);
            if (turnId) {
              setActiveTurnId(turnId);
              addSystemMessage(`Turn started (${turnId})`);
            }
            setTurnState("in_progress");
            setIsWaitingForFirstItem(true);
            setDiffFiles([]);
            break;
          }
          case "turn/completed": {
            const params = message as Extract<CodexServerNotification, { method: "turn/completed" }>;
            const resolved = resolveTurnCompletedState(params.params);
            setIsWaitingForFirstItem(false);
            setActiveTurnId((turnId) => {
              if (!resolved.turnId) {
                return null;
              }
              return turnId === resolved.turnId ? null : turnId;
            });
            setIsSteering(false);
            if (resolved.status === "failed") {
              addErrorMessage(getErrorMessage(resolved.error));
              setTurnState("idle");
            } else if (approvalCount > 0) {
              setTurnState("waiting_on_approval");
            } else {
              setTurnState("idle");
            }
            setDiffFiles([]);
            break;
          }
          case "item/started": {
            const params = message as Extract<CodexServerNotification, { method: "item/started" }>;
            setIsWaitingForFirstItem(false);
            if (params.params.item.type === "agentMessage") {
              upsertAgentMessage(params.params.item.id, "", true);
              return;
            }

            if (params.params.item.type === "commandExecution") {
              upsertCommandMessage(params.params.item.id, {
                command: params.params.item.command,
                cwd: params.params.item.cwd,
                status: "running",
              });
              return;
            }

            if (params.params.item.type === "fileChange") {
              upsertFileChangeMessage(
                params.params.item.id,
                normalizeFileChangeEntries(params.params.item),
                "pending",
              );
            }
            break;
          }
          case "item/completed": {
            const params = message as Extract<CodexServerNotification, { method: "item/completed" }>;
            if (params.params.item.type === "agentMessage") {
              completeAgentMessage(params.params.item.id);
              return;
            }

            if (params.params.item.type === "commandExecution") {
              const status =
                params.params.item.status === "failed" || params.params.item.status === "declined"
                  ? "failed"
                  : "completed";
              completeCommand(
                params.params.item.id,
                status,
                params.params.item.exitCode ?? null,
              );
              return;
            }

            if (params.params.item.type === "fileChange") {
              const status =
                params.params.item.status === "declined" || params.params.item.status === "failed"
                  ? "declined"
                  : "applied";
              completeFileChange(params.params.item.id, status);
            }
            break;
          }
          case "item/agentMessage/delta": {
            const params = message as Extract<CodexServerNotification, { method: "item/agentMessage/delta" }>;
            const itemId = resolveAgentDeltaItemId(params.params);
            if (!itemId) {
              break;
            }
            upsertAgentMessage(itemId, params.params.delta, true);
            break;
          }
          case "item/commandExecution/outputDelta": {
            const params = message as Extract<CodexServerNotification, { method: "item/commandExecution/outputDelta" }>;
            const itemId = resolveCommandOutputItemId(params.params);
            if (!itemId) {
              break;
            }
            updateCommandOutput(itemId, resolveCommandOutputText(params.params));
            break;
          }
          case "item/fileChange/outputDelta": {
            const params = message as Extract<CodexServerNotification, { method: "item/fileChange/outputDelta" }>;
            const output = resolveFileChangeOutputText(params.params);
            const itemId = resolveFileChangeOutputItemId(params.params);
            if (!itemId) {
              break;
            }
            upsertFileChangeMessage(
              itemId,
              output ? [{ path: "(unified output)", diff: output }] : [],
              "pending",
            );
            break;
          }
          case "item/commandExecution/requestApproval": {
            const params = message as Extract<
              CodexServerNotification,
              { method: "item/commandExecution/requestApproval" }
            >;
            pushApproval(params.params);
            setTurnState("waiting_on_approval");
            break;
          }
          case "item/fileChange/requestApproval": {
            const params = message as Extract<CodexServerNotification, { method: "item/fileChange/requestApproval" }>;
            pushApproval(params.params);
            setTurnState("waiting_on_approval");
            break;
          }
          case "turn/diff/updated": {
            const params = message as Extract<CodexServerNotification, { method: "turn/diff/updated" }>;
            if (Array.isArray(params.params.files)) {
              setDiffFiles(params.params.files);
            } else if (typeof params.params.diff === "string") {
              setDiffFiles(parseUnifiedDiff(params.params.diff));
            }
            break;
          }
          case "turn/plan/updated": {
            const params = message as Extract<CodexServerNotification, { method: "turn/plan/updated" }>;
            setPlanSteps(normalizePlanSteps(params.params));
            break;
          }
          case "error": {
            const params = message as Extract<CodexServerNotification, { method: "error" }>;
            addErrorMessage(getErrorMessage(params.params.error));
            break;
          }
          default:
            break;
        }
      },
      onResponse: () => {
        return;
      },
      onConnectionError: (message) => {
        setStatusError(message);
      },
      onConnected: () => {
        setStatusError(null);
      },
      onDisconnected: () => {
        setTurnState("idle");
        setActiveTurnId(null);
      },
    },
  });

  const { status: socketStatus, isConnected, connectionStatusText, connectionError, send, sendRequest, reconnect } = socket;

  const { threads, isLoadingThreads, refreshThreads, startThread, resumeThread, archiveThread } = useThreads({
    sendRequest,
    enabled: isConnected,
    onError: setStatusError,
  });

  const startNewThread = useCallback(
    async (message?: string) => {
      if (!isConnected) {
        setStatusError("Cannot start a thread while disconnected.");
        return;
      }

      const trimmedMessage = message?.trim() ?? "";

      try {
        const response = (await startThread(DEFAULT_THREAD_START_CONFIG)) as ThreadStartResult;
        setModelName(response.model ?? DEFAULT_THREAD_START_CONFIG.model);
        setModelForThread(response.threadId);
        clearThreadState();
        setMessages([]);
        setPlanSteps([]);
        setDiffFiles([]);
        void refreshThreads();

        if (!trimmedMessage) {
          return;
        }

        addUserMessage(trimmedMessage);
        setTurnState("in_progress");
        setIsWaitingForFirstItem(true);
        await sendRequest("turn/start", {
          threadId: response.threadId,
          input: makeTurnInput(trimmedMessage),
          cwd: null,
          approvalPolicy: null,
          sandboxPolicy: null,
          model: null,
          effort: null,
          summary: null,
        });
      } catch (error) {
        addErrorMessage(error instanceof Error ? error.message : "Failed to start thread");
        setStatusError(error instanceof Error ? error.message : "Failed to start thread");
      }
    },
    [addUserMessage, addErrorMessage, clearThreadState, isConnected, refreshThreads, sendRequest, setModelForThread, startThread],
  );

  const resumeExistingThread = useCallback(
    async (threadId: string) => {
      if (!isConnected) {
        setStatusError("Cannot resume thread while disconnected.");
        return;
      }

      setModelForThread(threadId);
      setMessages([]);
      setPlanSteps([]);
      setDiffFiles([]);
      setTurnState("idle");
      setIsWaitingForFirstItem(false);
      setActiveTurnId(null);

      try {
        const response = (await resumeThread({ threadId })) as ThreadResumeResult;
        setModelName(response.model ?? DEFAULT_THREAD_START_CONFIG.model);
        setActiveThreadId(response.threadId);
        addSystemMessage(`Resumed thread ${response.threadId}`);
      } catch (error) {
        // Clear the stale thread ID so we don't retry the same dead thread on next load.
        setModelForThread(null);
        clearThreadState();
        setStatusError(error instanceof Error ? error.message : "Failed to resume thread");
        addSystemMessage("Thread could not be resumed. You can start a new thread or select another from the sidebar.");
      }
    },
    [addSystemMessage, clearThreadState, isConnected, resumeThread, setModelForThread],
  );

  const archiveCurrentThread = useCallback(
    async (threadId: string) => {
      if (!isConnected) {
        setStatusError("Cannot archive while disconnected.");
        return;
      }

      try {
        await archiveThread({ threadId });
        if (threadId === activeThreadId) {
          setModelForThread(null);
          clearThreadState();
          setMessages([]);
        }
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "Failed to archive thread");
      }
    },
    [activeThreadId, archiveThread, clearThreadState, setModelForThread, isConnected],
  );

  const sendApproval = useCallback(
    (action: ApprovalAction) => {
      if (!activeApproval) {
        return;
      }

      const payload =
        action === "acceptForSession"
          ? activeApproval.kind === "commandExecution"
            ? { decision: "accept", acceptSettings: { forSession: true } }
            : { decision: "accept" }
          : action === "accept"
            ? { decision: "accept" }
            : action === "decline"
              ? { decision: "decline" }
              : { decision: "cancel" };
      send(buildResponseResult(activeApproval.requestId, payload));
      popCurrent();

      if (action === "decline" || action === "cancel") {
        setTurnState("in_progress");
      } else if (approvalCount <= 1) {
        setTurnState("in_progress");
      }
    },
    [activeApproval, approvalCount, popCurrent, send],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }

    if (!isConnected || socketStatus !== "connected") {
      setStatusError("Not connected to Codex relay.");
      return;
    }

    setInputValue("");
    setStatusError(null);

    if (turnState === "in_progress" && activeTurnId && !isSteering) {
      if (!isValidThreadId(activeThreadId)) {
        setStatusError("No active thread to steer.");
        return;
      }

      setIsSteering(true);
      setTurnState("in_progress");
      setStatusError(null);
      try {
        await send({
          jsonrpc: "2.0",
          method: "turn/steer",
          params: {
            threadId: activeThreadId,
            turnId: activeTurnId,
            expectedTurnId: activeTurnId,
            input: makeTurnInput(trimmed),
          },
        });
        addSystemMessage("Steering active turn...");
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "Failed to steer turn");
      } finally {
        setIsSteering(false);
      }
      return;
    }

    if (isValidThreadId(activeThreadId)) {
      setTurnState("in_progress");
      setIsWaitingForFirstItem(true);
      addUserMessage(trimmed);
      try {
        await sendRequest("turn/start", {
          threadId: activeThreadId,
          input: makeTurnInput(trimmed),
          cwd: null,
          approvalPolicy: null,
          sandboxPolicy: null,
          model: null,
          effort: null,
          summary: null,
        });
      } catch (error) {
        setTurnState("idle");
        addErrorMessage(error instanceof Error ? error.message : "Failed to start turn");
      }
      return;
    }

    await startNewThread(trimmed);
  }, [
    activeThreadId,
    activeTurnId,
    inputValue,
    isConnected,
    isSteering,
    sendRequest,
    socketStatus,
    startNewThread,
    turnState,
    addSystemMessage,
    addUserMessage,
    addErrorMessage,
  ]);

  const handleKeydown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "n" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void startNewThread();
      }

      if (event.key === "Escape" && activeApproval) {
        event.preventDefault();
        sendApproval("cancel");
      }
    },
    [activeApproval, sendApproval, startNewThread],
  );

  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (!isConnected) {
      wasConnectedRef.current = false;
      return;
    }

    const didReconnect = wasConnectedRef.current === false;
    wasConnectedRef.current = true;

    if (!didReconnect) {
      return;
    }

    if (!isValidThreadId(activeThreadId)) {
      return;
    }

    void resumeExistingThread(activeThreadId);
  }, [activeThreadId, isConnected, resumeExistingThread]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY) : null;
    if (!stored || activeThreadId === stored) {
      return;
    }

    void resumeExistingThread(stored);
  }, [activeThreadId, isConnected, resumeExistingThread]);

  useEffect(() => {
    if (socketStatus === "connected" && threads.length === 0) {
      void refreshThreads();
    }
  }, [refreshThreads, socketStatus, threads.length]);

  useEffect(() => {
    if (approvalCount === 0 && turnState === "waiting_on_approval") {
      setTurnState(activeTurnId ? "in_progress" : "idle");
    }
  }, [approvalCount, activeTurnId, turnState]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handleKeydown(event);
    };

    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [handleKeydown]);

  useEffect(() => {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
    if (isValidThreadId(saved)) {
      setModelForThread(saved);
    }
  }, [setModelForThread]);

  useEffect(() => {
    if (turnState === "in_progress" && approvalCount > 0) {
      setTurnState("waiting_on_approval");
    }
  }, [approvalCount, turnState]);

  const waitingOnApproval = approvalCount > 0;
  const turnStatusText = computeTurnStatusMessage(turnState, waitingOnApproval);
  const connectionPanel = resolveConnectionPanelState({
    socketStatus,
    isConnected,
    connectionError,
    statusError,
    messageCount: messages.length,
  });

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl gap-4">
        <div className="flex h-full w-full flex-col gap-3 md:w-[68%]">
          <StatusBar
            connectionStatus={connectionStatusText}
            isConnected={isConnected}
            threadId={activeThreadId}
            modelName={modelName}
            turnStatus={turnStatusText}
            isReconnecting={socketStatus === "reconnecting"}
            waitingOnApproval={waitingOnApproval}
          />

          {connectionPanel ? (
            <section
              className={`flex flex-1 items-center justify-center rounded-md text-center ${
                connectionPanel.tone === "danger"
                  ? "border border-red-700/70 bg-red-950/20"
                  : connectionPanel.tone === "warning"
                    ? "border border-amber-700/60 bg-amber-950/10"
                    : "border border-gray-800 bg-gray-900"
              }`}
            >
              <div className="max-w-md px-6">
                <p
                  className={`mb-2 text-xl font-semibold ${
                    connectionPanel.tone === "danger"
                      ? "text-red-200"
                      : connectionPanel.tone === "warning"
                        ? "text-amber-100"
                        : "text-gray-100"
                  }`}
                >
                  {connectionPanel.title}
                </p>
                <p
                  className={`mb-4 text-sm ${
                    connectionPanel.tone === "danger"
                      ? "text-red-100"
                      : connectionPanel.tone === "warning"
                        ? "text-amber-50/90"
                        : "text-gray-300"
                  }`}
                >
                  {connectionPanel.body}
                </p>
                {socketStatus === "connecting" && !connectionError ? (
                  <div className="mb-4 animate-pulse text-xs uppercase tracking-[0.24em] text-gray-500">
                    Handshake in progress
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={reconnect}
                  className={`rounded-md px-4 py-2 text-sm ${
                    connectionPanel.tone === "danger"
                      ? "border border-red-400/60 bg-red-600/10 text-red-100"
                      : connectionPanel.tone === "warning"
                        ? "border border-amber-400/60 bg-amber-500/10 text-amber-100"
                        : "border border-gray-600 bg-gray-800 text-gray-100"
                  }`}
                >
                  {connectionPanel.cta}
                </button>
              </div>
            </section>
          ) : (
            <>
              <PlanChecklist steps={planSteps} />
              <ChatPanel
                messages={messages}
                isConnected={isConnected}
                isWaitingForFirstItem={isWaitingForFirstItem}
                isReconnecting={socketStatus === "reconnecting"}
                showSkeletonPulse={turnState === "in_progress"}
                turnStatus={turnState === "in_progress" ? "in_progress" : "idle"}
              />

              <InputBar
                value={inputValue}
                disabled={socketStatus !== "connected" || waitingOnApproval}
                isLoading={isSteering}
                onValueChange={setInputValue}
                onSubmit={handleSubmit}
              />
            </>
          )}
        </div>

        <div className="flex h-full w-full flex-col gap-3 md:w-[32%]">
          <ThreadSidebar
            threads={threads}
            activeThreadId={activeThreadId}
            isLoadingThreads={isLoadingThreads}
            onResume={(threadId) => {
              void resumeExistingThread(threadId);
            }}
            onArchive={(threadId) => {
              void archiveCurrentThread(threadId);
            }}
            onNewThread={() => {
              setModelForThread(null);
              setMessages([]);
              setPlanSteps([]);
              clearThreadState();
              void startNewThread();
            }}
          />
          <DiffViewer files={diffFiles} />
        </div>
      </div>

      {statusError ? (
        <div className="fixed right-4 top-4 z-50 rounded-md border border-red-700/70 bg-red-950 px-3 py-2 text-xs text-red-100">
          {statusError}
        </div>
      ) : null}

      <ApprovalModal
        approval={
          activeApproval
            ? {
                kind: activeApproval.kind,
                requestId: activeApproval.requestId,
                threadId: activeApproval.threadId,
                turnId: activeApproval.turnId,
                itemId: activeApproval.itemId,
                command: activeApproval.command,
                cwd: activeApproval.cwd,
                files: activeApproval.files,
              }
            : null
        }
        onAction={sendApproval}
      />
    </main>
  );
}
