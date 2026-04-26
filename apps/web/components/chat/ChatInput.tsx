'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Globe,
  Mic,
  MousePointerClick,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatOperatorFileSize } from '@/lib/formatters/operatorFormatters';
import {
  getResearchLaneLabel,
  inferResearchLane,
  type ResearchLaneSelection,
} from '@/lib/agent/researchRouting';
import { cn } from '@/lib/utils';

const MAX_FILES = 5;
const ACCEPTED_FILE_TYPES =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.tiff,.tif';

type ComposerPreset = {
  id: string;
  label: string;
  hint: string;
  icon: typeof Sparkles;
  template: string;
};

const COMPOSER_PRESETS: ComposerPreset[] = [
  {
    id: 'deliverable',
    label: 'Deliverable',
    hint: 'Frame the output, audience, and tone.',
    icon: FileText,
    template: 'Deliverable:\nAudience:\nTone:\nSuccess bar:\n',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    hint: 'State proof sources and what still needs verification.',
    icon: ShieldCheck,
    template: 'Evidence to use:\nEvidence still missing:\nVerification standard:\n',
  },
  {
    id: 'strategy',
    label: 'Strategy',
    hint: 'Ask for options, tradeoffs, and the recommended path.',
    icon: Sparkles,
    template: 'Decision to make:\nOptions to compare:\nRecommendation criteria:\n',
  },
];

interface ChatInputProps {
  onSend: (content: string, files?: File[], options?: ChatSendOptions) => void;
  isStreaming: boolean;
  onStop: () => void;
  canAttachFiles?: boolean;
  injectedPrompt?: {
    id: string;
    text: string;
  } | null;
  orientationHint?: string;
  placeholder?: string;
  helperText?: string;
  submitLabel?: string;
}

export type ChatSendOptions = {
  researchLane?: ResearchLaneSelection;
};

type ResearchLaneOption = {
  id: ResearchLaneSelection;
  label: string;
  hint: string;
  icon: typeof Database;
};

const RESEARCH_LANE_OPTIONS: ResearchLaneOption[] = [
  { id: 'auto', label: 'Auto', hint: 'Infer the best lane from the prompt.', icon: Sparkles },
  { id: 'local_first', label: 'Database + knowledge', hint: 'Start with internal data and stored evidence.', icon: Database },
  { id: 'public_web', label: 'Web research', hint: 'Use Perplexity for public sources and current context.', icon: Globe },
  { id: 'interactive_browser', label: 'Interactive browser', hint: 'Use CUA only when clicks, logins, or forms are required.', icon: MousePointerClick },
];

export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  canAttachFiles = false,
  injectedPrompt,
  placeholder = 'Ask the coordinator. Use @agent to target a specialist.',
  submitLabel = 'Dispatch →',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [researchLane, setResearchLane] = useState<ResearchLaneSelection>('auto');
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const isComposing = useRef(false);
  const lastInjectedPromptIdRef = useRef<string | null>(null);

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
    [resize],
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      setPendingFiles((current) => [...current, ...files].slice(0, MAX_FILES));
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
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

    onSend(value || '', pendingFiles.length > 0 ? pendingFiles : undefined, { researchLane });
    setDraft('');
    setPendingFiles([]);
    el.style.height = 'auto';
    el.focus();
  }, [onSend, isStreaming, draft, pendingFiles, researchLane]);

  const applyPreset = useCallback(
    (template: string) => {
      setDraft((current) => {
        const nextDraft = current.trim().length > 0 ? `${current.trimEnd()}\n\n${template}` : template;
        requestAnimationFrame(() => { textareaRef.current?.focus(); resize(); });
        return nextDraft;
      });
    },
    [resize],
  );

  useEffect(() => {
    if (!injectedPrompt || injectedPrompt.id === lastInjectedPromptIdRef.current) return;
    lastInjectedPromptIdRef.current = injectedPrompt.id;
    setDraft((current) => {
      const nextDraft = current.trim().length > 0
        ? `${current.trimEnd()}\n\n${injectedPrompt.text}`
        : injectedPrompt.text;
      requestAnimationFrame(() => { textareaRef.current?.focus(); resize(); });
      return nextDraft;
    });
  }, [injectedPrompt, resize]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) && !isComposing.current) {
        e.preventDefault();
        e.stopPropagation();
        submit();
      }
    },
    [submit],
  );

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  const hasQueuedContent =
    ((textareaRef.current?.value ?? draft).trim().length > 0) || pendingFiles.length > 0;
  const trimmedDraft = (textareaRef.current?.value ?? draft).trim();
  const inferredLane = inferResearchLane(trimmedDraft);
  const effectiveLane = researchLane === 'auto' ? inferredLane : researchLane;
  const laneStatusLabel =
    researchLane === 'auto'
      ? `Auto → ${getResearchLaneLabel(inferredLane)}`
      : `Locked → ${getResearchLaneLabel(researchLane)}`;
  const shouldShowAdvancedControls = showAdvancedControls || researchLane !== 'auto';

  return (
    <form
      data-testid="chat-composer"
      className="relative shrink-0 px-3 pb-4 pt-3 sm:px-6 lg:px-9"
      onSubmit={handleFormSubmit}
    >
      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingFiles.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-panel px-2.5 py-1 font-mono text-[10.5px] text-ink-soft"
            >
              <span className="max-w-[180px] truncate">{file.name}</span>
              <span className="text-ink-fade">({formatOperatorFileSize(file.size)})</span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="ml-1 text-ink-fade hover:text-ink"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded border border-rule-soft bg-paper-panel ed-shadow-md">
        {/* Scope chip row */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1.5 pt-2.5">
          <span className="rounded-full border border-rule bg-paper-soft px-2.5 py-1 font-mono text-[10.5px] tracking-[0.04em] text-ink-fade">
            {laneStatusLabel}
          </span>

          {/* Advanced controls toggle */}
          <button
            type="button"
            onClick={() => setShowAdvancedControls((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-rule px-2 py-1 font-mono text-[10.5px] text-ink-fade transition-colors hover:text-ink"
            aria-expanded={shouldShowAdvancedControls}
          >
            {shouldShowAdvancedControls ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Controls
          </button>
        </div>

        {/* Advanced controls panel */}
        {shouldShowAdvancedControls && (
          <div className="border-t border-rule-soft bg-paper-soft px-3 py-3">
            {/* Presets */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {COMPOSER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.template)}
                  className="rounded-full border border-rule bg-paper-panel px-2.5 py-1 font-mono text-[10.5px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Research lanes */}
            <p className="ed-eyebrow mb-2">Research lane</p>
            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
              {RESEARCH_LANE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = researchLane === option.id;
                const isEffective = effectiveLane === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setResearchLane(option.id)}
                    className={cn(
                      'rounded border px-3 py-2.5 text-left transition-colors',
                      isSelected
                        ? 'border-ink bg-paper-panel ed-shadow-sm'
                        : 'border-rule bg-paper-panel hover:border-ink',
                    )}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="h-3.5 w-3.5 text-ink-soft" />
                      {isEffective && (
                        <span className="rounded-full border border-rule bg-paper-inset px-1.5 py-px font-mono text-[9px] text-ink-fade">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[12px] font-medium text-ink">{option.label}</p>
                    <p className="mt-0.5 text-[10.5px] leading-[1.4] text-ink-fade">{option.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          data-testid="chat-composer-input"
          aria-label="Run brief input"
          value={draft}
          rows={2}
          placeholder={placeholder}
          className="min-h-[60px] w-full resize-none border-0 bg-transparent px-3.5 pb-2.5 pt-1 font-sans text-[14px] leading-[1.5] text-ink shadow-none outline-none placeholder:text-ink-fade focus-visible:ring-0"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; }}
          disabled={isStreaming}
        />

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-rule-soft bg-paper-soft px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5">
            {canAttachFiles && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded text-ink-fade hover:text-ink"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || pendingFiles.length >= MAX_FILES}
                  aria-label="Attach files"
                >
                  <Paperclip className="h-3.5 w-3.5" />
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
            <span className="mx-1 hidden h-4 w-px bg-rule sm:block" />
            <div className="hidden items-center gap-1.5 sm:flex">
              <Kbd>⌘↵</Kbd>
              <span className="text-[11px] text-ink-fade">dispatch</span>
              <Dot />
              <Kbd>@</Kbd>
              <span className="text-[11px] text-ink-fade">target agent</span>
            </div>
          </div>

          {isStreaming ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 w-full rounded px-3 text-[12px] sm:h-7 sm:w-auto"
              onClick={onStop}
            >
              <Square className="mr-1 h-3 w-3" />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              data-testid="chat-composer-submit"
              disabled={!hasQueuedContent}
              className="h-8 w-full rounded bg-ink px-3.5 text-[12.5px] font-semibold text-paper-panel hover:bg-ink/90 disabled:opacity-40 sm:h-7 sm:w-auto"
              aria-disabled={!hasQueuedContent}
            >
              {submitLabel}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-rule bg-paper-panel px-1.5 py-px font-mono text-[10px] text-ink-soft">
      {children}
    </kbd>
  );
}

function Dot() {
  return <span className="mx-1 h-[2px] w-[2px] rounded-full bg-ink-fade opacity-50" />;
}
