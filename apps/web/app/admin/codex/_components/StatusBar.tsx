import { cn } from "@/lib/utils";

interface StatusBarProps {
  connectionStatus: string;
  isConnected: boolean;
  threadId: string | null;
  modelName: string;
  turnStatus: "idle" | "in_progress" | "waiting on approval";
  isReconnecting: boolean;
  waitingOnApproval: boolean;
}

export function StatusBar({
  connectionStatus,
  isConnected,
  threadId,
  modelName,
  turnStatus,
  isReconnecting,
  waitingOnApproval,
}: StatusBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-300">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            isConnected ? "animate-pulse bg-emerald-400" : "bg-red-500",
          )}
        />
        <span>{connectionStatus}</span>
        {isReconnecting ? <span className="text-amber-300">Reconnecting...</span> : null}
        {waitingOnApproval ? (
          <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-amber-200 animate-pulse">
            Waiting on approval
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-gray-400">Thread:</span>
        <span className="font-mono text-gray-200">{threadId ?? "none"}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-gray-400">Model:</span>
        <span className="text-gray-200">{modelName}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-gray-400">Turn:</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px]",
            turnStatus === "idle"
              ? "border border-gray-600 text-gray-300"
              : turnStatus === "in_progress"
                ? "border border-cyan-600/80 bg-cyan-600/10 text-cyan-200"
                : "border border-amber-600/90 bg-amber-700/15 text-amber-200",
          )}
        >
          {turnStatus}
        </span>
      </div>
    </div>
  );
}
