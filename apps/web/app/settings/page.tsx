import Link from "next/link";
import { Bell, Bot, Command, Shield, Sparkles, UserCog } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPreferencesPanel } from "@/components/preferences/UserPreferencesPanel";

const SETTINGS_LINKS = [
  {
    title: "Copilot and Codex",
    description: "Reconnect Codex, inspect the operator workspace, and review AI tooling access.",
    icon: Bot,
    href: "/admin/codex",
  },
  {
    title: "Notifications",
    description: "Decide which events should interrupt you versus stay in the command center.",
    icon: Bell,
    href: "/command-center",
  },
  {
    title: "Security and access",
    description: "Review admin access paths and session expectations for the current workspace.",
    icon: Shield,
    href: "/admin",
  },
];

export default function SettingsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card px-5 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="w-fit gap-2 px-3 py-1 uppercase tracking-[0.22em]">
                <Command className="h-3.5 w-3.5" />
                Settings
              </Badge>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Operator settings</h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  This replaces the dead palette route with a real settings surface for learned
                  preferences, operator tooling, and workspace controls.
                </p>
              </div>
            </div>

            <Link
              href="/admin/codex"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              <Sparkles className="h-4 w-4" />
              Open Codex workspace
            </Link>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Learned preferences</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <UserPreferencesPanel />
            </CardContent>
          </Card>

          <div className="space-y-4">
            {SETTINGS_LINKS.map((section) => {
              const Icon = section.icon;

              return (
                <Link
                  key={section.title}
                  href={section.href}
                  className="block rounded-2xl border border-border bg-card px-5 py-5 transition hover:bg-muted"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <h2 className="text-base font-semibold">{section.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
