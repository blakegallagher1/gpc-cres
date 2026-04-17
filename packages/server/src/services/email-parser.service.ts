/**
 * Email parser for MOAT-P4-001 email-to-deal ingestion.
 *
 * Extracts structured fields from broker deal-submission emails using
 * deterministic regex heuristics (no LLM). The goal is not perfection but
 * high-precision auto-fill of 3+ fields per email; anything the regex can't
 * extract is left null so a human analyst can complete the record.
 */

export interface ParsedEmailFields {
  propertyAddress: string | null;
  askPrice: number | null;
  acreage: number | null;
  brokerName: string | null;
  brokerCompany: string | null;
  brokerEmail: string | null;
  brokerPhone: string | null;
  dealSourceHint: string | null;
}

export interface ParseEmailInput {
  subject: string;
  body: string;
  from: string;
}

// -----------------------------------------------------------------------------
// Price parsing
// -----------------------------------------------------------------------------

/**
 * Parse strings like "$1,250,000", "$1.25M", "$1.5MM", "$500K", "1.25 million".
 * Returns a dollar amount as a plain number (e.g. 1_250_000) or null.
 */
function parsePrice(body: string): number | null {
  // Pattern 1: $X.XM / $X.XMM / $XM  (millions)
  const millionMatch = body.match(
    /\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:MM|M\b|million\b)/i,
  );
  if (millionMatch && millionMatch[1]) {
    const num = Number.parseFloat(millionMatch[1]);
    if (Number.isFinite(num)) {
      return Math.round(num * 1_000_000);
    }
  }

  // Pattern 2: $XK (thousands)
  const thousandMatch = body.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:K\b|thousand\b)/i);
  if (thousandMatch && thousandMatch[1]) {
    const num = Number.parseFloat(thousandMatch[1]);
    if (Number.isFinite(num)) {
      return Math.round(num * 1_000);
    }
  }

  // Pattern 3: $X,XXX,XXX (comma-grouped number)
  const commaMatch = body.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)/);
  if (commaMatch && commaMatch[1]) {
    const num = Number.parseFloat(commaMatch[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num >= 10_000) {
      return Math.round(num);
    }
  }

  // Pattern 4: "X.X million" (no dollar sign)
  const bareMillionMatch = body.match(/\b([0-9]+(?:\.[0-9]+)?)\s*million\b/i);
  if (bareMillionMatch && bareMillionMatch[1]) {
    const num = Number.parseFloat(bareMillionMatch[1]);
    if (Number.isFinite(num)) {
      return Math.round(num * 1_000_000);
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// Acreage parsing
// -----------------------------------------------------------------------------

function parseAcreage(body: string): number | null {
  // Common patterns: "12.5 acres", "±50 acres", "approx 100 ac", "80 AC"
  const match = body.match(
    /(?:±|approx\.?|~|about\s+)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:acres?|ac\b)/i,
  );
  if (match && match[1]) {
    const num = Number.parseFloat(match[1]);
    if (Number.isFinite(num) && num > 0 && num < 100_000) {
      return num;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Address parsing
// -----------------------------------------------------------------------------

/**
 * Loose US-address heuristic: "<number> <street words> <suffix>[, <city>[, <ST>
 * [ZIP]]]". We keep this intentionally permissive — the goal is 50%+ capture,
 * not 100%.
 */
function parseAddress(body: string): string | null {
  const streetSuffixes =
    "St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Hwy|Highway|Pkwy|Parkway|Ct|Court|Way|Pl|Place|Terrace|Ter|Cir|Circle|Loop|Trail|Trl";

  // Pattern: <number> <words> <suffix>(, <city>)?(, <ST>)?( <zip>)?
  const pattern = new RegExp(
    String.raw`\b(\d{1,6}\s+(?:[A-Z][\w'.-]*\s+){1,6}(?:${streetSuffixes})\.?(?:\s*,\s*[A-Za-z][\w\s'.-]{1,40})?(?:\s*,\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?)`,
    "",
  );
  const match = body.match(pattern);
  if (match && match[1]) {
    // Trim anything after a newline and collapse whitespace
    const raw = match[1].split(/\r?\n/)[0] ?? match[1];
    return raw.replace(/\s+/g, " ").trim();
  }

  return null;
}

// -----------------------------------------------------------------------------
// Contact parsing
// -----------------------------------------------------------------------------

function parseEmail(text: string): string | null {
  const match = text.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return match && match[1] ? match[1].toLowerCase() : null;
}

function parsePhone(text: string): string | null {
  // Matches (504) 555-1234, 504-555-1234, 504.555.1234, +1 504 555 1234, 5045551234
  const match = text.match(
    /(?:\+?1[\s.-]?)?\(?\s*([2-9][0-9]{2})\s*\)?[\s.-]?([0-9]{3})[\s.-]?([0-9]{4})\b/,
  );
  if (!match) {
    return null;
  }
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

function parseFromAddressForName(from: string): { name: string | null; email: string | null } {
  // "John Smith <john@acme.com>" or plain "john@acme.com"
  const bracketMatch = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (bracketMatch && bracketMatch[1] && bracketMatch[2]) {
    return {
      name: bracketMatch[1].trim() || null,
      email: bracketMatch[2].trim().toLowerCase(),
    };
  }
  const plainEmail = parseEmail(from);
  return { name: null, email: plainEmail };
}

/**
 * Look for a signature block after a line ending in "--" or keywords like
 * "Regards,", "Thanks,", "Best,"
 */
function parseBrokerBlock(body: string): {
  brokerName: string | null;
  brokerCompany: string | null;
  brokerPhone: string | null;
} {
  const sigPattern =
    /(?:^|\n)\s*(?:--|Regards|Thanks|Thank you|Best regards|Best|Sincerely|Cheers)[,\s]*\n([\s\S]{0,500})$/i;
  const sig = body.match(sigPattern);
  const block = sig?.[1] ?? body.slice(-500);

  const lines = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let brokerName: string | null = null;
  let brokerCompany: string | null = null;

  // Name is typically the first non-empty signature line (2-4 words, initial caps)
  for (const line of lines) {
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,3}$/.test(line)) {
      brokerName = line;
      break;
    }
  }

  // Company: a line with realty/realtor/commercial/brokerage keywords, OR trailing LLC/Inc/Corp
  for (const line of lines) {
    if (
      /\b(?:realty|realtors?|commercial|brokerage|properties|group|advisors?|partners)\b/i.test(
        line,
      ) ||
      /\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Co\.?|Ltd\.?)\b/.test(line)
    ) {
      if (line !== brokerName && line.length < 120) {
        brokerCompany = line;
        break;
      }
    }
  }

  const brokerPhone = parsePhone(block);

  return { brokerName, brokerCompany, brokerPhone };
}

// -----------------------------------------------------------------------------
// Deal-source hint
// -----------------------------------------------------------------------------

function detectDealSourceHint(subject: string, body: string): string | null {
  const haystack = `${subject}\n${body}`.toLowerCase();
  if (
    /\b(?:offering memorandum|om\s+attached|listed for sale|listing|loopnet|crexi|costar)\b/.test(
      haystack,
    )
  ) {
    return "BROKER";
  }
  if (/\bowner[-\s]?direct\b|seller\s+is\s+the\s+owner/.test(haystack)) {
    return "OWNER_DIRECT";
  }
  if (/\breferral\b|referred by|referred to/.test(haystack)) {
    return "REFERRAL";
  }
  return null;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export function parseInboundEmail(input: ParseEmailInput): ParsedEmailFields {
  const { subject, body, from } = input;
  const combined = `${subject}\n${body}`;

  const fromParsed = parseFromAddressForName(from);
  const brokerBlock = parseBrokerBlock(body);

  return {
    propertyAddress: parseAddress(combined),
    askPrice: parsePrice(combined),
    acreage: parseAcreage(combined),
    brokerName: brokerBlock.brokerName ?? fromParsed.name,
    brokerCompany: brokerBlock.brokerCompany,
    brokerEmail: fromParsed.email ?? parseEmail(body),
    brokerPhone: brokerBlock.brokerPhone ?? parsePhone(body),
    dealSourceHint: detectDealSourceHint(subject, body),
  };
}
