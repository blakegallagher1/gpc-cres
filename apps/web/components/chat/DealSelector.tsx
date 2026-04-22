"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Deal {
  id: string;
  name: string;
  address?: string;
}

interface DealSelectorProps {
  selectedDealId?: string | null;
  onSelect: (dealId: string | null) => void;
}

const DEAL_SELECTOR_KEY = "chat.selected.dealId";

function readCachedDealId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(DEAL_SELECTOR_KEY);
}

/**
 * Compact deal scope picker for the chat workspace.
 */
export function DealSelector({ selectedDealId, onSelect }: DealSelectorProps) {
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined" && !selectedDealId) {
      const cached = readCachedDealId();
      if (cached) {
        onSelect(cached);
      }
    }
  }, [selectedDealId, onSelect]);

  useEffect(() => {
    let cancelled = false;

    async function loadDeals() {
      try {
        const response = await fetch("/api/deals");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          deals?: {
            id: string;
            name: string;
            jurisdiction?: { name?: string };
          }[];
        };

        if (cancelled) return;

        const loaded = (payload.deals ?? []).map((deal) => ({
          id: deal.id,
          name: deal.name,
          address: deal.jurisdiction?.name,
        }));
        setDeals(loaded);
      } catch {
        if (!cancelled) {
          setDeals([]);
        }
      }
    }

    void loadDeals();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = deals.find((deal) => deal.id === selectedDealId);

  const handleSelect = (dealId: string | null) => {
    if (typeof window !== "undefined") {
      if (dealId) {
        window.localStorage.setItem(DEAL_SELECTOR_KEY, dealId);
      } else {
        window.localStorage.removeItem(DEAL_SELECTOR_KEY);
      }
    }

    onSelect(dealId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative inline-flex items-center">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={selected ? "secondary" : "outline"}
            size="sm"
            className={cn("pr-9", selected ? "border-primary/20 bg-primary/10" : "")}
          >
            <Building2 className="mr-2 h-3.5 w-3.5" />
            <span className={selected ? "font-medium" : "text-muted-foreground"}>
              {selected ? selected.name : "General scope"}
            </span>
            <ChevronDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>

        {selected ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleSelect(null)}
            className="absolute right-1 size-7 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Clear deal selection"
            title="Clear deal selection"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <PopoverContent align="start" className="w-[18rem] p-0">
        <Command>
          <CommandInput placeholder="Search deals" />
          <CommandList>
            <CommandEmpty>No deals found</CommandEmpty>
            <CommandGroup heading="Scope">
              <CommandItem
                value="General scope"
                onSelect={() => handleSelect(null)}
                className={cn(!selectedDealId && "bg-accent text-accent-foreground")}
              >
                <span className="text-muted-foreground">General scope</span>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Deals">
              {deals.map((deal) => (
                <CommandItem
                  key={deal.id}
                  value={`${deal.name} ${deal.address ?? ""}`}
                  onSelect={() => handleSelect(deal.id)}
                  className={cn(selectedDealId === deal.id && "bg-accent text-accent-foreground")}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{deal.name}</p>
                      {deal.address ? (
                        <p className="truncate text-xs text-muted-foreground">{deal.address}</p>
                      ) : null}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
