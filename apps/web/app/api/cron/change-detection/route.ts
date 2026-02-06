import { NextResponse } from 'next/server';
// import { prisma } from '@entitlement-os/db';
// import { captureEvidence } from '@entitlement-os/evidence';

/**
 * Vercel Cron Job: Change Detection
 * Runs nightly to check all jurisdiction seed sources for content changes.
 * Replaces Temporal ChangeDetectionWorkflow — no Docker required.
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/change-detection", "schedule": "0 6 * * *" }] }
 */
export async function GET(req: Request) {
  // Vercel sets CRON_SECRET automatically for cron jobs
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // TODO: Wire to evidence system when DB is connected
    //
    // 1. Fetch all active seed sources
    // const sources = await prisma.jurisdictionSeedSource.findMany({
    //   where: { active: true },
    //   include: { jurisdiction: true },
    // });
    //
    // 2. For each source: fetch → hash → compare with latest snapshot
    // const changes: { url: string; jurisdictionId: string; changed: boolean }[] = [];
    // for (const source of sources) {
    //   const result = await captureEvidence({
    //     url: source.url,
    //     orgId: source.jurisdiction.orgId,
    //     runId: crypto.randomUUID(),
    //   });
    //   changes.push({
    //     url: source.url,
    //     jurisdictionId: source.jurisdictionId,
    //     changed: result.changed,
    //   });
    // }
    //
    // 3. If any sources changed, trigger parish pack refresh
    // const changedJurisdictions = new Set(
    //   changes.filter(c => c.changed).map(c => c.jurisdictionId)
    // );
    // for (const jId of changedJurisdictions) {
    //   // Call parish pack refresh API or generate inline
    // }

    return NextResponse.json({
      ok: true,
      message: 'Change detection complete',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cron/change-detection] Failed:', error);
    return NextResponse.json(
      { error: 'Change detection failed', details: String(error) },
      { status: 500 }
    );
  }
}
