'use client';

import {
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { ArrowUp, Paperclip, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_FILES = 5;
const ACCEPTED_FILE_TYPES =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.tiff,.tif';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface ChatInputProps {
  onSend: (content: string, files?: File[]) => void;
  isStreaming: boolean;
  onStop: () => void;
  canAttachFiles?: boolean;
}

export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  canAttachFiles = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const isComposing = useRef(false);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      resize();
    },
    [resize]
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      setPendingFiles((current) => [...current, ...files].slice(0, MAX_FILES));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    []
  );

  const removeFile = useCallback((index: number) => {
    setPendingFiles((current) => current.filter((_, i) => i !== index));
  }, []);

  const submit = useCallback(() => {
    if (isStreaming) return;

    const el = textareaRef.current;
    if (!el) return;
    const value = (el.value || draft).trim();
    if (!value && pendingFiles.length === 0) return;

    onSend(value || '', pendingFiles.length > 0 ? pendingFiles : undefined);
    setDraft('');
    setPendingFiles([]);

    el.style.height = 'auto';
    el.focus();
  }, [onSend, isStreaming, draft, pendingFiles]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        (e.key === 'Enter' || e.code === 'Enter') &&
        !e.shiftKey &&
        !isComposing.current
      ) {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }
    },
    [submit]
  );

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit]
  );

  return (
    <form
      className="relative bg-gradient-to-t from-[#0c0e14] to-[#0c0e14]/80 px-4 pb-4 pt-2"
      onSubmit={handleFormSubmit}
    >
      {/* Subtle glow line */}
      <div className="glow-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

      {/* File preview strip */}
      {pendingFiles.length > 0 && (
        <div className="mx-auto mb-2 flex max-w-4xl flex-wrap gap-2">
          {pendingFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-1.5 rounded-lg border border-[#2a2f3e] bg-[#1a1d28] px-2.5 py-1.5 text-xs text-slate-300"
            >
              <span className="max-w-[180px] truncate">{file.name}</span>
              <span className="text-slate-500">
                ({formatFileSize(file.size)})
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="ml-1 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-4xl items-end gap-3 rounded-xl border border-[#2a2f3e] bg-[#1a1d28]/80 px-3 py-2 shadow-lg backdrop-blur-md transition-colors focus-within:border-blue-500/30">
        {canAttachFiles && (
          <>
            <button
              type="button"
              className="shrink-0 p-2 text-slate-500 transition-colors hover:text-slate-300 disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || pendingFiles.length >= MAX_FILES}
              title={
                pendingFiles.length >= MAX_FILES
                  ? `Max ${MAX_FILES} files`
                  : 'Attach files'
              }
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            placeholder="Ask something complex..."
            className={cn(
              'w-full resize-none bg-transparent px-3 py-2 text-sm',
              'text-slate-100 placeholder:text-slate-500',
              'focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposing.current = true;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
            }}
            disabled={isStreaming}
          />
        </div>

        {isStreaming ? (
          <Button
            size="sm"
            variant="destructive"
            className="h-9 shrink-0 rounded-lg bg-red-900/80 px-4 hover:bg-red-800"
            onClick={onStop}
          >
            <Square className="h-4 w-4" />
            <span className="ml-2">Stop</span>
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-9 shrink-0 rounded-lg bg-blue-600 px-4 shadow-lg shadow-blue-600/20 hover:bg-blue-500"
            type="submit"
          >
            <ArrowUp className="mr-1.5 h-4 w-4" />
            Send
          </Button>
        )}
      </div>

      <p className="mx-auto mt-2 max-w-4xl text-center font-mono text-[10px] text-slate-600">
        AI agents may make mistakes. Always verify critical data.
      </p>
    </form>
  );
}
