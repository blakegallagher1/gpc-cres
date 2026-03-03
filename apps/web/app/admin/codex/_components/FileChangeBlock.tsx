import { useMemo, useState } from "react";
import type { FileChangeChunk } from "../_lib/codex-protocol";
import { CheckCircle2, FileWarning, GitCommit } from "lucide-react";

interface FileChangeBlockProps {
  files: FileChangeChunk[];
  status: "pending" | "applied" | "declined";
}

function splitLines(diff: string): string[] {
  return diff
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.length > 0);
}

export function FileChangeBlock({ files, status }: FileChangeBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const previewLines = useMemo(
    () =>
      files.flatMap((file) => {
        const lines = splitLines(file.diff);
        const preview = lines.slice(0, 5);
        return [`--- ${file.path}`, ...preview];
      }),
    [files],
  );

  return (
    <div className="w-full rounded-lg border border-indigo-700/40 bg-slate-950/80 p-3">
      <button type="button" className="w-full text-left" onClick={() => setExpanded((current) => !current)}>
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 text-slate-100">
            <GitCommit className="h-4 w-4 text-indigo-300" />
            <span className="font-semibold">File Change</span>
            <span className="font-mono text-xs text-slate-400">{files.length} files</span>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              status === "applied"
                ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-200"
                : status === "declined"
                  ? "border-red-500/40 bg-red-950/50 text-red-200"
                  : "border-yellow-500/50 bg-yellow-900/30 text-yellow-200"
            }`}
          >
            {status}
          </span>
        </div>
        <div className="mt-2 text-xs text-slate-300">
          {previewLines.length > 0 ? (
            <span className="font-mono">
              {previewLines.join("\n").slice(0, 220)}
              {previewLines.length > 5 ? "..." : ""}
            </span>
          ) : (
            <span className="font-mono text-slate-500">No diff preview</span>
          )}
        </div>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3">
          {files.map((file) => {
            const lines = splitLines(file.diff);
            return (
              <div key={file.path} className="rounded-md border border-slate-700/70 bg-black/55 p-2">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-200">
                  <FileWarning className="h-3.5 w-3.5" />
                  <span className="font-mono">{file.path}</span>
                </div>
                <pre className="max-h-52 overflow-auto rounded border border-slate-700/50 bg-black/70 p-2 font-mono text-[11px] whitespace-pre-wrap text-slate-200">
                  {lines.length > 0 ? lines.join("\n") : "(empty diff)"}
                </pre>
              </div>
            );
          })}
          {status === "applied" ? (
            <div className="flex items-center gap-2 text-xs text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Applied</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
