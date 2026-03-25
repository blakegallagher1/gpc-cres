"use client";

import { Send } from "lucide-react";

interface InputBarProps {
  value: string;
  disabled: boolean;
  isLoading: boolean;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}

export function InputBar({ value, disabled, isLoading, onValueChange, onSubmit }: InputBarProps) {
  return (
    <div className="border-t border-gray-800 bg-gray-900 px-3 py-2">
      <div className="flex items-end gap-2">
        <label htmlFor="admin-codex-input" className="sr-only">
          Message
        </label>
        <textarea
          id="admin-codex-input"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={isLoading ? "Steering active turn..." : "Ask Codex..."}
          rows={3}
          className="min-h-[60px] w-full resize-none rounded-md border border-gray-700 bg-gray-950 p-2 text-sm text-gray-100 focus:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70 focus-visible:ring-offset-0"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || value.trim().length === 0}
          className="rounded-md border border-cyan-500/70 bg-cyan-700/20 p-2.5 text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-right text-[11px] text-gray-500">Cmd/Ctrl+Enter to send</p>
    </div>
  );
}
