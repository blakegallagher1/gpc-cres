import PptxGenJS from "pptxgenjs";
import type { HearingDeckPptxArtifactSpec } from "@entitlement-os/shared";

// Simple, deterministic 10-slide builder. We keep styling minimal in v1
// but stable, so rerenders don't drift.
export async function buildHearingDeckPptxBytes(
  spec: HearingDeckPptxArtifactSpec,
): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  // Title slide (slide 1) is provided by spec.slides[0] and rendered like any other slide.
  const slides = [...spec.slides].sort((a, b) => a.slide_no - b.slide_no);

  for (const slideSpec of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };

    slide.addText(spec.title, {
      x: 0.5,
      y: 0.2,
      w: 12.3,
      h: 0.4,
      fontFace: "Calibri",
      fontSize: 14,
      color: "666666",
    });

    slide.addText(`Slide ${slideSpec.slide_no}/10`, {
      x: 12.2,
      y: 0.2,
      w: 1.1,
      h: 0.4,
      fontFace: "Calibri",
      fontSize: 10,
      color: "999999",
      align: "right",
    });

    slide.addText(slideSpec.title, {
      x: 0.6,
      y: 0.9,
      w: 12.2,
      h: 0.6,
      fontFace: "Calibri",
      fontSize: 28,
      bold: true,
      color: "111111",
    });

    const bulletText = slideSpec.bullets.map((b) => `• ${b}`).join("\n");
    slide.addText(bulletText, {
      x: 0.9,
      y: 1.7,
      w: 12.0,
      h: 5.2,
      fontFace: "Calibri",
      fontSize: 18,
      color: "222222",
      valign: "top",
      lineSpacingMultiple: 1.15,
    });

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
