"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";

interface StartNodeData extends Record<string, unknown> {
  label: string;
}

type StartNodeType = Node<StartNodeData, "start">;

export const StartNode = memo(({ data }: NodeProps<StartNodeType>) => {
  return (
    <div className="rounded-lg border-2 border-green-500 bg-card px-4 py-2 shadow-sm">
      <Handle type="source" position={Position.Bottom} className="!bg-green-500" />
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
          <Play className="h-4 w-4 text-green-500" />
        </div>
        <span className="font-medium">{data.label}</span>
      </div>
    </div>
  );
});

StartNode.displayName = "StartNode";
