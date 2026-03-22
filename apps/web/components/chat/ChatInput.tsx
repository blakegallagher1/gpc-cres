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
  orientationHint?: string;
  placeholder?: string;
  helperText?: string;
  submitLabel?: string;
}

/**
 * Shared chat composer used across the primary chat and map copilot surfaces.
 */
export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  canAttachFiles = false,
  orientationHint,
  placeholder = "Ask something complex...",
  helperText = "AI agents may make mistakes. Always verify critical data.",
  submitLabel = "Send",
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
      className="relative shrink-0 border-t border-border/60 bg-background/78 px-4 pb-4 pt-3 backdrop-blur-xl"
      onSubmit={handleFormSubmit}
    >
      <div className="glow-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />

      {orientationHint ? (
        <div className="mx-auto mb-2 flex max-w-5xl items-start gap-3 rounded-2xl border border-border/60 bg-background/65 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.18em] text-foreground/85">
            Prompt
          </span>
          <p className="leading-5">{orientationHint}</p>
        </div>
      ) : null}

      {pendingFiles.length > 0 && (
        <div className="mx-auto mb-2 flex max-w-4xl flex-wrap gap-2">
          {pendingFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs text-foreground/85"
            >
              <span className="max-w-[180px] truncate">{file.name}</span>
              <span className="text-muted-foreground">
                ({formatFileSize(file.size)})
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="ml-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-5xl items-end gap-3 rounded-[1.35rem] border border-border/70 bg-background/82 px-3 py-2 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.4)] backdrop-blur-md transition-colors focus-within:border-foreground/20">
        {canAttachFiles && (
          <>
            <button
              type="button"
              className="shrink-0 p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
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
            placeholder={placeholder}
            className={cn(
              'w-full resize-none bg-transparent px-3 py-2 text-sm',
              'text-foreground placeholder:text-muted-foreground',
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
            className="h-9 shrink-0 rounded-xl px-4"
            onClick={onStop}
          >
            <Square className="h-4 w-4" />
            <span className="ml-2">Stop</span>
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-9 shrink-0 rounded-xl px-4"
            type="submit"
          >
            <ArrowUp className="mr-1.5 h-4 w-4" />
            {submitLabel}
          </Button>
        )}
      </div>

      <p className="mx-auto mt-2 max-w-5xl text-center font-mono text-[10px] leading-5 text-muted-foreground">
        {helperText}
      </p>
    </form>
  );
}
