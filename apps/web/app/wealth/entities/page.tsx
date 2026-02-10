"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  Plus,
  Building2,
  Landmark,
  Briefcase,
  User,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EntityTree } from "@/components/wealth/EntityTree";
import { type WealthEntity } from "@/lib/data/wealthTypes";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const ENTITY_ICONS: Record<WealthEntity["type"], React.ElementType> = {
  LLC: Building2,
  Trust: Landmark,
  Corp: Briefcase,
  Individual: User,
};

interface ApiEntity {
  id: string;
  name: string;
  entityType: string;
  parentId: string | null;
  ownershipPct: string;
  state: string | null;
  taxId: string | null;
  deals: Array<{ deal: { id: string; name: string } }>;
  _count: { taxEvents: number };
}

export default function EntitiesPage() {
  const {
    data,
    isLoading,
    mutate,
  } = useSWR<{ entities: ApiEntity[] }>("/api/entities", fetcher);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    entityType: "LLC" as WealthEntity["type"],
    parentId: "" as string,
    ownershipPct: 100,
    state: "LA",
  });

  const entities: WealthEntity[] = (data?.entities ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.entityType as WealthEntity["type"],
    parentId: e.parentId,
    ownershipPct: Number(e.ownershipPct),
    taxId: e.taxId ?? undefined,
    state: e.state ?? "LA",
    associatedDealIds: e.deals.map((d) => d.deal.id),
  }));

  function resetForm() {
    setFormData({
      name: "",
      entityType: "LLC",
      parentId: "",
      ownershipPct: 100,
      state: "LA",
    });
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(entity: WealthEntity) {
    setFormData({
      name: entity.name,
      entityType: entity.type,
      parentId: entity.parentId ?? "",
      ownershipPct: entity.ownershipPct,
      state: entity.state,
    });
    setEditingId(entity.id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formData.name.trim()) return;
    setSaving(true);

    const body = {
      name: formData.name,
      entityType: formData.entityType,
      parentId: formData.parentId || null,
      ownershipPct: formData.ownershipPct,
      state: formData.state,
    };

    if (editingId) {
      await fetch(`/api/entities/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    mutate();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/entities/${id}`, { method: "DELETE" });
    setDeleting(null);
    mutate();
  }

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/wealth"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Wealth Dashboard
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Entity Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage your corporate structure and entity hierarchy
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add Entity
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Entity" : "Add New Entity"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Entity Name</Label>
                  <Input
                    placeholder="e.g. GPC Storage II LLC"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={formData.entityType}
                      onValueChange={(v) =>
                        setFormData({ ...formData, entityType: v as WealthEntity["type"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LLC">LLC</SelectItem>
                        <SelectItem value="Trust">Trust</SelectItem>
                        <SelectItem value="Corp">Corporation</SelectItem>
                        <SelectItem value="Individual">Individual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) =>
                        setFormData({ ...formData, state: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Parent Entity</Label>
                    <Select
                      value={formData.parentId}
                      onValueChange={(v) =>
                        setFormData({ ...formData, parentId: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None (root)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None (root)</SelectItem>
                        {entities
                          .filter((e) => e.id !== editingId)
                          .map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Ownership %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.ownershipPct}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          ownershipPct: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <Button onClick={handleSave} className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Entity"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Entity Tree */}
      <EntityTree entities={entities} className="mb-6" />

      {/* Entity List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Entities</CardTitle>
        </CardHeader>
        <CardContent>
          {entities.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No entities yet. Create your first entity to start building your corporate structure.
            </div>
          ) : (
            <div className="space-y-2">
              {entities.map((entity) => {
                const Icon = ENTITY_ICONS[entity.type];
                const parent = entities.find((e) => e.id === entity.parentId);
                const dealCount = entity.associatedDealIds.length;
                return (
                  <div
                    key={entity.id}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{entity.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {entity.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {parent && (
                          <span className="text-xs text-muted-foreground">
                            {parent.name}
                          </span>
                        )}
                        {parent && dealCount > 0 && (
                          <span className="text-xs text-muted-foreground">|</span>
                        )}
                        {dealCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {dealCount} deal{dealCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {entity.ownershipPct}%
                    </span>
                    <span className="text-xs text-muted-foreground">{entity.state}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(entity)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(entity.id)}
                        disabled={deleting === entity.id}
                      >
                        {deleting === entity.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
