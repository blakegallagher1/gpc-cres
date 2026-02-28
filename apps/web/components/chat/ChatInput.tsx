'use client';

import {
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
  type FormEvent,
} from 'react';
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
  const [draft, setDraft] = useState('');
  const isComposing = useRef(false);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Clamp to max ~5 rows (approx 120px)
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      resize();
    },
    [resize]
  );

  const submit = useCallback(() => {
    if (isStreaming) return;

    const el = textareaRef.current;
    if (!el) return;
    const value = draft.trim();
    if (!value) return;

    onSend(value);
    setDraft('');

    el.style.height = 'auto';
    el.focus();
  }, [onSend, isStreaming, resize, draft]);

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
      className="border-t border-neutral-200/70 bg-white/80 px-4 py-4 dark:border-neutral-800/70 dark:bg-neutral-950/70"
      onSubmit={handleFormSubmit}
    >
      <div className="mx-auto flex w-full max-w-4xl items-end gap-3 rounded-full border border-neutral-200 bg-neutral-100/90 px-3 py-2 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={draft}
            rows={1}
            placeholder="Ask something complex..."
            className={cn(
              'w-full resize-none bg-transparent px-3 py-2 text-sm',
              'placeholder:text-neutral-500',
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
            className="h-10 shrink-0 rounded-full px-4"
            onClick={onStop}
          >
            <Square className="h-4 w-4" />
            <span className="ml-2">Stop</span>
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-10 shrink-0 rounded-full px-5"
            type="submit"
          >
            <ArrowUp className="mr-1.5 h-4 w-4" />
            Send
          </Button>
        )}
      </div>

      <p className="mx-auto mt-2 max-w-4xl text-center text-[10px] text-muted-foreground/60">
        AI agents may make mistakes. Always verify critical data.
      </p>
    </form>
  );
}
