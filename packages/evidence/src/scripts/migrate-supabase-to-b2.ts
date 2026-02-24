/**
 * One-time migration: copy evidence from Supabase Storage to B2 via gateway.
 * Loads .env from repo root when run via pnpm migrate:evidence:b2.
 *
 * Usage:
 *   DATABASE_URL="..." LOCAL_API_URL="..." LOCAL_API_KEY="..." \
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
 *   GATEWAY_SERVICE_USER_ID="..." \
 *   pnpm exec tsx packages/evidence/src/scripts/migrate-supabase-to-b2.ts [options]
 *
 * Options:
 *   --dry-run         Log what would be migrated without uploading
 *   --concurrency N   Parallel uploads (default: 5)
 *   --cutoff DATE     ISO date; only migrate snapshots with retrievedAt < cutoff (default: 2026-02-24T00:00:00Z)
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { uploadEvidenceBytesViaGateway } from "../storage.js";

const DEFAULT_CUTOFF = "2026-02-24T00:00:00Z";

function parseArgs(): {
  dryRun: boolean;
  concurrency: number;
  cutoff: Date;
} {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const concurrencyIdx = args.indexOf("--concurrency");
  const concurrency =
    concurrencyIdx >= 0 && args[concurrencyIdx + 1]
      ? parseInt(args[concurrencyIdx + 1], 10)
      : 5;
  const cutoffIdx = args.indexOf("--cutoff");
  const cutoffStr =
    cutoffIdx >= 0 && args[cutoffIdx + 1] ? args[cutoffIdx + 1] : DEFAULT_CUTOFF;
  const cutoff = new Date(cutoffStr);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error(`Invalid --cutoff: ${cutoffStr}`);
  }
  return { dryRun, concurrency: Math.max(1, concurrency), cutoff };
}

async function main(): Promise<void> {
  const { dryRun, concurrency, cutoff } = parseArgs();

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  const localApiUrl = process.env.LOCAL_API_URL?.trim();
  const localApiKey = process.env.LOCAL_API_KEY?.trim();
  const gatewayUserId = process.env.GATEWAY_SERVICE_USER_ID?.trim();
  if (!localApiUrl || !localApiKey || !gatewayUserId) {
    throw new Error("Set LOCAL_API_URL, LOCAL_API_KEY, and GATEWAY_SERVICE_USER_ID");
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  const snapshots = await prisma.evidenceSnapshot.findMany({
    where: { retrievedAt: { lt: cutoff } },
    orderBy: { retrievedAt: "asc" },
    select: {
      id: true,
      orgId: true,
      storageObjectKey: true,
      textExtractObjectKey: true,
      contentType: true,
      retrievedAt: true,
    },
  });

  console.log(
    `Found ${snapshots.length} pre-cutoff evidence snapshots (retrievedAt < ${cutoff.toISOString()})`
  );
  if (dryRun) {
    console.log("DRY RUN: no uploads will be performed");
  }

  const objectsToMigrate: Array<{
    snapshotId: string;
    orgId: string;
    objectKey: string;
    kind: "evidence_snapshot" | "evidence_extract";
    contentType: string;
  }> = [];

  for (const s of snapshots) {
    if (s.storageObjectKey) {
      objectsToMigrate.push({
        snapshotId: s.id,
        orgId: s.orgId,
        objectKey: s.storageObjectKey,
        kind: "evidence_snapshot",
        contentType: s.contentType,
      });
    }
    if (s.textExtractObjectKey) {
      objectsToMigrate.push({
        snapshotId: s.id,
        orgId: s.orgId,
        objectKey: s.textExtractObjectKey,
        kind: "evidence_extract",
        contentType: "text/plain; charset=utf-8",
      });
    }
  }

  console.log(`Objects to migrate: ${objectsToMigrate.length}`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  const queue = [...objectsToMigrate];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        const { data, error } = await supabase.storage
          .from("evidence")
          .download(item.objectKey);

        if (error || !data) {
          console.warn(`SKIP (not in Supabase): ${item.objectKey}`);
          skipped++;
          continue;
        }

        const bytes = new Uint8Array(await data.arrayBuffer());

        if (dryRun) {
          console.log(
            `DRY RUN: would migrate ${item.objectKey} (${bytes.length} bytes)`
          );
          migrated++;
          continue;
        }

        await uploadEvidenceBytesViaGateway({
          objectKey: item.objectKey,
          bytes,
          contentType: item.contentType,
          kind: item.kind,
          orgId: item.orgId,
        });

        migrated++;
        if (migrated % 50 === 0) {
          console.log(
            `Progress: ${migrated} migrated, ${skipped} skipped, ${failed} failed`
          );
        }
      } catch (err) {
        console.error(`FAILED: ${item.objectKey}`, err);
        failed++;
      }
    }
  });

  await Promise.all(workers);
  await prisma.$disconnect();

  console.log("\nMigration complete:");
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);

  if (failed > 0) {
    console.log("\nRe-run without --dry-run to retry failed items.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
