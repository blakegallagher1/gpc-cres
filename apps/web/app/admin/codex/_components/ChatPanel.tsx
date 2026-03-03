"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CommandBlock } from "./CommandBlock";
import { FileChangeBlock } from "./FileChangeBlock";
import { SCROLL_AUTO_THRESHOLD_PX } from "../_lib/constants";

export type ChatMessageKind = "agent" | "command" | "fileChange" | "system" | "error" | "user";

type TurnStatus = "idle" | "in_progress";

interface BaseMessage {
  id: string;
  turnId?: string;
  createdAt: number;
}

function messageSignature(messages: ChatMessageEntry[]): string {
  return messages
    .map((message) => {
      if (message.kind === "agent") {
        return `a:${message.id}:${message.text}:${message.isStreaming ? 1 : 0}`;
      }

      if (message.kind === "command") {
        return `c:${message.id}:${message.command}:${message.cwd}:${message.status}:${message.exitCode ?? ""}:${message.output}`;
      }

      if (message.kind === "fileChange") {
        return `f:${message.id}:${message.status}:${message.files
          .map((file) => `${file.path}|${file.diff}`)
          .join(";;")}`;
      }

      if (message.kind === "system") {
        return `s:${message.id}:${message.text}:${message.tone}`;
      }

      if (message.kind === "error") {
        return `e:${message.id}:${message.text}`;
      }

      return `u:${message.id}:${message.text}`;
    })
    .join("||");
}

export interface ChatAgentMessage extends BaseMessage {
  kind: "agent";
  text: string;
  isStreaming: boolean;
}

export interface ChatCommandMessage extends BaseMessage {
  kind: "command";
  itemId: string;
  command: string;
  cwd: string;
  output: string;
  status: "running" | "completed" | "failed";
  exitCode?: number | null;
}

export interface ChatFileChangeMessage extends BaseMessage {
  kind: "fileChange";
  itemId: string;
  files: {
    path: string;
    diff: string;
  }[];
  status: "pending" | "applied" | "declined";
}

export interface ChatSystemMessage extends BaseMessage {
  kind: "system";
  text: string;
  tone: "info" | "warn";
}

export interface ChatErrorMessage extends BaseMessage {
  kind: "error";
  text: string;
}

export interface ChatUserMessage extends BaseMessage {
  kind: "user";
  text: string;
}

export type ChatMessageEntry =
  | ChatAgentMessage
  | ChatCommandMessage
  | ChatFileChangeMessage
  | ChatSystemMessage
  | ChatErrorMessage
  | ChatUserMessage;

export interface ChatPanelProps {
  messages: ChatMessageEntry[];
  isConnected: boolean;
  isWaitingForFirstItem: boolean;
  isReconnecting: boolean;
  showSkeletonPulse: boolean;
  turnStatus: TurnStatus;
}

const messageClassName: Record<ChatMessageKind, string> = {
  agent: "bg-gray-800/80 text-gray-100 border-cyan-500/30",
  command: "bg-gray-900/90 border-emerald-700/50 text-emerald-100",
  fileChange: "bg-gray-900/80 border-indigo-700/50 text-indigo-100",
  system: "bg-gray-900/80 border-blue-700/40 text-blue-100",
  error: "bg-red-950 border-red-700/50 text-red-100",
  user: "bg-gray-700/80 text-gray-100 border-violet-500/50",
};

function renderMonospaceText(text: string, dark = true) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <pre
      className={cn(
        "max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded border border-gray-700 p-2 font-mono text-xs",
        dark ? "bg-black/70" : "bg-transparent",
      )}
    >
      {lines.map((line, index) => (
        <span
          key={`${line}-${index}`}
          className={cn(
            "block",
            line.startsWith("+") && line.length > 1 ? "text-emerald-300" : undefined,
            line.startsWith("-") && line.length > 1 ? "text-red-300" : undefined,
            line.startsWith("@@") ? "text-sky-300" : undefined,
          )}
        >
          {line || "\u00a0"}
        </span>
      ))}
    </pre>
  );
}

function classForTurnStatus(status: string) {
  return status === "in_progress"
    ? "bg-cyan-500/20 text-cyan-100"
    : "bg-gray-700/40 text-gray-200";
}

function SkeletonPulse() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/80 p-3">
      <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
      <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
      <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
      <span className="text-xs text-gray-400">Waiting for first agent output…</span>
    </div>
  );
}

export function ChatPanel({
  messages,
  isConnected,
  isWaitingForFirstItem,
  isReconnecting,
  showSkeletonPulse,
  turnStatus,
}: ChatPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showJumpPill, setShowJumpPill] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messageSignatureRef = useRef("");

  function scrollToBottom(force = true) {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
    if (force) {
      setShowJumpPill(false);
      setIsNearBottom(true);
    }
  }

  useEffect(() => {
    const signature = messageSignature(messages);
    const hasChanged = signature !== messageSignatureRef.current;
    if (hasChanged && isNearBottom) {
      scrollToBottom();
    }

    if (hasChanged && !isNearBottom) {
      setShowJumpPill(true);
    }
    messageSignatureRef.current = signature;
  }, [isNearBottom, messages]);

  useEffect(() => {
    if (isReconnecting) {
      setShowJumpPill(false);
    }
  }, [isReconnecting]);

  useEffect(() => {
    if (messages.length === 0) {
      setShowJumpPill(false);
      messageSignatureRef.current = "";
      setIsNearBottom(true);
    }
  }, [messages.length]);

  return (
    <section className="relative flex h-full min-h-0 flex-col rounded-md border border-gray-800 bg-gray-950">
      <div className="border-b border-gray-800 px-4 py-2 text-sm text-gray-200">
        <p className="font-semibold">Codex Conversation</p>
        <p className={cn("text-xs", isConnected ? "text-cyan-400" : "text-red-400")}>
          {isReconnecting ? "Reconnecting" : isConnected ? "Connected" : "Disconnected"}
        </p>
      </div>

      <div
        className="relative flex-1 space-y-3 overflow-auto p-4"
        ref={containerRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
          const nearBottom = distance <= SCROLL_AUTO_THRESHOLD_PX;
          setIsNearBottom(nearBottom);
          if (nearBottom) {
            setShowJumpPill(false);
          }
        }}
      >
        {isReconnecting ? (
          <div className="rounded border border-amber-600/40 bg-amber-900/30 p-2 text-xs text-amber-200">
            Reconnecting to Codex relay…
          </div>
        ) : null}

        {showSkeletonPulse && isWaitingForFirstItem ? <SkeletonPulse /> : null}

        {messages.length === 0 ? (
          <div className="rounded border border-gray-800 bg-gray-900 p-3 text-xs text-gray-500">
            Send a message to start a Codex turn.
          </div>
        ) : null}

        {messages.map((message) => {
          if (message.kind === "agent") {
            return (
              <div
                key={message.id}
                className={cn(
                  "min-w-[150px] max-w-[95%] rounded-lg border p-3 text-xs",
                  messageClassName.agent,
                )}
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] text-gray-300">
                  <span className="font-semibold">Agent</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px]", classForTurnStatus(message.isStreaming ? "in_progress" : "idle"))}>
                    {message.isStreaming ? "streaming" : "complete"}
                  </span>
                </div>
                <div className="font-mono text-sm whitespace-pre-wrap">
                  {message.text}
                  {message.isStreaming ? <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-cyan-300 align-middle" /> : null}
                </div>
              </div>
            );
          }

          if (message.kind === "command") {
            return (
              <div key={message.id} className="max-w-[95%]">
                <CommandBlock
                  command={message.command}
                  cwd={message.cwd}
                  output={message.output}
                  status={message.status}
                  exitCode={message.exitCode}
                />
              </div>
            );
          }

          if (message.kind === "fileChange") {
            return (
              <div key={message.id} className="max-w-[95%]">
                <FileChangeBlock
                  files={message.files}
                  status={
                    message.status === "applied"
                      ? "applied"
                      : message.status === "declined"
                        ? "declined"
                        : "pending"
                  }
                />
              </div>
            );
          }

          if (message.kind === "system") {
            return (
              <div
                key={message.id}
                className={cn(
                  "min-w-[150px] max-w-[95%] rounded-lg border p-3 text-xs",
                  message.tone === "warn" ? "bg-amber-950 border-amber-700/60 text-amber-100" : messageClassName.system,
                )}
              >
                {message.text}
              </div>
            );
          }

          if (message.kind === "error") {
            return (
              <div
                key={message.id}
                className={cn("min-w-[150px] max-w-[95%] rounded-lg border p-3 text-xs", messageClassName.error)}
              >
                <p className="font-semibold">Error</p>
                <p>{message.text}</p>
              </div>
            );
          }

          return (
            <div
              key={message.id}
              className={cn(
                "ml-auto max-w-[95%] rounded-lg border px-3 py-2 text-xs",
                messageClassName.user,
              )}
            >
              <p className="mb-1 text-[11px] font-semibold">You</p>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          );
        })}

        {turnStatus === "in_progress" ? (
          <div className="text-[10px] text-gray-500">Turn in progress</div>
        ) : null}
      </div>

      {showJumpPill ? (
        <button
          type="button"
          onClick={() => {
            scrollToBottom();
            setShowJumpPill(false);
          }}
          className="absolute right-4 bottom-6 inline-flex items-center rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-100 shadow-lg"
        >
          ↓ New messages
        </button>
      ) : null}
    </section>
  );
}
