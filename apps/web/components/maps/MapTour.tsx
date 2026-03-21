"use client";

import { useEffect, useMemo, useState } from "react";

type TourStep = {
  id: string;
  title: string;
  body: string;
  selector: string;
};

const MAP_TOUR_STEPS: TourStep[] = [
  {
    id: "layers",
    title: "Layer Controls",
    body: "Toggle parcel boundaries, zoning, and flood overlays from here.",
    selector: '[data-tour="layers-panel"]',
  },
  {
    id: "draw",
    title: "Draw Tool",
    body: "Sketch a polygon to run focused parcel search inside an area.",
    selector: '[data-tour="draw-tool"]',
  },
  {
    id: "analytics",
    title: "Analytics",
    body: "Enable comps, heatmap presets, and measurement tools.",
    selector: '[data-tour="analytical-toolbar"]',
  },
  {
    id: "geofences",
    title: "Saved Geofences",
    body: "Save and recall geofences for repeat prospecting workflows.",
    selector: '[data-tour="geofences"]',
  },
];

const MAP_TOUR_HIGHLIGHT_OUTLINE = "#6c8cff";

export function MapTour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [targetVisible, setTargetVisible] = useState(true);

  const step = useMemo(() => MAP_TOUR_STEPS[index], [index]);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(step.selector);
    setTargetVisible(Boolean(el));
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      (el as HTMLElement).style.outline = `2px solid ${MAP_TOUR_HIGHLIGHT_OUTLINE}`;
      (el as HTMLElement).style.outlineOffset = "2px";
    }
    return () => {
      if (el) {
        (el as HTMLElement).style.outline = "";
        (el as HTMLElement).style.outlineOffset = "";
      }
    };
  }, [open, step]);

  if (!open) {
    return (
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setOpen(true);
          }}
          className="absolute bottom-3 left-3 z-20 rounded-xl border border-map-border bg-map-surface-overlay px-3 py-2 text-[11px] font-medium text-map-text-primary shadow-xl backdrop-blur-md transition-colors hover:bg-map-surface"
        >
          Map Guide
        </button>
      );
  }

  return (
    <div className="absolute bottom-3 left-3 z-20 w-[20rem] rounded-2xl border border-map-border bg-map-surface-overlay px-4 py-4 text-xs text-map-text-primary shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
            Map Guide
          </p>
          <h3 className="mt-1 text-sm font-semibold">
            Navigate layers, draw tools, and saved areas.
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="map-btn h-7 rounded-lg px-2.5 text-[10px]"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex gap-1.5">
        {MAP_TOUR_STEPS.map((tourStep, tourStepIndex) => (
          <button
            key={tourStep.id}
            type="button"
            onClick={() => setIndex(tourStepIndex)}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              tourStepIndex === index ? "bg-map-accent" : "bg-map-border"
            }`}
            aria-label={`Go to ${tourStep.title}`}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-map-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
            Step {index + 1}/{MAP_TOUR_STEPS.length}
          </p>
          <p className="text-[10px] text-map-text-muted">
            {targetVisible ? "Highlighted on map" : "Control unavailable"}
          </p>
        </div>
        <div className="mt-2 text-sm font-semibold">{step.title}</div>
        <p className="mt-2 text-[11px] leading-5 text-map-text-secondary">{step.body}</p>
        <p className="mt-3 text-[10px] leading-5 text-map-text-muted">
          {targetVisible
            ? "The active control is outlined directly in the map surface."
            : "Open the relevant panel or state to surface this control, then continue the guide."}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
          className="map-btn rounded-lg px-2.5 py-1 text-[10px] disabled:opacity-40"
        >
          Back
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="map-btn rounded-lg px-2.5 py-1 text-[10px]"
          >
            Dismiss
          </button>
          {index < MAP_TOUR_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((value) => Math.min(MAP_TOUR_STEPS.length - 1, value + 1))}
              className="rounded-lg bg-map-accent px-2.5 py-1 text-[10px] font-medium text-white"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-map-accent px-2.5 py-1 text-[10px] font-medium text-white"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
