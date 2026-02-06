"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CheckCircle2 } from "lucide-react";

interface EndNodeData extends Record<string, unknown> {
  label: string;
}

type EndNodeType = Node<EndNodeData, "end">;

export const EndNode = memo(({ data }: NodeProps<EndNodeType>) => {
  return (
    <div className="rounded-lg border-2 border-red-500 bg-card px-4 py-2 shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-red-500" />
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
          <CheckCircle2 className="h-4 w-4 text-red-500" />
        </div>
        <span className="font-medium">{data.label}</span>
      </div>
    </div>
  );
});

EndNode.displayName = "EndNode";
