"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  CodexJsonRpcId,
  CommandExecutionApprovalParams,
  FileChangeApprovalParams,
  FileChangeChunk,
} from "../_lib/codex-protocol";

export type ApprovalKind = "commandExecution" | "fileChange";

export interface ApprovalTarget {
  kind: ApprovalKind;
  requestId: CodexJsonRpcId;
  threadId: string;
  turnId: string;
  itemId: string;
  command?: string;
  cwd?: string;
  files?: FileChangeChunk[];
  reason?: string | null;
}

interface ApprovalState {
  queue: ApprovalTarget[];
}

type LegacyCommandApprovalPayload = {
  requestId?: CodexJsonRpcId;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  command?: string;
  cwd?: string;
};

type LegacyFileApprovalPayload = {
  requestId?: CodexJsonRpcId;
  threadId?: string;
  turnId?: string;
  itemId?: string;
  files?: FileChangeChunk[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asId(value: unknown): CodexJsonRpcId | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asFiles(value: unknown): FileChangeChunk[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const files: FileChangeChunk[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }
    const path = asString(entry.path);
    const diff = asString(entry.diff);
    if (!path || diff === null) {
      return null;
    }
    files.push({ path, diff });
  }
  return files;
}

function normalizeApprovalPayload(
  payload: CommandExecutionApprovalParams | FileChangeApprovalParams | LegacyCommandApprovalPayload | LegacyFileApprovalPayload,
): ApprovalTarget | null {
  if (!isRecord(payload)) {
    return null;
  }

  const requestId = asId(payload.requestId);
  const threadId = asString(payload.threadId);
  const turnId = asString(payload.turnId);
  if (requestId === null || !threadId || !turnId) {
    return null;
  }

  const itemValue = (payload as Record<string, unknown>).item;
  const reason = asString((payload as Record<string, unknown>).reason);
  if (isRecord(itemValue)) {
    if (itemValue.type === "commandExecution") {
      const itemId = asString(itemValue.id);
      const command = asString(itemValue.command) ?? "";
      const cwd = asString(itemValue.cwd) ?? "";
      if (!itemId) {
        return null;
      }
      return {
        kind: "commandExecution",
        requestId,
        threadId,
        turnId,
        itemId,
        command,
        cwd,
        reason,
      };
    }

    if (itemValue.type === "fileChange") {
      const itemId = asString(itemValue.id);
      const files = asFiles(itemValue.files) ?? [];
      if (!itemId) {
        return null;
      }
      return {
        kind: "fileChange",
        requestId,
        threadId,
        turnId,
        itemId,
        files,
        reason,
      };
    }
  }

  const legacyItemId = asString(payload.itemId);
  if (!legacyItemId) {
    return null;
  }

  const legacyFiles = asFiles((payload as LegacyFileApprovalPayload).files);
  if (legacyFiles) {
    return {
      kind: "fileChange",
      requestId,
      threadId,
      turnId,
      itemId: legacyItemId,
      files: legacyFiles,
      reason,
    };
  }

  return {
    kind: "commandExecution",
    requestId,
    threadId,
    turnId,
    itemId: legacyItemId,
    command: asString((payload as LegacyCommandApprovalPayload).command) ?? "",
    cwd: asString((payload as LegacyCommandApprovalPayload).cwd) ?? "",
    reason,
  };
}

export function useApprovals() {
  const [state, setState] = useState<ApprovalState>({ queue: [] });

  const activeApproval = useMemo(() => state.queue[0] ?? null, [state.queue]);

  const pushApproval = useCallback(
    (
      payload: CommandExecutionApprovalParams | FileChangeApprovalParams | LegacyCommandApprovalPayload | LegacyFileApprovalPayload,
    ) => {
      const target = normalizeApprovalPayload(payload);
      if (!target) {
        return;
      }

      setState((current) => {
        const exists = current.queue.some((entry) => entry.requestId === target.requestId);
        if (exists) {
          return current;
        }
        return { queue: [...current.queue, target] };
      });
    },
    [],
  );

  const popCurrent = useCallback((requestId?: CodexJsonRpcId) => {
    setState((current) => {
      if (current.queue.length === 0) {
        return current;
      }
      if (requestId !== undefined && current.queue[0]?.requestId !== requestId) {
        return {
          ...current,
          queue: current.queue.filter((entry) => entry.requestId !== requestId),
        };
      }
      return { queue: current.queue.slice(1) };
    });
  }, []);

  const clear = useCallback(() => {
    setState({ queue: [] });
  }, []);

  return {
    activeApproval,
    approvalCount: state.queue.length,
    approvalQueue: state.queue,
    pushApproval,
    popCurrent,
    clear,
  };
}
