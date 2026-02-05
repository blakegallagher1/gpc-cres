"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Presentation, Plus, MapPin } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/db/supabase";
import { Project } from "@/types";

export default function DealRoomIndexPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setProjects(data as Project[]);
      }
      setLoading(false);
    };

    loadProjects();
  }, []);

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
          <Button className="gap-2" variant="secondary">
            <Plus className="h-4 w-4" />
            New Deal Room
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading projects...
            </CardContent>
          </Card>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No projects found. Create a project to start a deal room.
            </CardContent>
          </Card>
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
