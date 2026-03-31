'use client';

import {
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { ArrowUp, Command, Paperclip, Square, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatOperatorFileSize } from '@/lib/formatters/operatorFormatters';
import { cn } from '@/lib/utils';

const MAX_FILES = 5;
const ACCEPTED_FILE_TYPES =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.tiff,.tif';

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
  const hasQueuedContent =
    ((textareaRef.current?.value ?? draft).trim().length > 0) || pendingFiles.length > 0;

  return (
    <form
      className="relative shrink-0 px-4 pb-4 pt-3 sm:px-5"
      onSubmit={handleFormSubmit}
    >
      <div className="glow-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/16 to-transparent" />

      {orientationHint ? (
        <div className="mx-auto mb-3 flex max-w-5xl items-start gap-3 rounded-[22px] border border-border/60 bg-background/90 px-4 py-3 text-xs text-muted-foreground shadow-[0_18px_45px_-36px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <span className="rounded-full border border-border/60 bg-muted/[0.45] px-2.5 py-1 font-mono uppercase tracking-[0.18em] text-foreground/85">
            Prompt
          </span>
          <p className="leading-5">{orientationHint}</p>
        </div>
      ) : null}

      {pendingFiles.length > 0 && (
        <div className="mx-auto mb-2 flex max-w-4xl flex-wrap gap-2">
          {pendingFiles.map((file, index) => (
            <Badge
              key={`${file.name}-${index}`}
              variant="secondary"
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] shadow-sm"
            >
              <span className="max-w-[180px] truncate font-normal text-foreground">
                {file.name}
              </span>
              <span className="font-normal text-muted-foreground">
                ({formatOperatorFileSize(file.size)})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeFile(index)}
                className="ml-1 h-5 w-5 rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      <div className="mx-auto max-w-5xl rounded-[28px] border border-border/60 bg-background/95 p-3 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-[border-color,box-shadow] focus-within:border-foreground/20 focus-within:shadow-[0_28px_80px_-46px_rgba(15,23,42,0.52)]">
        <div className="flex items-start gap-3">
          {canAttachFiles && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 h-11 w-11 shrink-0 rounded-2xl border border-border/60 bg-muted/[0.38] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || pendingFiles.length >= MAX_FILES}
                aria-label={
                  pendingFiles.length >= MAX_FILES
                    ? `Attach files disabled. Maximum ${MAX_FILES} files reached.`
                    : 'Attach files'
                }
                title={
                  pendingFiles.length >= MAX_FILES
                    ? `Max ${MAX_FILES} files`
                    : 'Attach files'
                }
              >
                <Paperclip className="h-4.5 w-4.5" />
              </Button>
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

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 px-2 pb-2">
              <div className="min-w-0">
                <p className="text-sm font-medium tracking-[-0.02em] text-foreground">
                  Run composer
                </p>
                <p className="text-xs text-muted-foreground">
                  Name the scope, output, and constraints once.
                </p>
              </div>
              <Badge
                variant="outline"
                className="hidden rounded-full border-border/70 bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline-flex"
              >
                {isStreaming ? 'Streaming' : 'Ready'}
              </Badge>
            </div>

            <div className="rounded-[24px] border border-border/60 bg-muted/[0.32] px-3 py-2 transition-colors focus-within:border-foreground/20 focus-within:bg-background/78">
              <Textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                placeholder={placeholder}
                className={cn(
                  'min-h-[72px] resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 shadow-none',
                  'text-foreground placeholder:text-muted-foreground/75 focus-visible:ring-0',
                  'disabled:cursor-not-allowed disabled:opacity-50',
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

              <div className="flex flex-col gap-3 border-t border-border/50 px-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                    <Command className="h-3.5 w-3.5" />
                    Enter sends
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                    Shift+Enter adds a line
                  </span>
                  {canAttachFiles ? (
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                      {pendingFiles.length}/{MAX_FILES} attachments
                    </span>
                  ) : null}
                </div>

                {isStreaming ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-10 shrink-0 rounded-2xl px-4"
                    onClick={onStop}
                  >
                    <Square className="h-4 w-4" />
                    <span className="ml-2">Stop run</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className={cn(
                      'h-10 shrink-0 rounded-2xl px-4 shadow-sm',
                      !hasQueuedContent && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:bg-primary',
                    )}
                    type="submit"
                    aria-disabled={!hasQueuedContent}
                  >
                    <ArrowUp className="mr-1.5 h-4 w-4" />
                    {submitLabel}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-3 max-w-5xl px-2 text-center text-[11px] leading-5 text-muted-foreground">
          {helperText}
        </p>
      </div>
    </form>
  );
}
