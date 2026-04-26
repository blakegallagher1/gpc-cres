"use client";

import { useEffect, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import {
  LayoutDashboard,
  Bot,
  Workflow,
  Play,
  Settings,
  Search,
  FileJson,
  Plus,
  Moon,
  Sun,
  Keyboard,
  Presentation,
  Sparkles,
  MapPinned,
  FileSearch,
  MessageSquareText,
} from "lucide-react";
import { Button } from "../ui/button";
import { useAgents } from "../../lib/hooks/useAgents";
import { useTheme } from "next-themes";
import { useUIStore } from "../../stores/uiStore";
import {
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  type GlobalSearchResponse,
} from "../../lib/search/globalSearch";

interface Command {
  id: string;
  title: string;
  shortcut?: string;
  icon: React.ElementType;
  action: () => void;
  keywords?: string[];
}

const SEARCH_DEBOUNCE_MS = 180;

export function CommandPalette() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { agents } = useAgents();
  const { commandPaletteOpen, setCommandPaletteOpen, toggleCopilot } =
    useUIStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResponse | null>(
    null,
  );
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const navigate = useCallback(
    (path: string) => {
      router.push(path);
      setCommandPaletteOpen(false);
    },
    [router, setCommandPaletteOpen]
  );

  const commands: Command[] = useMemo(
    () => [
      // Navigation
      {
        id: "nav-dashboard",
        title: "Go to Dashboard",
        shortcut: "G H",
        icon: LayoutDashboard,
        action: () => navigate("/"),
        keywords: ["home", "overview", "stats"],
      },
      {
        id: "nav-agents",
        title: "Go to Agent Library",
        shortcut: "G A",
        icon: Bot,
        action: () => navigate("/agents"),
        keywords: ["agents", "library", "models"],
      },
      {
        id: "nav-automation",
        title: "Go to Workflows",
        shortcut: "G W",
        icon: Workflow,
        action: () => navigate("/automation?tab=builder"),
        keywords: ["workflows", "pipelines", "automation"],
      },
      {
        id: "nav-deal-room",
        title: "Go to Deals",
        shortcut: "G D",
        icon: Presentation,
        action: () => navigate("/deals"),
        keywords: ["deals", "screening", "triage"],
      },
      {
        id: "nav-runs",
        title: "Go to Run History",
        shortcut: "G R",
        icon: Play,
        action: () => navigate("/runs"),
        keywords: ["runs", "history", "executions"],
      },
      {
        id: "nav-settings",
        title: "Go to Settings",
        shortcut: "G S",
        icon: Settings,
        action: () => navigate("/settings"),
        keywords: ["settings", "preferences", "config"],
      },

      // Agent Actions
      ...agents.map((agent) => ({
        id: `agent-${agent.id}`,
        title: `Run ${agent.name}`,
        icon: Bot,
        action: () => navigate(`/agents/${agent.id}`),
        keywords: [agent.name.toLowerCase(), agent.id, "run", "agent"],
      })),

      // Quick Actions
      {
        id: "action-new-workflow",
        title: "Create New Workflow",
        shortcut: "⌘ N",
        icon: Plus,
        action: () => navigate("/automation?tab=builder"),
        keywords: ["new", "create", "workflow"],
      },
      {
        id: "action-import",
        title: "Import Workflow",
        icon: FileJson,
        action: () => {
          // Trigger import dialog
          setCommandPaletteOpen(false);
          document.dispatchEvent(new CustomEvent("import-workflow"));
        },
        keywords: ["import", "json", "workflow"],
      },
      {
        id: "action-copilot",
        title: "Toggle Copilot Panel",
        shortcut: "⌘ .",
        icon: Sparkles,
        action: () => {
          toggleCopilot();
          setCommandPaletteOpen(false);
        },
        keywords: ["copilot", "sidekick", "assistant"],
      },
      {
        id: "action-toggle-theme",
        title: `Switch to ${theme === "dark" ? "Light" : "Dark"} Theme`,
        shortcut: "⌘ T",
        icon: theme === "dark" ? Sun : Moon,
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          setCommandPaletteOpen(false);
        },
        keywords: ["theme", "dark", "light", "mode"],
      },
      {
        id: "action-shortcuts",
        title: "Keyboard Shortcuts",
        icon: Keyboard,
        action: () => {
          setCommandPaletteOpen(false);
          document.dispatchEvent(new CustomEvent("show-shortcuts"));
        },
        keywords: ["shortcuts", "keyboard", "hotkeys"],
      },
    ],
    [navigate, theme, setTheme, agents, setCommandPaletteOpen, toggleCopilot]
  );

  const trimmedQuery = searchQuery.trim();
  const hasActiveSearch = trimmedQuery.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!commandPaletteOpen) {
      setSearchQuery("");
      setSearchResults(null);
      setSearchError(null);
      setIsSearching(false);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen || !hasActiveSearch) {
      setSearchResults(null);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=5`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Search is unavailable right now.");
        }

        const payload = (await response.json()) as GlobalSearchResponse;
        setSearchResults(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setSearchResults(null);
        setSearchError(
          error instanceof Error
            ? error.message
            : "Search is unavailable right now.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [commandPaletteOpen, hasActiveSearch, trimmedQuery]);

  const hasRemoteResults = useMemo(() => {
    if (!searchResults) {
      return false;
    }

    return Object.values(searchResults.groups).some((group) => group.length > 0);
  }, [searchResults]);

  const partialResultError = useMemo(() => {
    if (!searchResults) {
      return null;
    }

    const unavailableSources = Object.entries(searchResults.errors)
      .filter(([, message]) => typeof message === "string" && message.length > 0)
      .map(([source]) => source);

    if (unavailableSources.length === 0) {
      return null;
    }

    return `Some sources are unavailable: ${unavailableSources.join(", ")}.`;
  }, [searchResults]);

  // Keyboard shortcut listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }

      // Navigation shortcuts when closed
      if (!commandPaletteOpen) {
        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const modifierKey = isMac ? e.metaKey : e.ctrlKey;

        if (modifierKey) {
          switch (e.key.toLowerCase()) {
            case "h":
              e.preventDefault();
              navigate("/");
              break;
            case "d":
              e.preventDefault();
              navigate("/deals");
              break;
            case "a":
              e.preventDefault();
              navigate("/agents");
              break;
            case "w":
              e.preventDefault();
              navigate("/automation?tab=builder");
              break;
            case "r":
              e.preventDefault();
              navigate("/runs");
              break;
            case "p":
              e.preventDefault();
              navigate("/prospecting");
              break;
            case "s":
              e.preventDefault();
              navigate("/settings");
              break;
            case "t":
              e.preventDefault();
              setTheme(theme === "dark" ? "light" : "dark");
              break;
            case ".":
              e.preventDefault();
              toggleCopilot();
              break;
          }
        }
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [navigate, commandPaletteOpen, theme, setTheme, setCommandPaletteOpen, toggleCopilot]);

  return (
    <>
      <Button
        variant="outline"
        className="fixed bottom-3 left-4 z-20 h-9 w-[calc(100vw-2rem)] max-w-64 justify-start rounded-md bg-muted text-sm font-normal text-muted-foreground shadow-lg hover:bg-muted sm:pr-12 md:left-[calc(var(--app-sidebar-expanded)+1rem)] md:w-40 lg:w-64"
        onClick={() => setCommandPaletteOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        Search...
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
        <CommandInput
          placeholder="Search deals, parcels, runs, knowledge, conversations, or commands..."
          value={searchQuery}
          onValueChange={setSearchQuery}
        />
        <CommandList>
          <CommandEmpty>
            {hasActiveSearch
              ? isSearching
                ? "Searching..."
                : searchError ?? "No matching content or commands."
              : "No results found."}
          </CommandEmpty>

          {hasActiveSearch ? (
            <>
              {searchResults?.groups.deals.length ? (
                <CommandGroup heading="Deals">
                  {searchResults.groups.deals.map((result) => (
                    <CommandItem
                      key={`deal-${result.id}`}
                      value={`${result.title} ${result.subtitle ?? ""}`}
                      keywords={["deal", result.title.toLowerCase()]}
                      onSelect={() => navigate(result.href)}
                    >
                      <Presentation className="mr-2 h-4 w-4" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchResults?.groups.parcels.length ? (
                <CommandGroup heading="Parcels">
                  {searchResults.groups.parcels.map((result) => (
                    <CommandItem
                      key={`parcel-${result.id}`}
                      value={`${result.title} ${result.subtitle ?? ""}`}
                      keywords={["parcel", result.title.toLowerCase()]}
                      onSelect={() => navigate(result.href)}
                    >
                      <MapPinned className="mr-2 h-4 w-4" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchResults?.groups.knowledge.length ? (
                <CommandGroup heading="Knowledge">
                  {searchResults.groups.knowledge.map((result) => (
                    <CommandItem
                      key={`knowledge-${result.id}`}
                      value={`${result.title} ${result.subtitle ?? ""}`}
                      keywords={["knowledge", result.title.toLowerCase()]}
                      onSelect={() => navigate(result.href)}
                    >
                      <FileSearch className="mr-2 h-4 w-4" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchResults?.groups.runs.length ? (
                <CommandGroup heading="Runs">
                  {searchResults.groups.runs.map((result) => (
                    <CommandItem
                      key={`run-${result.id}`}
                      value={`${result.title} ${result.subtitle ?? ""}`}
                      keywords={["run", result.title.toLowerCase()]}
                      onSelect={() => navigate(result.href)}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchResults?.groups.conversations.length ? (
                <CommandGroup heading="Conversations">
                  {searchResults.groups.conversations.map((result) => (
                    <CommandItem
                      key={`conversation-${result.id}`}
                      value={`${result.title} ${result.subtitle ?? ""}`}
                      keywords={["conversation", "chat", result.title.toLowerCase()]}
                      onSelect={() => navigate(result.href)}
                    >
                      <MessageSquareText className="mr-2 h-4 w-4" />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {partialResultError ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {partialResultError}
                </div>
              ) : null}

              {searchError ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {searchError}
                </div>
              ) : null}

              {!hasRemoteResults ? <CommandSeparator /> : null}

              <CommandGroup heading="Commands">
                {commands
                  .filter((command) =>
                    command.title.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
                    command.keywords?.some((keyword) =>
                      keyword.toLowerCase().includes(trimmedQuery.toLowerCase()),
                    ),
                  )
                  .slice(0, 8)
                  .map((command) => (
                    <CommandItem
                      key={command.id}
                      onSelect={command.action}
                      keywords={command.keywords}
                      value={command.title}
                    >
                      <command.icon className="mr-2 h-4 w-4" />
                      <span>{command.title}</span>
                      {command.shortcut && (
                        <kbd className="ml-auto text-xs text-muted-foreground">
                          {command.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </>
          ) : (
            <>
              <CommandGroup heading="Navigation">
                {commands
                  .filter((c) => c.id.startsWith("nav-"))
                  .map((command) => (
                    <CommandItem
                      key={command.id}
                      onSelect={command.action}
                      keywords={command.keywords}
                    >
                      <command.icon className="mr-2 h-4 w-4" />
                      <span>{command.title}</span>
                      {command.shortcut && (
                        <kbd className="ml-auto text-xs text-muted-foreground">
                          {command.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Agents">
                {commands
                  .filter((c) => c.id.startsWith("agent-"))
                  .slice(0, 5)
                  .map((command) => (
                    <CommandItem
                      key={command.id}
                      onSelect={command.action}
                      keywords={command.keywords}
                    >
                      <command.icon className="mr-2 h-4 w-4" />
                      <span>{command.title}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Quick Actions">
                {commands
                  .filter((c) => c.id.startsWith("action-"))
                  .map((command) => (
                    <CommandItem
                      key={command.id}
                      onSelect={command.action}
                      keywords={command.keywords}
                    >
                      <command.icon className="mr-2 h-4 w-4" />
                      <span>{command.title}</span>
                      {command.shortcut && (
                        <kbd className="ml-auto text-xs text-muted-foreground">
                          {command.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
