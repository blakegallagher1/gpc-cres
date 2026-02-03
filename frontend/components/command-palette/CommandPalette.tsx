"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Bot,
  Workflow,
  Play,
  Rocket,
  Settings,
  Search,
  FileJson,
  Plus,
  Moon,
  Sun,
  Keyboard,
} from "lucide-react";
import { useAgents } from "@/lib/hooks/useAgents";
import { useTheme } from "next-themes";

interface Command {
  id: string;
  title: string;
  shortcut?: string;
  icon: React.ElementType;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { agents } = useAgents();

  const navigate = useCallback(
    (path: string) => {
      router.push(path);
      setOpen(false);
    },
    [router]
  );

  const commands: Command[] = useMemo(
    () => [
      // Navigation
      {
        id: "nav-dashboard",
        title: "Go to Dashboard",
        shortcut: "G D",
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
        id: "nav-workflows",
        title: "Go to Workflows",
        shortcut: "G W",
        icon: Workflow,
        action: () => navigate("/workflows"),
        keywords: ["workflows", "pipelines", "automation"],
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
        id: "nav-deploy",
        title: "Go to Deploy",
        shortcut: "G P",
        icon: Rocket,
        action: () => navigate("/deploy"),
        keywords: ["deploy", "publish", "channels"],
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
        action: () => navigate("/workflows/new"),
        keywords: ["new", "create", "workflow"],
      },
      {
        id: "action-import",
        title: "Import Workflow",
        icon: FileJson,
        action: () => {
          // Trigger import dialog
          setOpen(false);
          document.dispatchEvent(new CustomEvent("import-workflow"));
        },
        keywords: ["import", "json", "workflow"],
      },
      {
        id: "action-toggle-theme",
        title: `Switch to ${theme === "dark" ? "Light" : "Dark"} Theme`,
        shortcut: "⌘ T",
        icon: theme === "dark" ? Sun : Moon,
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          setOpen(false);
        },
        keywords: ["theme", "dark", "light", "mode"],
      },
      {
        id: "action-shortcuts",
        title: "Keyboard Shortcuts",
        icon: Keyboard,
        action: () => {
          setOpen(false);
          document.dispatchEvent(new CustomEvent("show-shortcuts"));
        },
        keywords: ["shortcuts", "keyboard", "hotkeys"],
      },
    ],
    [navigate, theme, setTheme, agents]
  );

  // Keyboard shortcut listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((open) => !open);
      }

      // Navigation shortcuts when closed
      if (!open) {
        const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
        const modifierKey = isMac ? e.metaKey : e.ctrlKey;

        if (modifierKey) {
          switch (e.key.toLowerCase()) {
            case "d":
              e.preventDefault();
              navigate("/");
              break;
            case "a":
              e.preventDefault();
              navigate("/agents");
              break;
            case "w":
              e.preventDefault();
              navigate("/workflows");
              break;
            case "r":
              e.preventDefault();
              navigate("/runs");
              break;
            case "p":
              e.preventDefault();
              navigate("/deploy");
              break;
            case "s":
              e.preventDefault();
              navigate("/settings");
              break;
            case "t":
              e.preventDefault();
              setTheme(theme === "dark" ? "light" : "dark");
              break;
          }
        }
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [navigate, open, theme, setTheme]);

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-md bg-muted/50 text-sm font-normal text-muted-foreground shadow-none hover:bg-muted sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        Search...
        <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

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
        </CommandList>
      </CommandDialog>
    </>
  );
}

// Import Button for the command palette trigger
import { Button } from "@/components/ui/button";
