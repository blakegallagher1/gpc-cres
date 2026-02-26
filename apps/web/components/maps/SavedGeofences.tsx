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
    <div data-tour="geofences" className="absolute right-2 top-32 z-10 w-72 rounded-lg border bg-white/95 p-2 text-xs shadow-lg">
      <div className="text-[11px] font-semibold uppercase text-gray-600">Saved Geofences</div>
      <div className="mt-1 flex gap-1">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Geofence name"
          className="min-w-0 flex-1 rounded border px-2 py-1"
        />
        <button
          type="button"
          disabled={!currentPolygon || !name.trim()}
          onClick={save}
          className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <div className="mt-2 max-h-44 space-y-1 overflow-auto">
        {loading ? <div className="text-gray-500">Loading...</div> : null}
        {!loading && items.length === 0 ? <div className="text-gray-500">No saved geofences</div> : null}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-1 rounded border bg-white px-2 py-1">
            <button
              type="button"
              onClick={() => onApply(item.coordinates)}
              className="min-w-0 flex-1 truncate text-left text-blue-700"
              title={item.name}
            >
              {item.name}
            </button>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded border px-1 py-0.5 text-[10px] text-red-600"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
