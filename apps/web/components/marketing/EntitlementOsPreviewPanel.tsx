import { cn } from "@/lib/utils";

interface PreviewParcel {
  label: string;
  value: string;
  detail: string;
}

interface PreviewSignal {
  label: string;
  detail: string;
  state: string;
}

interface PreviewMemoryEntry {
  label: string;
  detail: string;
}

interface EntitlementOsPreviewPanelProps {
  eyebrow: string;
  title: string;
  summary: string;
  parcel: PreviewParcel;
  signals: readonly PreviewSignal[];
  memory: readonly PreviewMemoryEntry[];
  className?: string;
}

/**
 * Reusable product-proof rail for branded landing surfaces.
 * Shows parcel context, active layers, and recent operating memory in a single restrained panel.
 */
export function EntitlementOsPreviewPanel({
  eyebrow,
  title,
  summary,
  parcel,
  signals,
  memory,
  className,
}: EntitlementOsPreviewPanelProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[2rem] border border-white/14 bg-slate-950/70 text-white shadow-[0_28px_90px_rgba(2,6,23,0.46)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.28em] text-white/52">{eyebrow}</p>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-[-0.04em] text-white/96 sm:text-2xl">{title}</h2>
              <p className="max-w-sm text-sm leading-6 text-white/64">{summary}</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-300/10 px-3 py-1 font-mono text-[0.64rem] uppercase tracking-[0.24em] text-amber-200/90">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Live
          </span>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-white/46">{parcel.label}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white/96 sm:text-[1.35rem]">
                {parcel.value}
              </h3>
            </div>
            <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_24px_rgba(252,211,77,0.55)]" />
          </div>
          <p className="text-sm leading-6 text-white/62">{parcel.detail}</p>
        </section>

        <section className="space-y-3 border-t border-white/10 pt-5">
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-white/46">Visible layers</p>
          <div className="space-y-3">
            {signals.map((signal) => (
              <div
                className="grid gap-2 border-t border-white/8 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                key={signal.label}
              >
                <div>
                  <p className="text-sm font-semibold tracking-[-0.02em] text-white/94">{signal.label}</p>
                  <p className="mt-1 text-sm leading-6 text-white/58">{signal.detail}</p>
                </div>
                <span className="font-mono text-[0.64rem] uppercase tracking-[0.22em] text-amber-200/84 sm:pt-0.5">
                  {signal.state}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t border-white/10 pt-5">
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.24em] text-white/46">Run memory</p>
          <div className="space-y-3">
            {memory.map((entry) => (
              <div className="grid gap-2 border-t border-white/8 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[8rem_minmax(0,1fr)]" key={entry.label}>
                <p className="font-mono text-[0.64rem] uppercase tracking-[0.22em] text-white/46">{entry.label}</p>
                <p className="text-sm leading-6 text-white/62">{entry.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
