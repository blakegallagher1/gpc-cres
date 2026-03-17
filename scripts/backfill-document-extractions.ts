/**
 * Backfill document extractions for uploads that were created before
 * the document processing pipeline was deployed.
 *
 * Finds all Upload records that have no corresponding DocumentExtraction
 * and runs the processing pipeline on each.
 *
 * Usage:
 *   npx tsx scripts/backfill-document-extractions.ts
 *
 * Options:
 *   --dry-run   Show what would be processed without actually processing
 *   --limit N   Process at most N uploads (default: all)
 */

import { PrismaClient } from "@entitlement-os/db";

const prisma = new PrismaClient();

const CONCURRENCY = 3;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : undefined;

  // Find uploads with no extraction
  const uploads = await prisma.upload.findMany({
    where: {
      extraction: { is: null },
      status: "available",
    },
    select: {
      id: true,
      dealId: true,
      orgId: true,
      filename: true,
      contentType: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`Found ${uploads.length} uploads without extractions`);

  if (dryRun) {
    for (const u of uploads) {
      console.log(`  [dry-run] ${u.filename} (${u.contentType}) — deal ${u.dealId}`);
    }
    console.log("Dry run complete. Pass without --dry-run to process.");
    return;
  }

  if (uploads.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  // Dynamic import to pick up env vars (dotenv, etc.)
  const { getDocumentProcessingService } = await import(
    "../apps/web/lib/services/documentProcessing.service.js"
  );
  const service = getDocumentProcessingService();

  let processed = 0;
  let failed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < uploads.length; i += CONCURRENCY) {
    const batch = uploads.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (upload) => {
        console.log(
          `[${processed + 1}/${uploads.length}] Processing "${upload.filename}" (${upload.id})...`
        );
        await service.processUpload(upload.id, upload.dealId, upload.orgId);
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const upload = batch[j];
      if (result.status === "fulfilled") {
        processed++;
        console.log(`  ✓ "${upload.filename}" processed`);
      } else {
        failed++;
        console.error(`  ✗ "${upload.filename}" failed:`, result.reason);
      }
    }
  }

  console.log(`\nBackfill complete: ${processed} processed, ${failed} failed out of ${uploads.length} total`);
}

main()
  .catch((err) => {
    console.error("Backfill script failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
