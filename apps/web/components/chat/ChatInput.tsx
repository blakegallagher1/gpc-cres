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
    const value = (el.value || draft).trim();
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
      className="relative bg-gradient-to-t from-[#0c0e14] to-[#0c0e14]/80 px-4 pb-4 pt-2"
      onSubmit={handleFormSubmit}
    >
      {/* Subtle glow line */}
      <div className="glow-line absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

      <div className="mx-auto flex w-full max-w-4xl items-end gap-3 rounded-xl border border-[#2a2f3e] bg-[#1a1d28]/80 px-3 py-2 shadow-lg backdrop-blur-md transition-colors focus-within:border-blue-500/30">
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
