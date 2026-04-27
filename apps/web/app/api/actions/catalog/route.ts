import { NextRequest, NextResponse } from "next/server";
import { listTemplates } from "@gpc/server/workflows/workflow-orchestrator.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";

const ACTION_DEFINITIONS = [
  {
    id: "SCREEN_PARCEL",
    label: "Screen Parcel",
    templateKey: "QUICK_SCREEN",
    description: "Run the quick deal screen against the selected matter.",
    requiredInputs: ["dealId"],
    nextSteps: ["Open deal", "Run acquisition path"],
  },
  {
    id: "RUN_ACQUISITION_PATH",
    label: "Run Acquisition Path",
    templateKey: "ACQUISITION_PATH",
    description: "Build an acquisition decision packet for the selected matter.",
    requiredInputs: ["dealId"],
    nextSteps: ["Open deal", "Review outputs"],
  },
] as const;

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = new Map(listTemplates().map((template) => [template.key, template]));
  const actions = ACTION_DEFINITIONS.map((action) => {
    const template = templates.get(action.templateKey);
    return {
      ...action,
      workflow: template
        ? {
            key: template.key,
            label: template.label,
            description: template.description,
            stepLabels: template.stepLabels,
          }
        : null,
    };
  });

  return NextResponse.json({ actions });
}
