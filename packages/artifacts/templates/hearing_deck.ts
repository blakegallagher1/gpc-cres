// Spec compatibility shim:
// The Entitlement OS v1.0 spec references `packages/artifacts/templates/hearing_deck.ts`.
// The actual PPTX builder lives in `src/pptx/hearingDeck.ts` and is used by the renderer.
export { buildHearingDeckPptxBytes } from "../src/pptx/hearingDeck.js";
