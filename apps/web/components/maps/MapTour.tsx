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

export function MapTour() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const step = useMemo(() => MAP_TOUR_STEPS[index], [index]);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      (el as HTMLElement).style.outline = "2px solid #2563eb";
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
        className="absolute bottom-2 left-2 z-20 rounded-md border bg-white/95 px-2 py-1 text-xs shadow"
      >
        Start Tour
      </button>
    );
  }

  return (
    <div className="absolute bottom-2 left-2 z-20 w-72 rounded-lg border bg-white p-3 text-xs shadow-xl">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        Map Tour {index + 1}/{MAP_TOUR_STEPS.length}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{step.title}</div>
      <p className="mt-1 text-gray-600">{step.body}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border px-2 py-1 text-gray-600"
        >
          Close
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            Back
          </button>
          {index < MAP_TOUR_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((value) => Math.min(MAP_TOUR_STEPS.length - 1, value + 1))}
              className="rounded bg-blue-600 px-2 py-1 text-white"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded bg-blue-600 px-2 py-1 text-white"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
