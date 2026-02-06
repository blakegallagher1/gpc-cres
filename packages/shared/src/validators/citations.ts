import { ParishPackSchema, type ParishPack } from "../schemas/parishPack.js";

export class CitationValidationError extends Error {
  public readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = "CitationValidationError";
    this.errors = errors;
  }
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isOfficialUrl(url: string, officialDomains: string[]): boolean {
  const host = getHostname(url);
  if (!host) return false;
  return officialDomains.some((d) => host === d || host.endsWith(`.${d}`));
}

function collectProcessClaimSources(pack: ParishPack): string[] {
  const urls: string[] = [];

  for (const opt of pack.paths.options) urls.push(...opt.sources);
  for (const m of pack.meeting_cadence) urls.push(...m.sources);
  for (const req of pack.application_requirements) {
    urls.push(...req.sources);
    for (const doc of req.required_docs) urls.push(...doc.sources);
  }
  for (const fee of pack.fees) urls.push(...fee.sources);
  for (const rule of pack.notice_rules) urls.push(...rule.sources);

  return urls;
}

export type ParishPackValidationResult =
  | { ok: true; pack: ParishPack }
  | { ok: false; errors: string[] };

export function validateParishPackSchemaAndCitations(
  input: unknown,
  officialDomains: string[],
): ParishPackValidationResult {
  const parsed = ParishPackSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
    };
  }

  const pack = parsed.data;
  const errors: string[] = [];

  const sourcesSummary = new Set(pack.sources_summary);
  const processSources = collectProcessClaimSources(pack);

  for (const url of processSources) {
    if (!sourcesSummary.has(url)) {
      errors.push(`sources_summary missing url referenced by a process claim: ${url}`);
    }
  }

  const sectionChecks: Array<{ section: string; urls: string[] }> = [
    { section: "meeting_cadence", urls: pack.meeting_cadence.flatMap((m) => m.sources) },
    {
      section: "application_requirements",
      urls: pack.application_requirements.flatMap((r) => [
        ...r.sources,
        ...r.required_docs.flatMap((d) => d.sources),
      ]),
    },
    { section: "fees", urls: pack.fees.flatMap((f) => f.sources) },
    { section: "notice_rules", urls: pack.notice_rules.flatMap((n) => n.sources) },
  ];

  for (const { section, urls } of sectionChecks) {
    if (!urls.some((u) => isOfficialUrl(u, officialDomains))) {
      errors.push(`section ${section} is missing at least one official-domain source`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, pack };
}

export function assertParishPackSchemaAndCitations(
  input: unknown,
  officialDomains: string[],
): ParishPack {
  const result = validateParishPackSchemaAndCitations(input, officialDomains);
  if (!result.ok) {
    throw new CitationValidationError("Parish pack failed schema/citation validation", result.errors);
  }
  return result.pack;
}

