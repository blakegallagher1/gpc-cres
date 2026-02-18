"use client";

import {
  type FocusEvent,
  type KeyboardEvent,
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  FileText,
  ListChecks,
  Loader2,
  RotateCcw,
  Search,
  Send,
  Star,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { streamAgentRun } from "@/lib/agentStream";
import { BACKEND_URL_ERROR_MESSAGE, getBackendBaseUrl } from "@/lib/backendConfig";
import { COMMAND_LIBRARY, type CopilotCommand } from "@/lib/copilotCommandLibrary";

const COMMAND_LIBRARY_PRESET_IDS = new Set([
  "underwrite",
  "loi",
  "comps",
  "dd",
]);

type CopilotIcon = ComponentType<{ className?: string }>;

const DEFAULT_ACTIONS: (CopilotCommand & { icon: CopilotIcon })[] = COMMAND_LIBRARY
  .filter((item) => COMMAND_LIBRARY_PRESET_IDS.has(item.id))
  .map((item) => {
    const iconById: Record<string, CopilotIcon> = {
      underwrite: Zap,
      loi: FileText,
      comps: Sparkles,
      dd: ListChecks,
    };

    return {
      ...item,
      icon: iconById[item.id] ?? Zap,
    };
  });

const FALLBACK_ACTION: CopilotCommand & { icon: CopilotIcon } = {
  id: "underwrite",
  label: "Run Full Underwriting",
  description: "Comprehensive underwriting analysis",
  agent: "finance",
  category: "analytics",
  prompt: "Run a full underwriting analysis on the property.",
  icon: Zap,
};
// Keep fallback behavior intact for production safety.

const COMMAND_LIBRARY_ITEMS: (CopilotCommand & { icon?: CopilotIcon })[] = COMMAND_LIBRARY.map(
  (item) => {
    const iconById: Record<string, CopilotIcon> = {
      underwrite: Zap,
      loi: FileText,
      comps: Sparkles,
      dd: ListChecks,
      "underwrite-quick": Zap,
      "loi-qa": FileText,
      "comps-intra": Sparkles,
      "dd-risk": ListChecks,
    };

    return {
      ...item,
      icon: iconById[item.id],
    };
  }
);

const COMMAND_HISTORY_STORAGE_KEY = "copilot.commandHistory.v1";
const FAVORITE_COMMANDS_STORAGE_KEY = "copilot.favoriteCommands.v1";
const MAX_HISTORY_ITEMS = 20;

const normalizeFavoritePrompt = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeHistoryEntry = (value: unknown): HistoryEntry | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<HistoryEntry>;

  if (
    typeof entry.prompt !== "string" ||
    typeof entry.actionId !== "string" ||
    typeof entry.agent !== "string" ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }

  const prompt = entry.prompt.trim();
  if (!prompt) return null;

  return {
    prompt,
    actionId: entry.actionId,
    agent: entry.agent,
    createdAt: entry.createdAt,
  };
};

const normalizeHistoryEntries = (values: unknown[]): HistoryEntry[] => {
  const seen = new Set<string>();

  return values
    .map(normalizeHistoryEntry)
    .filter((entry): entry is HistoryEntry => entry !== null)
    .filter((entry) => {
      const key = `${entry.prompt.toLowerCase()}|${entry.actionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const normalizeFavoritePromptsList = (values: unknown[]): string[] => {
  const seen = new Set<string>();

  return values
    .map(normalizeFavoritePrompt)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const lower = item.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
};

type SuggestionItem = {
  id: string;
  prompt: string;
  agent: string;
  label: string;
  actionId?: string;
};

type HistoryEntry = {
  prompt: string;
  actionId: string;
  agent: string;
  createdAt: string;
};

function extractProjectId(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const dealRoomIndex = segments.indexOf("deal-room");
  if (dealRoomIndex >= 0 && segments[dealRoomIndex + 1]) {
    return segments[dealRoomIndex + 1];
  }
  return null;
}

export function CopilotPanel() {
  const { copilotOpen, toggleCopilot } = useUIStore();
  const pathname = usePathname();
  const projectId = useMemo(() => pathname ? extractProjectId(pathname) : null, [pathname]);
  const [selectedAction, setSelectedAction] = useState(
    DEFAULT_ACTIONS[0] ?? FALLBACK_ACTION
  );
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favoritePrompts, setFavoritePrompts] = useState<string[]>([]);
  const [queryForSuggestion, setQueryForSuggestion] = useState("");
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const suggestionsPanelRef = useRef<HTMLDivElement>(null);
  const [showCommandLibrary, setShowCommandLibrary] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedHistory = window.localStorage.getItem(COMMAND_HISTORY_STORAGE_KEY);
      if (storedHistory) {
        const parsed = JSON.parse(storedHistory) as unknown;
        if (Array.isArray(parsed)) {
          setHistory(normalizeHistoryEntries(parsed).slice(0, MAX_HISTORY_ITEMS));
        }
      }
    } catch {
      // ignore corrupted command history
    }

    try {
      const storedFavorites = window.localStorage.getItem(FAVORITE_COMMANDS_STORAGE_KEY);
      if (storedFavorites) {
        const parsed = JSON.parse(storedFavorites) as unknown;
        if (Array.isArray(parsed)) {
          setFavoritePrompts(normalizeFavoritePromptsList(parsed).slice(0, MAX_HISTORY_ITEMS));
        }
      }
    } catch {
      // ignore corrupted favorites
    }
  }, []);

  const syncHistoryToStorage = (nextHistory: HistoryEntry[]) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      COMMAND_HISTORY_STORAGE_KEY,
      JSON.stringify(nextHistory.slice(0, MAX_HISTORY_ITEMS))
    );
  };

  const syncFavoritesToStorage = (nextFavorites: string[]) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      FAVORITE_COMMANDS_STORAGE_KEY,
      JSON.stringify(nextFavorites)
    );
  };

  const normalizedFavoritePrompts = useMemo(
    () => {
      const seen = new Set<string>();

      return favoritePrompts
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => {
          const lower = item.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
    },
    [favoritePrompts]
  );
  const normalizedFavoritePromptSet = useMemo(() => {
    const set = new Set<string>();
    normalizedFavoritePrompts.forEach((entry) => set.add(entry.toLowerCase()));
    return set;
  }, [normalizedFavoritePrompts]);

  const normalizedCurrentPrompt = useMemo(() => {
    const basePrompt = prompt.trim() || selectedAction?.prompt || "";
    return basePrompt.trim();
  }, [prompt, selectedAction?.prompt]);

  const runnablePrompt = useMemo(
    () => normalizedCurrentPrompt || selectedAction?.prompt || "",
    [normalizedCurrentPrompt, selectedAction?.prompt]
  );
  const isFavorite =
    normalizedCurrentPrompt.length > 0 &&
    normalizedFavoritePromptSet.has(normalizedCurrentPrompt.toLowerCase());

  const suggestions = useMemo(() => {
    const searchTerm = queryForSuggestion.trim().toLowerCase();
    const fromLibrary: SuggestionItem[] = COMMAND_LIBRARY_ITEMS.map((action) => ({
      id: action.id,
      prompt: action.prompt,
      agent: action.agent,
      label: action.label,
      actionId: action.id,
    }));

    const fromFavorites: SuggestionItem[] = normalizedFavoritePrompts.map((entry) => ({
      id: `fav-${entry}`,
      prompt: entry,
      agent: "favorite",
      label: `Saved: ${entry.slice(0, 40)}${entry.length > 40 ? "..." : ""}`,
    }));

    const fromHistory: SuggestionItem[] = history.map((entry) => ({
      id: `hist-${entry.createdAt}`,
      prompt: entry.prompt,
      agent: entry.agent,
      label: `Recent: ${entry.prompt.slice(0, 40)}${entry.prompt.length > 40 ? "..." : ""}`,
    }));

    const merged = [...fromFavorites, ...fromHistory, ...fromLibrary];
    const seen = new Set<string>();

    return merged
      .filter((item) => {
        const lowerPrompt = item.prompt.trim().toLowerCase();
        return !searchTerm || lowerPrompt.includes(searchTerm);
      })
      .filter((item) => {
        const promptKey = item.prompt.trim().toLowerCase();
        if (!promptKey || seen.has(promptKey)) return false;
        seen.add(promptKey);
        return true;
      })
      .slice(0, 8);
  }, [history, normalizedFavoritePrompts, queryForSuggestion]);

  const commandLibraryItems = useMemo(() => {
    const searchTerm = queryForSuggestion.trim().toLowerCase();
    return COMMAND_LIBRARY_ITEMS.filter((item) => {
      if (!searchTerm) return true;
      const haystack = `${item.label} ${item.description} ${item.prompt}`.toLowerCase();
      return haystack.includes(searchTerm);
    }).slice(0, 12);
  }, [queryForSuggestion]);

  const applyCommand = (nextPrompt: string, actionId?: string) => {
    setPrompt(nextPrompt);
    setQueryForSuggestion("");
    setIsPromptFocused(false);
    if (actionId) {
      const action = DEFAULT_ACTIONS.find((item) => item.id === actionId);
      if (action) {
        setSelectedAction(action);
      }
    }
  };

  const handleRun = async () => {
    if (streaming) return;

    const query = runnablePrompt;
    if (!query) return;

    const apiBaseUrl = getBackendBaseUrl();
    if (!apiBaseUrl) {
      setError(BACKEND_URL_ERROR_MESSAGE);
      return;
    }

    setIsPromptFocused(false);
    setQueryForSuggestion("");

    const updatedHistory: HistoryEntry[] = [
      {
        prompt: query,
        actionId: selectedAction?.id || FALLBACK_ACTION.id,
        agent: selectedAction?.agent || FALLBACK_ACTION.agent,
        createdAt: new Date().toISOString(),
      },
      ...history.filter(
        (entry) =>
          entry.prompt !== query || entry.actionId !== (selectedAction?.id || FALLBACK_ACTION.id)
      ),
    ].slice(0, MAX_HISTORY_ITEMS);
    setHistory(updatedHistory);
    syncHistoryToStorage(updatedHistory);

    setStreaming(true);
    setOutput("");
    setError(null);

    try {
      await streamAgentRun({
        apiBaseUrl:
          apiBaseUrl,
        agentName: selectedAction?.agent || FALLBACK_ACTION.agent,
        query,
        projectId,
        onChunk: (chunk) => {
          const payloadType = typeof chunk.data?.type === "string" ? chunk.data.type : null;

          if (chunk.event === "chunk" && typeof chunk.data.content === "string") {
            setOutput((prev) => `${prev}${chunk.data.content}`);
          }
          if (
            payloadType === "text_delta" &&
            typeof chunk.data.content === "string"
          ) {
            setOutput((prev) => `${prev}${chunk.data.content}`);
          }
          if (
            payloadType === "agent_progress" &&
            typeof chunk.data.partialOutput === "string"
          ) {
            setOutput(chunk.data.partialOutput);
          }
          if (payloadType === "error" && typeof chunk.data.message === "string") {
            setStreaming(false);
            setError(chunk.data.message);
            return;
          }
          if (chunk.event === "complete") {
            setStreaming(false);
          }
          if (payloadType === "done") {
            setStreaming(false);
          }
        },
        onError: (err) => {
          setStreaming(false);
          setError(err.message);
        },
      });
    } catch (error) {
      setStreaming(false);
      setError(
        error instanceof Error ? error.message : "Unable to start copilot stream."
      );
    } finally {
      setStreaming(false);
    }
  };

  const toggleFavorite = () => {
    if (!normalizedCurrentPrompt) return;
    const loweredCurrent = normalizedCurrentPrompt.toLowerCase();
    let nextFavorites: string[];

    if (normalizedFavoritePromptSet.has(loweredCurrent)) {
      nextFavorites = normalizedFavoritePrompts.filter(
        (item) => item.toLowerCase() !== loweredCurrent
      );
    } else {
      nextFavorites = [normalizedCurrentPrompt, ...normalizedFavoritePrompts].slice(
        0,
        MAX_HISTORY_ITEMS
      );
    }

    setFavoritePrompts(nextFavorites);
    syncFavoritesToStorage(nextFavorites);
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleRun();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "ArrowUp") {
      event.preventDefault();
      const lastCommand = history[0];
      if (lastCommand) {
        applyCommand(lastCommand.prompt, lastCommand.actionId);
      }
      return;
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "s" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      if (!normalizedCurrentPrompt) return;
      toggleFavorite();
      return;
    }

    if (event.key === "Escape") {
      setPrompt("");
      setQueryForSuggestion("");
      setIsPromptFocused(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(COMMAND_HISTORY_STORAGE_KEY);
    }
  };

  const clearFavorites = () => {
    setFavoritePrompts([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(FAVORITE_COMMANDS_STORAGE_KEY);
    }
  };

  const hideSuggestions = (event: FocusEvent<HTMLTextAreaElement>) => {
    const nextFocusTarget = event.relatedTarget as Node | null;

    if (
      nextFocusTarget &&
      (suggestionsPanelRef.current?.contains(nextFocusTarget) ?? false)
    ) {
      return;
    }

    setIsPromptFocused(false);
    setQueryForSuggestion("");
  };

  return (
    <aside
      className={cn(
        "fixed right-0 top-16 z-40 h-[calc(100vh-4rem)] w-[360px] border-l bg-background/95 shadow-xl transition-transform duration-300",
        copilotOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Copilot</p>
              <p className="text-xs text-muted-foreground">Page-aware sidekick</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowCommandLibrary((next) => !next)}
            >
              {showCommandLibrary ? "Hide Commands" : "Show Commands"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCopilot}
              aria-label="Close Copilot"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-2">
            {DEFAULT_ACTIONS.map((action) => {
              const Icon = action.icon;
              const active = action.id === selectedAction?.id;
              return (
                <Button
                  key={action.id}
                  variant={active ? "secondary" : "ghost"}
                  className="justify-start gap-3"
                  onClick={() => setSelectedAction(action)}
                >
                  <Icon className="h-4 w-4" />
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium">{action.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {action.description}
                    </span>
                  </div>
                </Button>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Live Output</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {selectedAction?.agent || FALLBACK_ACTION.agent}
                </Badge>
                {projectId && (
                  <Badge variant="outline">Project {projectId.slice(0, 6)}</Badge>
                )}
              </div>
              <div className="min-h-[120px] whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                {output || "Run a command to see streaming output."}
              </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
            </CardContent>
          </Card>

          {showCommandLibrary ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Command Library</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {commandLibraryItems.length === 0 ? (
                  <p className="text-muted-foreground">
                    No command matches “{queryForSuggestion.trim()}”.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {commandLibraryItems.map((entry) => {
                      const Icon = entry.icon || Search;
                      return (
                        <button
                          type="button"
                          key={`lib-${entry.id}`}
                          className="flex w-full items-center justify-between rounded border border-transparent px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applyCommand(entry.prompt, entry.id)}
                        >
                          <span className="truncate pr-2">{entry.label}</span>
                          <span className="inline-flex min-w-0 items-center gap-2 text-[11px]">
                            <Icon className="h-3 w-3 shrink-0" />
                            {entry.agent}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Recent Commands</CardTitle>
                {history.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearHistory}>
                    <RotateCcw className="h-3 w-3" />
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {history.length === 0 ? (
                <p className="text-muted-foreground">No recent commands yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {history.slice(0, 5).map((entry) => (
                    <button
                      type="button"
                      key={`${entry.createdAt}-${entry.prompt}`}
                      className="flex w-full items-center justify-between rounded border border-transparent px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => applyCommand(entry.prompt, entry.actionId)}
                    >
                      <span className="truncate pr-2">{entry.prompt}</span>
                      <span className="text-[11px] uppercase text-muted-foreground">
                        {entry.agent}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Favorite Commands</CardTitle>
                {normalizedFavoritePrompts.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFavorites}>
                    <RotateCcw className="h-3 w-3" />
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {normalizedFavoritePrompts.length === 0 ? (
                <p className="text-muted-foreground">No saved commands yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {normalizedFavoritePrompts.slice(0, 5).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className="flex w-full items-center justify-between rounded border border-transparent px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => applyCommand(item)}
                    >
                      <span className="truncate pr-2">{item}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="border-t p-4">
          <Textarea
            value={prompt}
            onFocus={() => {
              setIsPromptFocused(true);
              setQueryForSuggestion(prompt);
            }}
            onBlur={hideSuggestions}
            onChange={(event) => {
              setPrompt(event.target.value);
              setQueryForSuggestion(event.target.value);
            }}
            onKeyDown={handlePromptKeyDown}
            placeholder="Ask the copilot to refine, draft, or analyze..."
            className="min-h-[90px] resize-none"
          />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>⌘/Ctrl + Enter: run · ⌘/Ctrl + ↑: last · ⌘/Ctrl + S: save</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFavorite}
                disabled={!normalizedCurrentPrompt}
              >
                <Star
                  className={`h-3.5 w-3.5 ${isFavorite ? "fill-current text-yellow-500" : ""}`}
                />
                {isFavorite ? "Saved" : "Save command"}
            </Button>
          </div>
          {(isPromptFocused || queryForSuggestion.trim()) ? (
            <div
              ref={suggestionsPanelRef}
              className="mt-2 rounded-md border border-border bg-muted/50 p-2 text-xs"
            >
              <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
                <span>Suggested</span>
              </div>
              <div className="space-y-1">
                {suggestions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="block w-full rounded px-2 py-1 text-left hover:bg-background"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyCommand(entry.prompt, entry.actionId)}
                  >
                    <span className="font-medium">{entry.label}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {entry.agent}
                    </span>
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <p className="text-muted-foreground">No matching suggestions.</p>
                )}
              </div>
            </div>
          ) : null}

          <Button
            className="mt-3 w-full gap-2"
            onClick={handleRun}
            disabled={streaming}
            onMouseDown={() => setQueryForSuggestion("")}
          >
            {streaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Streaming
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Run Copilot
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
