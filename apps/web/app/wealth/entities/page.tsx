"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Building2,
  Landmark,
  Briefcase,
  User,
  MoreHorizontal,
  ChevronRight,
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
import { type Entity, mockEntities } from "@/lib/data/mockWealth";
import { mockDeals } from "@/lib/data/mockPortfolio";
import { cn } from "@/lib/utils";

const ENTITY_ICONS: Record<Entity["type"], React.ElementType> = {
  LLC: Building2,
  Trust: Landmark,
  Corp: Briefcase,
  Individual: User,
};

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>(mockEntities);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEntity, setNewEntity] = useState({
    name: "",
    type: "LLC" as Entity["type"],
    parentId: "" as string,
    ownershipPct: 100,
    state: "LA",
  });

  function handleAdd() {
    if (!newEntity.name.trim()) return;
    const entity: Entity = {
      id: `e${Date.now()}`,
      name: newEntity.name,
      type: newEntity.type,
      parentId: newEntity.parentId || null,
      ownershipPct: newEntity.ownershipPct,
      state: newEntity.state,
      associatedDealIds: [],
    };
    setEntities([...entities, entity]);
    setNewEntity({ name: "", type: "LLC", parentId: "", ownershipPct: 100, state: "LA" });
    setDialogOpen(false);
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Entity
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Entity</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Entity Name</Label>
                  <Input
                    placeholder="e.g. GPC Storage II LLC"
                    value={newEntity.name}
                    onChange={(e) =>
                      setNewEntity({ ...newEntity, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={newEntity.type}
                      onValueChange={(v) =>
                        setNewEntity({ ...newEntity, type: v as Entity["type"] })
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
                      value={newEntity.state}
                      onChange={(e) =>
                        setNewEntity({ ...newEntity, state: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Parent Entity</Label>
                    <Select
                      value={newEntity.parentId}
                      onValueChange={(v) =>
                        setNewEntity({ ...newEntity, parentId: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="None (root)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None (root)</SelectItem>
                        {entities.map((e) => (
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
                      value={newEntity.ownershipPct}
                      onChange={(e) =>
                        setNewEntity({
                          ...newEntity,
                          ownershipPct: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <Button onClick={handleAdd} className="w-full">
                  Create Entity
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Entity Tree */}
      <EntityTree entities={entities} className="mb-6" />

      {/* Entity List with Deals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Entities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {entities.map((entity) => {
              const Icon = ENTITY_ICONS[entity.type];
              const parent = entities.find((e) => e.id === entity.parentId);
              const associatedDeals = mockDeals.filter((d) =>
                entity.associatedDealIds.includes(d.id)
              );
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
                      {parent && associatedDeals.length > 0 && (
                        <span className="text-xs text-muted-foreground">|</span>
                      )}
                      {associatedDeals.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {associatedDeals.length} deal{associatedDeals.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {entity.ownershipPct}%
                  </span>
                  <span className="text-xs text-muted-foreground">{entity.state}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
