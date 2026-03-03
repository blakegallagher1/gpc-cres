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
}

interface ApprovalState {
  queue: ApprovalTarget[];
}

export function useApprovals() {
  const [state, setState] = useState<ApprovalState>({ queue: [] });

  const activeApproval = useMemo(() => state.queue[0] ?? null, [state.queue]);

  const pushApproval = useCallback(
    (payload: CommandExecutionApprovalParams | FileChangeApprovalParams) => {
      const target: ApprovalTarget =
        payload.item.type === "commandExecution"
          ? {
              kind: "commandExecution",
              requestId: payload.requestId,
              threadId: payload.threadId,
              turnId: payload.turnId,
              itemId: payload.item.id,
              command: payload.item.command,
              cwd: payload.item.cwd,
            }
          : {
              kind: "fileChange",
              requestId: payload.requestId,
              threadId: payload.threadId,
              turnId: payload.turnId,
              itemId: payload.item.id,
              files: payload.item.files,
            };

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
