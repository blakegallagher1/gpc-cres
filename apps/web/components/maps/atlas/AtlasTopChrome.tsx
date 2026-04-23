"use client";

import Link from "next/link";
import { useRef, type FormEvent, type KeyboardEvent, type RefObject } from "react";

interface AtlasTopChromeProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  onSearchKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  analysisText: string;
  onAnalysisChange: (value: string) => void;
  onAnalysisSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  runsCount?: number;
  onFindFocus?: () => void;
  findInputRef?: RefObject<HTMLInputElement | null>;
}

export function AtlasTopChrome({
  searchText,
  onSearchChange,
  onSearchSubmit,
  onSearchKeyDown,
  analysisText,
  onAnalysisChange,
  onAnalysisSubmit,
  runsCount = 2,
  onFindFocus,
  findInputRef,
}: AtlasTopChromeProps) {
  const internalFindRef = useRef<HTMLInputElement | null>(null);
  const findRef = findInputRef ?? internalFindRef;
  const askRef = useRef<HTMLInputElement | null>(null);

  return (
    <header
      className="flex h-[56px] shrink-0 items-center border-b border-rule bg-paper-panel"
      style={{ display: "grid", gridTemplateColumns: "auto 1fr auto" }}
    >
      {/* Left: Wordmark + nav */}
      <div className="flex items-center gap-6 px-[22px]">
        <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink">
          Gallagher<span className="text-ed-accent">.</span>
        </span>
        <nav className="hidden items-center gap-5 md:flex">
          {(
            [
              { label: "Map", href: "/map", active: true },
              { label: "Deals", href: "/deals", active: false },
              { label: "Market", href: "/opportunities", active: false },
            ] as const
          ).map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={
                item.active
                  ? "cursor-pointer border-b-2 border-ink pb-[3px] font-sans text-[12.5px] font-semibold text-ink"
                  : "cursor-pointer font-sans text-[12.5px] text-ink-fade hover:text-ink"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Center: dual input bar */}
      <div className="flex min-w-0 items-center justify-center px-4">
        <div
          className="flex h-[34px] max-w-[680px] flex-1 items-center overflow-hidden rounded-sm border border-rule bg-paper-inset"
          style={{ display: "grid", gridTemplateColumns: "240px 1px 1fr" }}
        >
          {/* FIND */}
          <form onSubmit={onSearchSubmit} className="flex h-full items-center px-3 gap-2">
            <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-fade">FIND</span>
            <input
              ref={findRef}
              type="text"
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              onFocus={onFindFocus}
              placeholder="Address, parcel id, owner…"
              className="h-full min-w-0 flex-1 bg-transparent font-sans text-[12px] text-ink outline-none placeholder:text-ink-fade"
            />
            <span className="hidden font-mono text-[10px] text-ink-fade md:block">/</span>
          </form>

          {/* Divider */}
          <div className="h-full w-px bg-rule" />

          {/* ASK */}
          <form
            onSubmit={onAnalysisSubmit}
            className="flex h-full min-w-0 items-center gap-2 px-3"
          >
            <span className="font-mono text-[9.5px] tracking-[0.14em] text-ed-accent">ASK</span>
            <input
              ref={askRef}
              type="text"
              value={analysisText}
              onChange={(e) => onAnalysisChange(e.target.value)}
              placeholder="Ask the map — e.g. industrial parcels > 10ac in EBR"
              className="h-full min-w-0 flex-1 bg-transparent font-sans text-[12px] text-ink outline-none placeholder:text-ink-fade"
            />
            <button
              type="submit"
              className="shrink-0 rounded-[2px] bg-ed-accent px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-white"
            >
              Run ↵
            </button>
          </form>
        </div>
      </div>

      {/* Right: Runs chip + user chip */}
      <div className="flex items-center gap-3 px-[22px]">
        {/* Runs chip */}
        <div className="flex items-center gap-1.5 rounded-sm border border-rule bg-paper-inset px-2.5 py-1">
          <span
            className="h-[6px] w-[6px] animate-pulse rounded-full bg-ed-ok"
            aria-hidden="true"
          />
          <span className="font-mono text-[10.5px] text-ink">
            ● {runsCount} runs
          </span>
        </div>

        {/* User chip */}
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-ink font-mono text-[11px] font-semibold text-paper-panel">
          BG
        </div>
      </div>
    </header>
  );
}
