import { useState } from "react";
import { CheckCircle, CircleDashed, TerminalSquare } from "lucide-react";

interface CommandBlockProps {
  command: string;
  cwd: string;
  output: string;
  status?: "running" | "completed" | "failed";
  exitCode?: number | null;
}

export function CommandBlock({ command, cwd, output, status = "completed", exitCode }: CommandBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full rounded-lg border border-emerald-700/40 bg-gray-950/80 p-3">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setExpanded((current) => !current)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <TerminalSquare className="h-4 w-4 text-emerald-300" />
            <span className="font-semibold">Command Execution</span>
            <span className="font-mono text-xs text-slate-400">{status === "running" ? "running" : "result"}</span>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              status === "failed"
                ? "border-red-500/60 bg-red-950/40 text-red-200"
                : status === "running"
                  ? "border-yellow-500/50 bg-yellow-950/30 text-yellow-200"
                  : "border-emerald-500/50 bg-emerald-950/30 text-emerald-200"
            }`}
          >
            {status}
          </span>
        </div>
        <div className="mt-2 font-mono text-xs text-slate-300 break-all">{command}</div>
        <div className="mt-1 text-xs text-slate-400">cwd: {cwd}</div>
      </button>

      {expanded ? (
        <div className="mt-3 rounded-md border border-slate-700/70 bg-black/60 p-2 text-xs">
          <pre className="font-mono whitespace-pre-wrap text-slate-200">{output || "(no output yet)"}</pre>
          {exitCode !== undefined && exitCode !== null && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              {exitCode === 0 ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-300" />
              ) : (
                <CircleDashed className="h-3.5 w-3.5 text-red-300" />
              )}
              <span className={exitCode === 0 ? "text-emerald-200" : "text-red-200"}>
                Exit code: {exitCode}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
