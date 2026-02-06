'use client';

import { useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
  date: string;
  messageCount: number;
}

// Placeholder data until backend is wired
const mockConversations: Conversation[] = [
  {
    id: '1',
    title: 'Airline Hwy screening',
    date: '2026-02-05T10:30:00Z',
    messageCount: 12,
  },
  {
    id: '2',
    title: 'Zoning lookup - EBR Parish',
    date: '2026-02-04T15:20:00Z',
    messageCount: 6,
  },
  {
    id: '3',
    title: 'Due diligence - Lot 4A',
    date: '2026-02-03T09:45:00Z',
    messageCount: 18,
  },
];

interface ConversationSidebarProps {
  open: boolean;
  onToggle: () => void;
}

export function ConversationSidebar({ open, onToggle }: ConversationSidebarProps) {
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = search
    ? mockConversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase())
      )
    : mockConversations;

  return (
    <>
      {/* Toggle button (visible when sidebar closed) */}
      {!open && (
        <button
          onClick={onToggle}
          className="absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Sidebar panel */}
      <div
        className={cn(
          'flex h-full flex-col border-r bg-card/50 transition-all duration-200',
          open ? 'w-72' : 'w-0 overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Conversations</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Plus className="h-4 w-4" />
            </Button>
            <button
              onClick={onToggle}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 w-full rounded-md border-0 bg-muted pl-8 pr-3 text-xs placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations found
            </p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    activeId === conv.id
                      ? 'bg-muted'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{conv.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {new Date(conv.date).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span>{conv.messageCount} msgs</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
