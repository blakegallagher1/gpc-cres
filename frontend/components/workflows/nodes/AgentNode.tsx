"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import { useAgents } from "@/lib/hooks/useAgents";

interface AgentNodeData extends Record<string, unknown> {
  agentId: string;
  label: string;
}

type AgentNodeType = Node<AgentNodeData, "agent">;

export const AgentNode = memo(({ data }: NodeProps<AgentNodeType>) => {
  const { agents } = useAgents();
  const agent = agents.find((a) => a.id === data.agentId);
  const color = agent?.color || "#6B7280";

  return (
    <div
      className="rounded-lg border-2 bg-card px-4 py-3 shadow-sm transition-all hover:shadow-md"
      style={{ borderColor: color }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3"
        style={{ backgroundColor: color }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}20` }}
        >
          <Bot className="h-5 w-5" style={{ color }} />
        </div>
        <div>
          <p className="font-medium">{data.label}</p>
          <p className="text-xs text-muted-foreground">{agent?.model}</p>
        </div>
      </div>
    </div>
  );
});

AgentNode.displayName = "AgentNode";
