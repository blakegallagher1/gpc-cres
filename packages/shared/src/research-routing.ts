export type ResearchLane = "local_first" | "public_web" | "interactive_browser";
export type ResearchLaneSelection = ResearchLane | "auto";

const INTERACTIVE_BROWSER_PATTERNS = [
  /\blog\s*in\b/i,
  /\bsign\s*in\b/i,
  /\bclick\b/i,
  /\bnavigate\b/i,
  /\bopen\b.*\bsite\b/i,
  /\bfill\s+out\b/i,
  /\bsubmit\b/i,
  /\bportal\b/i,
  /\bform\b/i,
  /\bsearch\s+on\b/i,
  /\blacdb\b/i,
  /\bassessor\b/i,
  /\bfema\b/i,
] as const;

const PUBLIC_WEB_PATTERNS = [
  /\bfor\s+lease\b/i,
  /\bfor\s+sale\b/i,
  /\blisted\b/i,
  /\blistings?\b/i,
  /\bavailable\b/i,
  /\bavailability\b/i,
  /\bloopnet\b/i,
  /\bcrexi\b/i,
  /\bcommercial\s+real\s+estate\b/i,
  /\bcurrent\b/i,
  /\brecent\b/i,
  /\blatest\b/i,
  /\bnews\b/i,
  /\bheadline\b/i,
  /\bpublic\s+web\b/i,
  /\bweb\s+research\b/i,
  /\bresearch\b/i,
  /\bfind\b.*\bsource/i,
  /\bcite\b/i,
  /\bregulatory\b/i,
  /\bzoning\s+update\b/i,
  /\bmarket\b/i,
  /\btrend\b/i,
] as const;

export function inferResearchLane(input: string): ResearchLane {
  if (INTERACTIVE_BROWSER_PATTERNS.some((pattern) => pattern.test(input))) {
    return "interactive_browser";
  }

  if (PUBLIC_WEB_PATTERNS.some((pattern) => pattern.test(input))) {
    return "public_web";
  }

  return "local_first";
}

export function resolveResearchLane(
  input: string,
  selection: ResearchLaneSelection = "auto",
): ResearchLane {
  return selection === "auto" ? inferResearchLane(input) : selection;
}

export function getResearchLaneLabel(lane: ResearchLane): string {
  switch (lane) {
    case "local_first":
      return "Database + knowledge";
    case "public_web":
      return "Perplexity web research";
    case "interactive_browser":
      return "Interactive browser";
  }
}

export function buildResearchRoutingMessage(
  input: string,
  selection: ResearchLaneSelection = "auto",
): string {
  const preferredLane = resolveResearchLane(input, selection);

  const preferredLaneInstruction =
    preferredLane === "interactive_browser"
      ? "This request appears interactive. Use browser_task only if the task truly requires live navigation or form interaction."
      : preferredLane === "public_web"
        ? "This request appears to need public web research. Use Perplexity for public sources after checking local evidence first."
        : "This request appears answerable from local evidence. Start with the property database, knowledge base, and stored evidence before using any web tools.";

  return [
    "RESEARCH ROUTING CONTRACT",
    "You have exactly three lanes for gathering an answer:",
    "1. Local evidence first: search the property database, deal data, parcel data, and knowledge base when they can answer the request.",
    "2. Public web research: use Perplexity tools for public web content, current events, market research, government updates, and source-cited web findings.",
    "3. Interactive browser work: use browser_task only when the task requires login, clicking, filling forms, JavaScript-heavy portals, or other live interaction.",
    "Do not use browser_task for normal public-web research.",
    "Always prefer the lowest-cost lane that can answer the question with reliable evidence.",
    `Selected lane: ${selection === "auto" ? `Auto -> ${getResearchLaneLabel(preferredLane)}` : getResearchLaneLabel(preferredLane)}.`,
    preferredLaneInstruction,
  ].join("\n");
}
