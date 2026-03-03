"use client";

import { FolderOpenDot, PlayCircle, RefreshCcw, Trash2 } from "lucide-react";
import type { ThreadSummary } from "../_lib/codex-protocol";

interface ThreadSidebarProps {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  isLoadingThreads: boolean;
  onResume: (threadId: string) => void;
  onArchive: (threadId: string) => void;
  onNewThread: () => void;
}

function shortThreadId(threadId: string): string {
  return threadId.slice(0, 8);
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  isLoadingThreads,
  onResume,
  onArchive,
  onNewThread,
}: ThreadSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col rounded-md border border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <div className="text-sm font-semibold text-gray-100">Threads</div>
        <button
          type="button"
          onClick={onNewThread}
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100 transition hover:border-gray-500"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          New Thread
        </button>
      </div>

      {isLoadingThreads ? (
        <div className="p-3 text-xs text-gray-400">Loading threads…</div>
      ) : threads.length === 0 ? (
        <div className="p-3 text-xs text-gray-500">No threads found.</div>
      ) : (
        <div className="flex-1 overflow-auto p-2">
          <div className="space-y-2">
            {threads.map((thread) => {
              const isActive = activeThreadId === thread.threadId;
              return (
                <div
                  key={thread.threadId}
                  className={`rounded-md border p-2 ${
                    isActive ? "border-cyan-500/70 bg-cyan-900/20" : "border-gray-700 bg-gray-950"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-gray-100">{thread.title ?? "Untitled thread"}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                        <FolderOpenDot className="h-3 w-3" />
                        {shortThreadId(thread.threadId)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-300 transition hover:border-gray-500 hover:text-gray-100"
                      onClick={() => {
                        onResume(thread.threadId);
                      }}
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                    <span>{thread.model ?? "unknown"}</span>
                    <button
                      type="button"
                      className="rounded border border-red-700/70 px-2 py-0.5 text-[10px] text-red-200 transition hover:bg-red-950/40"
                      onClick={() => {
                        onArchive(thread.threadId);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
