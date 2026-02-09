'use client';

import { useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  onStop: () => void;
}

export function ChatInput({ onSend, isStreaming, onStop }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Clamp to max ~5 rows (approx 120px)
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      void e; // value read from ref on submit
      resize();
    },
    [resize]
  );

  const submit = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value.trim();
    if (!value || isStreaming) return;
    onSend(value);
    el.value = '';
    resize();
    el.focus();
  }, [onSend, isStreaming, resize]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask about parcels, deals, zoning..."
            className={cn(
              'w-full resize-none rounded-xl border bg-muted/50 px-4 py-3 pr-12 text-sm',
              'placeholder:text-muted-foreground/60',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
          />
        </div>

        {isStreaming ? (
          <Button
            size="icon"
            variant="destructive"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={onStop}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            onClick={submit}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="mx-auto mt-1.5 max-w-3xl text-center text-[10px] text-muted-foreground/50">
        AI agents may make mistakes. Always verify critical data.
      </p>
    </div>
  );
}
