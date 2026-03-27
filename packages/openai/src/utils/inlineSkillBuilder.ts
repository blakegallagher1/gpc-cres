/**
 * Converts learned procedural skills into base64 inline skill format
 * for the OpenAI Responses API shell tool (P2 Pattern 29).
 */

export type ProceduralSkillInput = {
  name: string;
  description: string;
  toolSequence?: string[];
  strategy?: string;
  codeSnippet?: string;
  notes?: string;
};

export type InlineSkill = {
  type: "inline";
  name: string;
  description: string;
  source: {
    type: "base64";
    media_type: "application/zip";
    data: string;
  };
};

/**
 * Build SKILL.md content from a procedural skill.
 */
export function buildSkillManifest(skill: ProceduralSkillInput): string {
  const lines: string[] = [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    "---",
    "",
  ];

  if (skill.strategy) {
    lines.push("## Strategy", "", skill.strategy, "");
  }

  if (skill.toolSequence && skill.toolSequence.length > 0) {
    lines.push("## Tool Sequence", "");
    skill.toolSequence.forEach((tool, i) => {
      lines.push(`${i + 1}. ${tool}`);
    });
    lines.push("");
  }

  if (skill.codeSnippet) {
    lines.push("## Code", "", "```javascript", skill.codeSnippet, "```", "");
  }

  if (skill.notes) {
    lines.push("## Notes", "", skill.notes, "");
  }

  return lines.join("\n");
}

/**
 * Encode a SKILL.md into a base64 "zip" for inline skill format.
 * Note: This uses a simple base64 encoding of the manifest content.
 * A real implementation would create an actual zip archive.
 * For now, we encode the manifest directly as the OpenAI API
 * also accepts uncompressed skill content in some modes.
 */
export function encodeSkillContent(manifest: string): string {
  return Buffer.from(manifest, "utf-8").toString("base64");
}

/**
 * Build a complete inline skill from a procedural skill record.
 */
export function buildInlineSkill(skill: ProceduralSkillInput): InlineSkill {
  const manifest = buildSkillManifest(skill);
  return {
    type: "inline",
    name: skill.name,
    description: skill.description,
    source: {
      type: "base64",
      media_type: "application/zip",
      data: encodeSkillContent(manifest),
    },
  };
}

/**
 * Check if a procedural skill has enough content to be useful as an inline skill.
 */
export function isSkillViable(skill: ProceduralSkillInput): boolean {
  return Boolean(
    skill.name &&
    skill.description &&
    (
      skill.strategy ||
      skill.codeSnippet ||
      (skill.toolSequence && skill.toolSequence.length > 0)
    )
  );
}
