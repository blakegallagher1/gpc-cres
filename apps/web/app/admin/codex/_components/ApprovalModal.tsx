"use client";

import { X } from "lucide-react";
import { useMemo } from "react";
import type { ApprovalTarget } from "../_hooks/useApprovals";

type ApprovalAction = "accept" | "acceptForSession" | "decline" | "cancel";

interface ApprovalModalProps {
  approval: ApprovalTarget | null;
  onAction: (action: ApprovalAction) => void;
}

function splitLines(diff: string): string[] {
  return diff
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.length > 0);
}

export function ApprovalModal({ approval, onAction }: ApprovalModalProps) {
  const filePreviews = useMemo(() => {
    if (!approval || approval.kind !== "fileChange" || !approval.files) {
      return [] as string[];
    }

    return approval.files.flatMap((entry) => {
      const lines = splitLines(entry.diff);
      return [`--- ${entry.path}`, ...lines.slice(0, 3)];
    });
  }, [approval]);

  if (!approval) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-md border border-gray-700 bg-gray-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-100">Approval Required</h2>
          <button
            type="button"
            onClick={() => onAction("cancel")}
            className="rounded border border-gray-700 p-1 text-gray-300 hover:bg-gray-800"
            aria-label="Close approval modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {approval.kind === "commandExecution" ? (
          <div className="space-y-2 text-xs">
            <p className="text-gray-300">Command execution request</p>
            <pre className="rounded border border-amber-600/40 bg-black/60 p-2 font-mono text-xs text-gray-200 whitespace-pre-wrap">
              {approval.command}
            </pre>
            <p className="text-gray-400">cwd: {approval.cwd}</p>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <p className="text-gray-300">File-change request</p>
            <div className="space-y-2 rounded border border-indigo-600/40 bg-black/60 p-2">
              {approval.files?.map((file) => {
                const lines = splitLines(file.diff);
                return (
                  <div key={file.path} className="space-y-1">
                    <p className="font-mono text-gray-200">{file.path}</p>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-gray-200">
                      {lines.length > 0 ? lines.slice(0, 10).join("\n") : "(empty diff)"}
                    </pre>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400">Preview: {filePreviews.slice(0, 10).join(" ")}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onAction("decline")}
            className="rounded border border-red-700/70 bg-red-900/20 px-3 py-1.5 text-xs font-medium text-red-200"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => onAction("acceptForSession")}
            className="rounded border border-cyan-700/80 bg-cyan-900/20 px-3 py-1.5 text-xs font-medium text-cyan-100"
          >
            Approve All Session
          </button>
          <button
            type="button"
            onClick={() => onAction("accept")}
            className="rounded border border-emerald-700/80 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-100"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
