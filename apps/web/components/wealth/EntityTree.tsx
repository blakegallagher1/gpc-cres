"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type WealthEntity as Entity } from "@/lib/data/wealthTypes";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, Building2, Landmark, Briefcase, User } from "lucide-react";

const ENTITY_ICONS: Record<Entity["type"], React.ElementType> = {
  LLC: Building2,
  Trust: Landmark,
  Corp: Briefcase,
  Individual: User,
};

const ENTITY_COLORS: Record<Entity["type"], string> = {
  LLC: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  Trust: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  Corp: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  Individual: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

interface EntityNodeProps {
  entity: Entity;
  children: Entity[];
  allEntities: Entity[];
  depth: number;
}

function EntityNode({ entity, children, allEntities, depth }: EntityNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const Icon = ENTITY_ICONS[entity.type];
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent/50 cursor-pointer",
          ENTITY_COLORS[entity.type]
        )}
        style={{ marginLeft: depth * 24 }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          )
        ) : (
          <div className="w-4" />
        )}
        <Icon className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{entity.name}</p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {entity.type}
        </Badge>
        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
          {entity.ownershipPct}%
        </span>
      </div>

      {expanded &&
        children.map((child) => {
          const grandchildren = allEntities.filter((e) => e.parentId === child.id);
          return (
            <EntityNode
              key={child.id}
              entity={child}
              children={grandchildren}
              allEntities={allEntities}
              depth={depth + 1}
            />
          );
        })}
    </div>
  );
}

interface EntityTreeProps {
  entities: Entity[];
  className?: string;
}

export function EntityTree({ entities, className }: EntityTreeProps) {
  const roots = entities.filter((e) => e.parentId === null);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Entity Structure</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {roots.map((root) => {
            const children = entities.filter((e) => e.parentId === root.id);
            return (
              <EntityNode
                key={root.id}
                entity={root}
                children={children}
                allEntities={entities}
                depth={0}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
