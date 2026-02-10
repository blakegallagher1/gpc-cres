import PptxGenJS from "pptxgenjs";
import type { IcDeckPptxArtifactSpec } from "@entitlement-os/shared";

// GPC brand colors
const BRAND_NAVY = "1B2A4A";
const BRAND_GOLD = "C9A84C";
const TEXT_DARK = "111111";
const TEXT_LIGHT = "FFFFFF";
const TEXT_MUTED = "666666";

/**
 * Build an Investment Committee (IC) deck PPTX from a spec.
 * Up to 12 slides. Professional layout with GPC branding.
 */
export async function buildIcDeckPptxBytes(
  spec: IcDeckPptxArtifactSpec,
): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Gallagher Property Company";
  pptx.subject = spec.title;

  const slides = [...spec.slides].sort((a, b) => a.slide_no - b.slide_no);
  const totalSlides = slides.length;

  for (const slideSpec of slides) {
    const slide = pptx.addSlide();

    // First slide gets navy background as title slide
    if (slideSpec.slide_no === 1) {
      slide.background = { color: BRAND_NAVY };

      // Company name
      slide.addText("GALLAGHER PROPERTY COMPANY", {
        x: 0.5,
        y: 0.4,
        w: 12.3,
        h: 0.4,
        fontFace: "Calibri",
        fontSize: 12,
        color: BRAND_GOLD,
        bold: true,
        charSpacing: 3,
      });

      // Deck title
      slide.addText(spec.title, {
        x: 0.5,
        y: 1.5,
        w: 12.3,
        h: 1.0,
        fontFace: "Calibri",
        fontSize: 36,
        bold: true,
        color: TEXT_LIGHT,
      });

      // Subtitle line — "Investment Committee Presentation"
      slide.addText("Investment Committee Presentation", {
        x: 0.5,
        y: 2.7,
        w: 12.3,
        h: 0.5,
        fontFace: "Calibri",
        fontSize: 18,
        color: BRAND_GOLD,
      });

      // Bullet content (deal highlights)
      const bulletText = slideSpec.bullets.map((b) => `\u2022  ${b}`).join("\n");
      slide.addText(bulletText, {
        x: 0.7,
        y: 3.8,
        w: 12.0,
        h: 3.0,
        fontFace: "Calibri",
        fontSize: 16,
        color: TEXT_LIGHT,
        valign: "top",
        lineSpacingMultiple: 1.3,
      });

      // Gold accent bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5,
        y: 3.4,
        w: 2.0,
        h: 0.04,
        fill: { color: BRAND_GOLD },
      });
    } else {
      // Content slides — white background with navy header bar
      slide.background = { color: "FFFFFF" };

      // Top header bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 0.06,
        fill: { color: BRAND_NAVY },
      });

      // Deck title in header
      slide.addText(spec.title, {
        x: 0.5,
        y: 0.2,
        w: 10.0,
        h: 0.35,
        fontFace: "Calibri",
        fontSize: 11,
        color: TEXT_MUTED,
      });

      // Slide counter
      slide.addText(`${slideSpec.slide_no} / ${totalSlides}`, {
        x: 11.5,
        y: 0.2,
        w: 1.3,
        h: 0.35,
        fontFace: "Calibri",
        fontSize: 10,
        color: TEXT_MUTED,
        align: "right",
      });

      // Slide title
      slide.addText(slideSpec.title, {
        x: 0.6,
        y: 0.75,
        w: 12.2,
        h: 0.6,
        fontFace: "Calibri",
        fontSize: 26,
        bold: true,
        color: BRAND_NAVY,
      });

      // Gold underline
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.6,
        y: 1.35,
        w: 1.5,
        h: 0.03,
        fill: { color: BRAND_GOLD },
      });

      // Bullet content
      const bulletText = slideSpec.bullets.map((b) => `\u2022  ${b}`).join("\n");
      slide.addText(bulletText, {
        x: 0.9,
        y: 1.6,
        w: 11.8,
        h: 5.4,
        fontFace: "Calibri",
        fontSize: 17,
        color: TEXT_DARK,
        valign: "top",
        lineSpacingMultiple: 1.2,
      });
    }

    // Speaker notes
    const notesParts: string[] = [slideSpec.speaker_notes];
    if (slideSpec.sources && slideSpec.sources.length > 0) {
      notesParts.push("");
      notesParts.push("Sources:");
      for (const url of slideSpec.sources) notesParts.push(`- ${url}`);
    }
    slide.addNotes(notesParts.join("\n"));
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return new Uint8Array(buffer);
}
