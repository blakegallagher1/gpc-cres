"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type UserPreference = {
  id: string;
  category: string;
  key: string;
  value: unknown;
  valueType: string;
  confidence: number;
  sourceCount: number;
  extractedFrom: string;
  evidenceSnippet?: string | null;
  isActive: boolean;
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function labelize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function UserPreferencesPanel() {
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadPreferences() {
    const response = await fetch("/api/preferences");
    if (!response.ok) {
      setPreferences([]);
      setLoading(false);
      return;
    }
    const payload = (await response.json()) as { preferences: UserPreference[] };
    setPreferences(payload.preferences ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadPreferences();
  }, []);

  const grouped = useMemo(() => {
    return preferences.reduce<Record<string, UserPreference[]>>((acc, pref) => {
      if (!acc[pref.category]) acc[pref.category] = [];
      acc[pref.category].push(pref);
      return acc;
    }, {});
  }, [preferences]);

  async function updatePreference(
    id: string,
    patch: { confidence?: number; isActive?: boolean },
  ) {
    await fetch(`/api/preferences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await loadPreferences();
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (preferences.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          No learned preferences yet. Keep chatting and the assistant will learn
          your criteria automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([category, rows]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{labelize(category)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((pref) => (
              <div
                key={pref.id}
                className="rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{labelize(pref.key)}</p>
                      <Badge variant={pref.confidence >= 0.8 ? "default" : "secondary"}>
                        {Math.round(pref.confidence * 100)}%
                      </Badge>
                      {pref.sourceCount > 1 && (
                        <Badge variant="outline">{pref.sourceCount} mentions</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Value: {formatValue(pref.value)}
                    </p>
                    {pref.evidenceSnippet && (
                      <p className="text-xs italic text-muted-foreground">
                        "{pref.evidenceSnippet}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Math.round(pref.confidence * 100)}
                      onChange={(event) => {
                        const confidence = Number(event.currentTarget.value) / 100;
                        void updatePreference(pref.id, {
                          confidence,
                          isActive: confidence > 0,
                        });
                      }}
                    />
                    <Switch
                      checked={pref.isActive}
                      onCheckedChange={(checked) =>
                        void updatePreference(pref.id, { isActive: checked })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
