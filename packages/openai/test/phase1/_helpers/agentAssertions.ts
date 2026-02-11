export function getToolIds(tools: readonly unknown[]): string[] {
  const ids = tools
    .map((tool) => {
      if (!tool || typeof tool !== "object") {
        return undefined;
      }

      const maybeTool = tool as { name?: unknown; type?: unknown };
      if (typeof maybeTool.name === "string" && maybeTool.name.length > 0) {
        return maybeTool.name;
      }
      if (typeof maybeTool.type === "string" && maybeTool.type.length > 0) {
        return maybeTool.type;
      }

      return undefined;
    })
    .filter((id): id is string => Boolean(id));

  return [...new Set(ids)].sort();
}
