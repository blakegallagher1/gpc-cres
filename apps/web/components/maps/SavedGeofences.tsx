"use client";

import { useEffect, useState } from "react";

type SavedGeofence = {
  id: string;
  name: string;
  coordinates: number[][][];
  createdAt: string;
};

interface SavedGeofencesProps {
  currentPolygon: number[][][] | null;
  onApply: (coordinates: number[][][]) => void;
}

export function SavedGeofences({ currentPolygon, onApply }: SavedGeofencesProps) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<SavedGeofence[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/geofences");
      if (!res.ok) return;
      const data = (await res.json()) as { geofences?: SavedGeofence[] };
      setItems(Array.isArray(data.geofences) ? data.geofences : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!currentPolygon || !name.trim()) return;
    const res = await fetch("/api/geofences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), coordinates: currentPolygon }),
    });
    if (!res.ok) return;
    setName("");
    void load();
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/geofences/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div data-tour="geofences" className="text-xs">
      <div className="flex gap-1">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Geofence name"
          className="min-w-0 flex-1 rounded border border-map-border bg-map-surface px-2 py-1 text-map-text-primary placeholder:text-map-text-muted"
        />
        <button
          type="button"
          disabled={!currentPolygon || !name.trim()}
          onClick={save}
          className="rounded bg-map-accent px-2 py-1 text-white text-[10px] font-medium disabled:opacity-40"
        >
          Save
        </button>
      </div>
      <div className="mt-1.5 max-h-28 space-y-1 overflow-auto">
        {loading ? <div className="text-map-text-muted">Loading...</div> : null}
        {!loading && items.length === 0 ? <div className="text-map-text-muted">No saved geofences</div> : null}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-1 rounded border border-map-border bg-map-surface/50 px-2 py-1">
            <button
              type="button"
              onClick={() => onApply(item.coordinates)}
              className="min-w-0 flex-1 truncate text-left text-map-accent"
              title={item.name}
            >
              {item.name}
            </button>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded px-1 py-0.5 text-[10px] text-red-400 hover:text-red-300"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
