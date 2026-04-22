"use client";

type DrawMode = "select" | "lasso" | "measure" | "pin";

interface AtlasToolRailProps {
  drawMode?: DrawMode | "idle";
  onModeChange?: (mode: DrawMode) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitBounds?: () => void;
}

const TOOL_BUTTONS: { mode: DrawMode; icon: string; label: string; kbd: string }[] = [
  { mode: "select", icon: "◉", label: "Select", kbd: "V" },
  { mode: "lasso", icon: "◇", label: "Lasso", kbd: "L" },
  { mode: "measure", icon: "━", label: "Measure", kbd: "M" },
  { mode: "pin", icon: "⌖", label: "Pin", kbd: "P" },
];

export function AtlasToolRail({
  drawMode = "idle",
  onModeChange,
  onZoomIn,
  onZoomOut,
  onFitBounds,
}: AtlasToolRailProps) {
  return (
    <div
      className="absolute z-20 flex flex-col overflow-hidden rounded-[4px] border border-rule bg-paper-panel"
      style={{
        top: 18,
        left: 18,
        boxShadow: "0 2px 6px rgba(20,20,20,0.06)",
      }}
      aria-label="Map tool rail"
    >
      {TOOL_BUTTONS.map((tool, idx) => {
        const isActive = drawMode === tool.mode;
        return (
          <button
            key={tool.mode}
            type="button"
            title={`${tool.label} (${tool.kbd})`}
            aria-label={tool.label}
            aria-pressed={isActive}
            onClick={() => onModeChange?.(tool.mode)}
            className={`flex h-[34px] w-[34px] items-center justify-center font-mono text-[14px] ${
              idx < TOOL_BUTTONS.length - 1 ? "border-b border-rule-soft" : ""
            } ${isActive ? "bg-ink text-paper-panel" : "text-ink-soft hover:text-ink"}`}
          >
            {tool.icon}
          </button>
        );
      })}

      {/* 6px gap via spacer */}
      <div className="h-[6px] border-b border-rule-soft" />

      {/* Zoom controls */}
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={onZoomIn}
        className="flex h-[34px] w-[34px] items-center justify-center border-b border-rule-soft font-mono text-[14px] text-ink-soft hover:text-ink"
      >
        ＋
      </button>
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={onZoomOut}
        className="flex h-[34px] w-[34px] items-center justify-center border-b border-rule-soft font-mono text-[14px] text-ink-soft hover:text-ink"
      >
        －
      </button>
      <button
        type="button"
        title="Fit bounds"
        aria-label="Fit bounds"
        onClick={onFitBounds}
        className="flex h-[34px] w-[34px] items-center justify-center font-mono text-[14px] text-ink-soft hover:text-ink"
      >
        ⛶
      </button>
    </div>
  );
}
