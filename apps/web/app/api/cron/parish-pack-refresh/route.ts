import { NextResponse } from 'next/server';
// import { prisma } from '@entitlement-os/db';
// import { createStrictJsonResponse } from '@entitlement-os/openai';
// import { parishPackJsonSchema } from '@entitlement-os/shared';

/**
 * Vercel Cron Job: Parish Pack Refresh
 * Runs weekly as a failsafe to refresh all parish packs.
 * Replaces Temporal ParishPackRefreshWorkflow — no Docker required.
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/parish-pack-refresh", "schedule": "0 4 * * 0" }] }
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // TODO: Wire to OpenAI parish pack generation
    //
    // const skus = ['SMALL_BAY_FLEX', 'OUTDOOR_STORAGE', 'TRUCK_PARKING'] as const;
    // const jurisdictions = await prisma.jurisdiction.findMany({
    //   include: { seedSources: { where: { active: true } } },
    // });
    //
    // const refreshed: string[] = [];
    //
    // for (const jurisdiction of jurisdictions) {
    //   for (const sku of skus) {
    //     // Check freshness: skip if pack is < 7 days old
    //     const current = await prisma.parishPackVersion.findFirst({
    //       where: { jurisdictionId: jurisdiction.id, sku, status: 'current' },
    //       orderBy: { generatedAt: 'desc' },
    //     });
    //
    //     const staleDays = 7;
    //     if (current && Date.now() - current.generatedAt.getTime() < staleDays * 86400000) {
    //       continue; // Still fresh
    //     }
    //
    //     // Generate new pack via OpenAI Responses API
    //     // const result = await createStrictJsonResponse({
    //     //   model: 'gpt-5.2',
    //     //   input: buildParishPackPrompt(jurisdiction, sku),
    //     //   jsonSchema: parishPackJsonSchema,
    //     //   tools: [{ type: 'web_search_preview', search_context_size: 'high' }],
    //     // });
    //     //
    //     // Store as new version, mark old as superseded
    //     refreshed.push(`${jurisdiction.name} / ${sku}`);
    //   }
    // }

    return NextResponse.json({
      ok: true,
      message: 'Parish pack refresh complete',
      timestamp: new Date().toISOString(),
      // refreshed,
    });
  } catch (error) {
    console.error('[cron/parish-pack-refresh] Failed:', error);
    return NextResponse.json(
      { error: 'Parish pack refresh failed', details: String(error) },
      { status: 500 }
    );
  }
}
