"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Plus, Presentation } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/db/supabase";
import { Project } from "@/types";
import { toast } from "sonner";
import { GuidedOnboardingPanel } from "@/components/onboarding/GuidedOnboardingPanel";

const DEAL_ROOM_PRESETS = [
  {
    name: "Industrial Portfolio - East Baton Rouge",
    address: "1214 Bluebonnet Ave, Baton Rouge, LA",
  },
  {
    name: "Industrial Portfolio - Ascension",
    address: "560 Highway 30 N, Gonzales, LA",
  },
];

const emptyStateStepText =
  "No projects found. Create a project to start a deal room.";

export default function DealRoomIndexPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setProjects(data as Project[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const createProject = async (preset: (typeof DEAL_ROOM_PRESETS)[number]) => {
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: preset.name,
          address: preset.address,
          status: "active",
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error("Could not create deal room");

      toast.success(`Created "${preset.name}"`);
      loadProjects();
    } catch (error) {
      console.error("Failed to create deal room:", error);
      toast.error("Failed to create deal room");
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Deal Rooms</h1>
            <p className="text-muted-foreground">
              Live collaboration hubs for underwriting, DD, and packaging.
            </p>
          </div>
          <Button asChild className="gap-2" variant="secondary">
            <Link href="/screening/intake">
              <Plus className="h-4 w-4" />
              New Deal Room
            </Link>
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading projects...
            </CardContent>
          </Card>
        ) : projects.length === 0 ? (
          <GuidedOnboardingPanel
            icon={<Presentation className="h-4 w-4" />}
            title="No active deal rooms"
            description={emptyStateStepText}
            steps={[
              {
                title: "Create a screening project",
                description:
                  "Run a screening intake first to capture structured property data and scoring.",
              },
              {
                title: "Open a deal room from the intake",
                description:
                  "Project records automatically map to the collaboration workspace.",
              },
              {
                title: "Attach tasks, files, and notes",
                description:
                  "Coordinate diligence, agents, and workflows from one shared view.",
              },
            ]}
            primaryActions={[
              {
                label: "Start new screening intake",
                icon: <Plus className="h-3.5 w-3.5" />,
                href: "/screening/intake",
              },
              {
                label: creating ? "Creating..." : "Create sample room",
                icon: creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Presentation className="h-3.5 w-3.5" />
                ),
                disabled: creating,
                onClick: () => createProject(DEAL_ROOM_PRESETS[0]),
              },
            ]}
            sampleActions={DEAL_ROOM_PRESETS.map((preset) => ({
              name: preset.name,
              description: `Seed room with address: ${preset.address}`,
              actionLabel: "Load sample room",
              action: {
                label: "Load sample room",
                icon: <Plus className="h-3.5 w-3.5" />,
                disabled: creating,
                onClick: () => createProject(preset),
              },
            }))}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className="transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    {project.address && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {project.address}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary">{project.status ?? "active"}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Presentation className="h-4 w-4" />
                    Deal room ready
                  </div>
                  <Button asChild className="w-full">
                    <Link href={`/deal-room/${project.id}`}>Open Deal Room</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
