"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setIndex(0);
            setOpen(true);
          }}
          className="absolute bottom-3 left-3 z-20 border-map-border bg-map-panel text-[11px] text-map-text-primary shadow-[0_20px_48px_-28px_rgba(15,23,42,0.92)] hover:bg-map-surface-elevated"
        >
          Map Guide
        </Button>
      );
  }

  return (
    <Card className="absolute bottom-3 left-3 z-20 w-[20rem] border-map-border bg-map-panel text-xs text-map-text-primary shadow-[0_28px_64px_-36px_rgba(15,23,42,0.92)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
            Map Guide
            </p>
            <CardTitle className="mt-1 text-sm">Navigate layers, draw tools, and saved areas.</CardTitle>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} className="h-7 px-2.5 text-[10px]">
            Close
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
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

      <Separator className="mt-4 bg-map-border" />

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-map-text-muted">
            <span>Step</span>
            <span>
              {index + 1}/{MAP_TOUR_STEPS.length}
            </span>
          </p>
          <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
            {targetVisible ? "Highlighted on map" : "Control unavailable"}
          </Badge>
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
          className="px-2.5 text-[10px] disabled:opacity-40"
        >
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpen(false)}
            className="px-2.5 text-[10px]"
          >
            Dismiss
          </Button>
          {index < MAP_TOUR_STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setIndex((value) => Math.min(MAP_TOUR_STEPS.length - 1, value + 1))}
              className="bg-map-accent px-2.5 text-[10px] font-medium text-white hover:bg-map-accent/90"
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setOpen(false)}
              className="bg-map-accent px-2.5 text-[10px] font-medium text-white hover:bg-map-accent/90"
            >
              Done
            </Button>
          )}
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
