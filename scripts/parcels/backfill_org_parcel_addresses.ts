import { prisma } from "@entitlement-os/db";

type CandidateParcel = {
  id: string;
  orgId: string;
  address: string;
  propertyDbId: string | null;
};

type GatewayRow = Record<string, unknown>;

type BackfillDecision =
  | { kind: "skip"; reason: string }
  | { kind: "update"; nextAddress: string };

const DEFAULT_LIMIT = 500;
const DEFAULT_CONCURRENCY = 5;

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(value, "true");
    } else {
      args.set(value, next);
      i += 1;
    }
  }

  return {
    apply: args.get("--apply") === "true",
    orgId: args.get("--org-id")?.trim() || null,
    limit: Math.max(1, Number.parseInt(args.get("--limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    concurrency: Math.max(
      1,
      Number.parseInt(args.get("--concurrency") ?? String(DEFAULT_CONCURRENCY), 10) || DEFAULT_CONCURRENCY,
    ),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[parcel-address-backfill] missing required env: ${name}`);
  }
  return value;
}

function canonicalizeAddress(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksMissingAddress(value: string): boolean {
  const normalized = canonicalizeAddress(value).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "unknown" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized.startsWith("parcel ")
  );
}

function extractAddress(row: GatewayRow): string | null {
  const candidates = [
    row.site_address,
    row.situs_address,
    row.address,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const normalized = canonicalizeAddress(value);
    if (!normalized || looksMissingAddress(normalized)) continue;
    return normalized;
  }
  return null;
}

async function searchPropertyDbById(
  gatewayUrl: string,
  gatewayKey: string,
  propertyDbId: string,
): Promise<GatewayRow[]> {
  const params = new URLSearchParams({ q: propertyDbId, limit: "5" });
  const res = await fetch(`${gatewayUrl}/api/parcels/search?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${gatewayKey}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[parcel-address-backfill] gateway search failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as unknown;
  return Array.isArray(json)
    ? json.filter((row): row is GatewayRow => row != null && typeof row === "object")
    : [];
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      results[current] = await tasks[current]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrent, tasks.length) }, () => worker()),
  );
  return results;
}

async function buildDecision(
  parcel: CandidateParcel,
  gatewayUrl: string,
  gatewayKey: string,
): Promise<BackfillDecision> {
  const propertyDbId = parcel.propertyDbId?.trim();
  if (!propertyDbId) {
    return { kind: "skip", reason: "missing_property_db_id" };
  }
  if (!looksMissingAddress(parcel.address)) {
    return { kind: "skip", reason: "address_already_present" };
  }

  const rows = await searchPropertyDbById(gatewayUrl, gatewayKey, propertyDbId);
  if (rows.length === 0) {
    return { kind: "skip", reason: "no_gateway_rows" };
  }

  const exact = rows.find((row) => {
    const idValue = row.id ?? row.parcel_uid ?? row.parcel_id;
    return typeof idValue === "string" && idValue.trim() === propertyDbId;
  });
  const nextAddress = extractAddress(exact ?? rows[0]);
  if (!nextAddress) {
    return { kind: "skip", reason: "gateway_address_missing" };
  }
  if (canonicalizeAddress(nextAddress).toLowerCase() === canonicalizeAddress(parcel.address).toLowerCase()) {
    return { kind: "skip", reason: "no_change" };
  }
  return { kind: "update", nextAddress };
}

async function main() {
  const { apply, orgId, limit, concurrency } = parseArgs(process.argv.slice(2));
  const gatewayUrl = requireEnv("LOCAL_API_URL");
  const gatewayKey = requireEnv("LOCAL_API_KEY");

  const candidates = await prisma.parcel.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      propertyDbId: { not: null },
      OR: [
        { address: { equals: "Unknown", mode: "insensitive" } },
        { address: { equals: "N/A", mode: "insensitive" } },
        { address: { startsWith: "Parcel ", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      orgId: true,
      address: true,
      propertyDbId: true,
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  if (candidates.length === 0) {
    console.log("[parcel-address-backfill] no candidate rows found");
    return;
  }

  const decisions = await runWithConcurrency(
    candidates.map((parcel) => async () => ({
      parcel,
      decision: await buildDecision(parcel, gatewayUrl, gatewayKey),
    })),
    concurrency,
  );

  const updates = decisions.filter(
    (item): item is { parcel: CandidateParcel; decision: { kind: "update"; nextAddress: string } } =>
      item.decision.kind === "update",
  );

  if (apply) {
    await runWithConcurrency(
      updates.map((item) => async () => {
        await prisma.parcel.update({
          where: { id: item.parcel.id },
          data: { address: item.decision.nextAddress },
        });
      }),
      concurrency,
    );
  }

  const reasonCounts = decisions.reduce<Record<string, number>>((acc, item) => {
    const key = item.decision.kind === "update" ? "update" : item.decision.reason;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`[parcel-address-backfill] mode=${apply ? "apply" : "dry-run"}`);
  console.log(`[parcel-address-backfill] orgId=${orgId ?? "all"} candidates=${candidates.length}`);
  console.log(`[parcel-address-backfill] updates=${updates.length}`);
  console.log(`[parcel-address-backfill] reasonCounts=${JSON.stringify(reasonCounts)}`);
}

main()
  .catch((error) => {
    console.error("[parcel-address-backfill] fatal:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
