"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MapPin, Database, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// AddressAutocomplete — typeahead input for addresses
//
// Uses /api/places/autocomplete which merges Google Places + internal
// parcel DB results. Debounces keystrokes at 300ms. Fully keyboard-
// navigable (arrow keys + enter + escape).
// ---------------------------------------------------------------------------

export interface AddressSuggestion {
  description: string;
  placeId: string;
  source: "google" | "parcel_db";
  validated?: boolean;
  formattedAddress?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when a suggestion is explicitly selected (provides full object) */
  onSelect?: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address...",
  className,
  disabled,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether the user just selected a suggestion to skip re-fetching
  const justSelectedRef = useRef(false);

  // ------------------------------------------------------------------
  // Fetch suggestions (debounced)
  // ------------------------------------------------------------------
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { suggestions: AddressSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      setIsOpen((data.suggestions?.length ?? 0) > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // ------------------------------------------------------------------
  // Input change handler (debounce 300ms)
  // ------------------------------------------------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    // If user just selected a suggestion, don't re-fetch
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 300);
  };

  // ------------------------------------------------------------------
  // Suggestion selection
  // ------------------------------------------------------------------
  const selectSuggestion = (suggestion: AddressSuggestion) => {
    justSelectedRef.current = true;
    onChange(suggestion.description);
    onSelect?.(suggestion);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  // ------------------------------------------------------------------
  // Keyboard navigation
  // ------------------------------------------------------------------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          selectSuggestion(suggestions[activeIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  // ------------------------------------------------------------------
  // Scroll active item into view
  // ------------------------------------------------------------------
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // ------------------------------------------------------------------
  // Close on outside click
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        listRef.current &&
        !listRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ------------------------------------------------------------------
  // Cleanup debounce on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="address-listbox"
          aria-activedescendant={
            activeIndex >= 0 ? `address-option-${activeIndex}` : undefined
          }
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            loading && "pr-8",
            className,
          )}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id="address-listbox"
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.source}-${s.placeId}-${i}`}
              id={`address-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before click registers
                selectSuggestion(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {s.source === "google" ? (
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{s.description}</span>
              {s.source === "parcel_db" && (
                <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  EBR DB
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
