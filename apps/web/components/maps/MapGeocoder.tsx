"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search, MapPin } from "lucide-react";
import type { MutableRefObject } from "react";
import type maplibregl from "maplibre-gl";
import { cn } from "@/lib/utils";
import type { MapParcel } from "./types";
import type { GeocodedPlace } from "@/utils/geocoder";
import { searchGeocodedPlaces } from "@/utils/geocoder";

interface MapGeocoderProps {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  parcels: MapParcel[];
  onPlaceSelect?: (place: GeocodedPlace) => void;
}

/**
 * Floating map geocoder that merges local parcel matches and public geocoding.
 */
export function MapGeocoder({ mapRef, parcels, onPlaceSelect }: MapGeocoderProps) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<GeocodedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedCount = useMemo(() => places.length, [places]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) {
      return;
    }
    const item = listRef.current.children.item(activeIndex) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setPlaces([]);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }

    let active = true;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      void searchGeocodedPlaces(normalized, parcels, { limit: 6 })
        .then((next) => {
          if (!active) return;
          setPlaces(next);
          setActiveIndex(next.length > 0 ? 0 : -1);
          setOpen(true);
        })
        .catch(() => {
          if (!active) return;
          setPlaces([]);
          setActiveIndex(-1);
          setOpen(true);
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      active = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [parcels, query]);

  const selectPlace = (place: GeocodedPlace) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: place.center,
        zoom: place.zoom ?? 16,
        duration: 1200,
      });
    }
    onPlaceSelect?.(place);
    setQuery(place.label);
    setPlaces([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || places.length === 0) {
      if (event.key === "Escape") {
        setOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % places.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? places.length - 1 : current - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < places.length) {
        selectPlace(places[activeIndex]);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="absolute left-1/2 top-3 z-30 w-[24rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2">
      <div className="rounded-2xl border border-map-border/80 bg-map-surface/95 shadow-2xl ring-1 ring-map-accent/15 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-map-border px-3 py-2">
          <Search className="h-3.5 w-3.5 text-map-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            aria-label="Map geocoder search"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (places.length > 0) {
                setOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search address, parcel, or owner"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="map-geocoder-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `map-geocoder-option-${activeIndex}` : undefined}
            className="h-8 flex-1 border-0 bg-transparent text-xs text-map-text-primary placeholder:text-map-text-muted focus:outline-none focus:ring-0"
          />
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-map-text-muted" /> : null}
        </div>

        {open ? (
          <ul id="map-geocoder-listbox" ref={listRef} className="max-h-60 overflow-auto p-1">
            {selectedCount === 0 && !loading ? (
              <li className="px-3 py-2 text-[10px] text-map-text-muted">
                No geocoder results
              </li>
            ) : null}
            {places.map((place, index) => (
              <li key={place.id}>
                <button
                  type="button"
                  id={`map-geocoder-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPlace(place)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                    index === activeIndex
                      ? "bg-map-accent/20 text-map-text-primary"
                      : "hover:bg-map-surface-elevated text-map-text-secondary hover:text-map-text-primary",
                  )}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-map-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">{place.label}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
                      <span>{place.source === "parcel" ? "Parcel" : place.source}</span>
                      {place.owner ? <span className="truncate normal-case tracking-normal">{place.owner}</span> : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
