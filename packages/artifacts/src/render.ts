import type {
  ArtifactSpec,
  ArtifactType,
  HearingDeckPptxArtifactSpec,
  SubmissionChecklistPdfArtifactSpec,
  ExitPackagePdfArtifactSpec,
} from "@entitlement-os/shared";
import { ArtifactSpecSchema } from "@entitlement-os/shared";

import { renderPdfFromHtml } from "./pdf.js";
import { loadTemplateFile } from "./templates.js";
import { buildHearingDeckPptxBytes } from "./pptx/hearingDeck.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function markdownAsHtml(markdown: string): string {
  // v1: we do not implement full markdown; we keep output safe and stable.
  // Basic formatting: preserve line breaks.
  return `<div class="md">${escapeHtml(markdown).replaceAll("\n", "<br/>")}</div>`;
}

async function renderBasePdfHtml(params: {
  templateFilename: string;
  title: string;
  bodyHtml: string;
  sources: string[];
}): Promise<string> {
  const template = await loadTemplateFile(params.templateFilename);
  return template
    .replaceAll("{{TITLE}}", escapeHtml(params.title))
    .replaceAll("{{BODY}}", params.bodyHtml)
    .replaceAll(
      "{{SOURCES}}",
      params.sources.length
        ? `<ul>${params.sources.map((u) => `<li><a href="${escapeHtml(u)}">${escapeHtml(u)}</a></li>`).join("")}</ul>`
        : "<div class=\"muted\">No sources.</div>",
    );
}

function inferFilename(artifactType: ArtifactType): string {
  switch (artifactType) {
    case "TRIAGE_PDF":
      return "triage-report.pdf";
    case "SUBMISSION_CHECKLIST_PDF":
      return "submission-checklist.pdf";
    case "EXIT_PACKAGE_PDF":
      return "exit-package.pdf";
    case "BUYER_TEASER_PDF":
      return "buyer-teaser.pdf";
    case "HEARING_DECK_PPTX":
      return "hearing-deck.pptx";
    default: {
      const exhaustive: never = artifactType;
      return exhaustive;
    }
  }
}

export type RenderedArtifact = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

export async function renderArtifactFromSpec(specInput: ArtifactSpec): Promise<RenderedArtifact> {
  const parsed = ArtifactSpecSchema.parse(specInput);
  const spec = parsed;
  const filename = inferFilename(spec.artifact_type);

  if (spec.artifact_type === "HEARING_DECK_PPTX") {
    const bytes = await buildHearingDeckPptxBytes(spec as HearingDeckPptxArtifactSpec);
    return { filename, contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes };
  }

  let templateFilename = "triage_report.html";
  let bodyHtml = "";

  if (spec.artifact_type === "SUBMISSION_CHECKLIST_PDF") {
    templateFilename = "submission_checklist.html";
    const checklistSpec = spec as SubmissionChecklistPdfArtifactSpec;
    const items = checklistSpec.checklist_items
      .map((i) => {
        const requiredText = i.required ? "Required" : "Optional";
        const src = i.sources.map((u) => `<a href="${escapeHtml(u)}">${escapeHtml(u)}</a>`).join(", ");
        return `<li><div class="row"><span class="item">${escapeHtml(i.item)}</span><span class="pill">${requiredText}</span></div><div class="notes">${escapeHtml(i.notes)}</div><div class="sources">${src}</div></li>`;
      })
      .join("");
    bodyHtml = `
      <section class="section">
        <h2>Checklist</h2>
        <ol class="checklist">${items}</ol>
      </section>
      ${spec.sections.map((s) => `<section class="section"><h2>${escapeHtml(s.heading)}</h2>${markdownAsHtml(s.body_markdown)}</section>`).join("")}
    `;
  } else if (spec.artifact_type === "EXIT_PACKAGE_PDF") {
    templateFilename = "exit_package.html";
    const exitSpec = spec as ExitPackagePdfArtifactSpec;
    const index = exitSpec.evidence_index
      .map((e) => `<li><a href="${escapeHtml(e.url)}">${escapeHtml(e.label)}</a>${e.notes ? ` - ${escapeHtml(e.notes)}` : ""}</li>`)
      .join("");
    bodyHtml = `
      <section class="section">
        <h2>Approval Summary</h2>
        ${markdownAsHtml(exitSpec.approval_summary)}
      </section>
      <section class="section">
        <h2>Conditions Summary</h2>
        ${markdownAsHtml(exitSpec.conditions_summary)}
      </section>
      <section class="section">
        <h2>Evidence Index</h2>
        <ol class="evidence">${index}</ol>
      </section>
      ${spec.sections.map((s) => `<section class="section"><h2>${escapeHtml(s.heading)}</h2>${markdownAsHtml(s.body_markdown)}</section>`).join("")}
    `;
  } else if (spec.artifact_type === "BUYER_TEASER_PDF") {
    templateFilename = "buyer_teaser.html";
    bodyHtml = spec.sections
      .map((s) => `<section class="section"><h2>${escapeHtml(s.heading)}</h2>${markdownAsHtml(s.body_markdown)}</section>`)
      .join("");
  } else {
    templateFilename = "triage_report.html";
    bodyHtml = spec.sections
      .map((s) => `<section class="section"><h2>${escapeHtml(s.heading)}</h2>${markdownAsHtml(s.body_markdown)}</section>`)
      .join("");
  }

  const html = await renderBasePdfHtml({
    templateFilename,
    title: spec.title,
    bodyHtml,
    sources: spec.sources_summary,
  });
  const bytes = await renderPdfFromHtml(html);
  return { filename, contentType: "application/pdf", bytes };
}

