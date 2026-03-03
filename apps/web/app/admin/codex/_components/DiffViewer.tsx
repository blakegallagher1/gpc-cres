"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileUp } from "lucide-react";
import type { TurnDiffFile } from "../_lib/codex-protocol";

interface DiffViewerProps {
  files: TurnDiffFile[];
}

function colorLine(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "text-emerald-300";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "text-red-300";
  }
  if (line.startsWith("@@")) {
    return "text-sky-300";
  }
  return "text-gray-200";
}

function splitLines(diff: string): string[] {
  return diff.replace(/\r/g, "").split("\n");
}

export function DiffViewer({ files }: DiffViewerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const normalized = useMemo(() => files, [files]);

  if (normalized.length === 0) {
    return (
      <section className="h-full rounded-md border border-gray-800 bg-gray-900 p-3 text-xs text-gray-400">
        <p>No active diff updates.</p>
      </section>
    );
  }

  return (
    <section className="h-full overflow-y-auto rounded-md border border-gray-800 bg-gray-950 p-3">
      <div className="mb-2 text-xs font-semibold text-gray-200">Live Diff</div>
      <div className="space-y-2">
        {normalized.map((file) => {
          const sectionKey = file.path;
          const isOpen = expanded[sectionKey] ?? true;
          return (
            <div key={sectionKey} className="overflow-hidden rounded-md border border-gray-800 bg-gray-900">
              <button
                type="button"
                onClick={() => {
                  setExpanded((current) => ({
                    ...current,
                    [sectionKey]: !isOpen,
                  }));
                }}
                className="flex w-full items-center justify-between border-b border-gray-800 px-3 py-2 text-left text-xs text-gray-100"
              >
                <span className="flex items-center gap-2">
                  <FileUp className="h-3.5 w-3.5 text-gray-300" />
                  <span className="font-mono">{file.path}</span>
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen ? (
                <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap bg-black/80 p-2 font-mono text-[11px] text-gray-200">
                  {splitLines(file.lines.join("\n"))
                    .filter((line) => line.length > 0)
                    .map((line, index) => (
                      <span key={`${file.path}-${index}`} className={colorLine(line)}>
                        {line}
                        {"\n"}
                      </span>
                    ))}
                </pre>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
