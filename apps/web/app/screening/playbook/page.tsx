"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function ScreeningPlaybookPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsText, setSettingsText] = useState("");
  const [version, setVersion] = useState<number | null>(null);

  const loadPlaybook = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/screening/playbook`);
      if (!response.ok) {
        throw new Error("Failed to fetch playbook");
      }
      const payload = (await response.json()) as {
        active?: { settings?: Record<string, unknown>; version?: number };
      };
      setVersion(payload.active?.version ?? null);
      setSettingsText(JSON.stringify(payload.active?.settings ?? {}, null, 2));
    } catch (error) {
      console.error("Failed to load playbook:", error);
      toast.error("Failed to load playbook");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaybook();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const settings = JSON.parse(settingsText);
      const response = await fetch(`${backendUrl}/screening/playbook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, created_by: "owner" }),
      });
      if (!response.ok) {
        throw new Error("Failed to update playbook");
      }
      toast.success("Playbook updated. Re-screening queued.");
      await loadPlaybook();
    } catch (error) {
      console.error("Failed to update playbook:", error);
      toast.error("Playbook update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Screening Playbook</h1>
          <p className="text-sm text-muted-foreground">
            Adjust thresholds and weights. Updates trigger a background re-screen.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                Active Version {version ?? "--"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Edit the JSON settings below to publish a new version.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push("/screening")}>
                Back
              </Button>
              <Button className="gap-2" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Playbook"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading playbook...</p>
            ) : (
              <Textarea
                value={settingsText}
                onChange={(event) => setSettingsText(event.target.value)}
                className="min-h-[360px] font-mono text-xs"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
