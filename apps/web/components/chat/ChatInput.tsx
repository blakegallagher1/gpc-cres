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
  Command,
  Database,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  MousePointerClick,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
    template:
      'Deliverable:\nAudience:\nTone:\nSuccess bar:\n',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    hint: 'State proof sources and what still needs verification.',
    icon: ShieldCheck,
    template:
      'Evidence to use:\nEvidence still missing:\nVerification standard:\n',
  },
  {
    id: 'strategy',
    label: 'Strategy',
    hint: 'Ask for options, tradeoffs, and the recommended path.',
    icon: Sparkles,
    template:
      'Decision to make:\nOptions to compare:\nRecommendation criteria:\n',
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
  {
    id: 'auto',
    label: 'Auto',
    hint: 'Infer the best lane from the prompt.',
    icon: Sparkles,
  },
  {
    id: 'local_first',
    label: 'Database + knowledge',
    hint: 'Start with internal data and stored evidence.',
    icon: Database,
  },
  {
    id: 'public_web',
    label: 'Web research',
    hint: 'Use Perplexity for public sources and current context.',
    icon: Globe,
  },
  {
    id: 'interactive_browser',
    label: 'Interactive browser',
    hint: 'Use CUA only when clicks, logins, or forms are required.',
    icon: MousePointerClick,
  },
];

/**
 * Shared chat composer used across the primary chat and map copilot surfaces.
 */
export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  canAttachFiles = false,
  injectedPrompt,
  orientationHint,
  placeholder = "Ask anything about your properties, deals, evidence, or next move...",
  helperText = "Start in plain English. Add files or open advanced controls only when you need to.",
  submitLabel = "Send",
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

    onSend(value || '', pendingFiles.length > 0 ? pendingFiles : undefined, {
      researchLane,
    });
    setDraft('');
    setPendingFiles([]);

    el.style.height = 'auto';
    el.focus();
  }, [onSend, isStreaming, draft, pendingFiles, researchLane]);

  const applyPreset = useCallback(
    (template: string) => {
      setDraft((current) => {
        const nextDraft = current.trim().length > 0 ? `${current.trimEnd()}\n\n${template}` : template;
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
          resize();
        });
        return nextDraft;
      });
    },
    [resize]
  );

  useEffect(() => {
    if (!injectedPrompt || injectedPrompt.id === lastInjectedPromptIdRef.current) {
      return;
    }

    lastInjectedPromptIdRef.current = injectedPrompt.id;
    setDraft((current) => {
      const nextDraft =
        current.trim().length > 0
          ? `${current.trimEnd()}\n\n${injectedPrompt.text}`
          : injectedPrompt.text;
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        resize();
      });
      return nextDraft;
    });
  }, [injectedPrompt, resize]);

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
  const trimmedDraft = (textareaRef.current?.value ?? draft).trim();
  const inferredLane = inferResearchLane(trimmedDraft);
  const effectiveLane = researchLane === 'auto' ? inferredLane : researchLane;
  const laneStatusLabel =
    researchLane === 'auto'
      ? `Auto -> ${getResearchLaneLabel(inferredLane)}`
      : `Locked -> ${getResearchLaneLabel(researchLane)}`;
  const wordCount = trimmedDraft.length > 0 ? trimmedDraft.split(/\s+/).length : 0;
  const characterCount = trimmedDraft.length;
  const readinessLabel = isStreaming
    ? 'Run is in progress'
    : trimmedDraft.length > 120
      ? 'Ready to launch'
      : hasQueuedContent
        ? 'Brief forming'
        : 'Waiting for the brief';
  const readinessTone = isStreaming
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : trimmedDraft.length > 120
      ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
      : hasQueuedContent
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-border/70 bg-background/80 text-muted-foreground';
  const shouldShowAdvancedControls =
    showAdvancedControls || researchLane !== 'auto';
  const showCompactStreamingComposer =
    isStreaming && pendingFiles.length === 0 && !shouldShowAdvancedControls;

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

      <div
        className={cn(
          'mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-border/60 bg-background/95 p-3 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-200',
          'focus-within:border-foreground/20 focus-within:shadow-[0_28px_80px_-46px_rgba(15,23,42,0.52)]',
          showCompactStreamingComposer && 'p-2.5',
          isFocused && 'translate-y-[-1px]',
        )}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-full bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_62%)] opacity-80" />
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
            <div
              className={cn(
                'flex items-center justify-between gap-3 px-2',
                showCompactStreamingComposer ? 'pb-1' : 'pb-2',
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium tracking-[-0.02em] text-foreground">
                  {showCompactStreamingComposer ? 'Run in progress' : 'Message'}
                </p>
                {showCompactStreamingComposer ? null : (
                  <p className="text-xs text-muted-foreground">
                    Ask in plain English. Open advanced controls only when you need to steer the run.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'hidden rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] sm:inline-flex',
                    readinessTone,
                  )}
                  aria-live="polite"
                >
                  {readinessLabel}
                </Badge>
                <Badge
                  variant="outline"
                  className="hidden rounded-full border-border/70 bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground lg:inline-flex"
                >
                  {characterCount} chars
                </Badge>
              </div>
            </div>

            {showCompactStreamingComposer ? null : (
              <div className="mb-3 flex flex-wrap items-center gap-2 px-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedControls((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  aria-expanded={shouldShowAdvancedControls}
                  aria-controls="chat-advanced-controls"
                >
                  {shouldShowAdvancedControls ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  <span className="font-medium text-foreground">Advanced controls</span>
                  <span className="hidden text-muted-foreground/90 md:inline">
                    Routing, scaffolds, and structure helpers.
                  </span>
                </button>
                <Badge
                  variant="outline"
                  className="rounded-full border-border/70 bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground/80"
                >
                  {laneStatusLabel}
                </Badge>
              </div>
            )}

            {shouldShowAdvancedControls ? (
              <div
                id="chat-advanced-controls"
                className="mb-3 rounded-2xl border border-border/60 bg-muted/[0.22] px-3 py-3"
              >
                <div className="mb-3 flex flex-wrap gap-2 px-1">
                  {COMPOSER_PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.template)}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        aria-label={`Insert ${preset.label} prompt scaffold`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="font-medium text-foreground">{preset.label}</span>
                        <span className="hidden text-muted-foreground/90 md:inline">{preset.hint}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 px-1 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Research lane
                    </p>
                    <p className="text-sm font-medium tracking-[-0.02em] text-foreground">
                      Choose where the run looks first before it answers.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="w-fit rounded-full border-border/70 bg-background/90 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground/80"
                  >
                    {laneStatusLabel}
                  </Badge>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
                          'rounded-2xl border px-3 py-3 text-left transition-[border-color,background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                          'hover:translate-y-[-1px] hover:border-foreground/20 hover:bg-background/90',
                          isSelected
                            ? 'border-foreground/20 bg-background shadow-sm'
                            : 'border-border/60 bg-background/70',
                        )}
                        aria-pressed={isSelected}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-border/60 bg-muted/[0.35] text-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          {isEffective ? (
                            <Badge
                              variant="outline"
                              className="rounded-full border-border/70 bg-background/95 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-foreground/80"
                            >
                              Active
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-medium tracking-[-0.02em] text-foreground">
                          {option.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {option.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <p className="px-1 pt-3 text-[11px] leading-5 text-muted-foreground">
                  Auto follows the prompt. Override it when you know the run should stay local, use
                  Perplexity for public sources, or switch to CUA for interactive work.
                </p>
              </div>
            ) : null}

            <div
              className={cn(
                'rounded-2xl border border-border/60 bg-background/72 px-3 py-2 transition-colors',
                'focus-within:border-foreground/20 focus-within:bg-background',
                showCompactStreamingComposer && 'px-3 py-1.5',
                isFocused && 'border-foreground/20 bg-background',
              )}
            >
              <Textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                placeholder={placeholder}
                className={cn(
                  'min-h-[72px] resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 shadow-none',
                  'text-foreground placeholder:text-muted-foreground/75 focus-visible:ring-0',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  showCompactStreamingComposer && 'min-h-[48px] py-1.5',
                )}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setIsFocused(true);
                }}
                onBlur={() => {
                  setIsFocused(false);
                }}
                onCompositionStart={() => {
                  isComposing.current = true;
                }}
                onCompositionEnd={() => {
                  isComposing.current = false;
                }}
                disabled={isStreaming}
              />

              {showCompactStreamingComposer ? (
                <div className="flex flex-col gap-2 border-t border-border/50 px-2 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                      Transcript stays live above
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-1 transition-colors',
                        readinessTone,
                      )}
                      aria-live="polite"
                    >
                      {readinessLabel}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-10 shrink-0 rounded-2xl px-4"
                    onClick={onStop}
                  >
                    <Square className="h-4 w-4" />
                    <span className="ml-2">Stop run</span>
                  </Button>
                </div>
              ) : (
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
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                      {wordCount} words
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-1 transition-colors',
                        readinessTone,
                      )}
                      aria-live="polite"
                    >
                      {readinessLabel}
                    </span>
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
                        'h-10 shrink-0 rounded-2xl px-4 shadow-sm transition-transform hover:translate-y-[-1px]',
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
              )}
            </div>
          </div>
        </div>

        {showCompactStreamingComposer ? null : (
          <p className="mx-auto mt-3 max-w-5xl px-2 text-center text-[11px] leading-5 text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    </form>
  );
}
