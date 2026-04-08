import { prisma } from "@entitlement-os/db";
import type {
  MemoryIngestionRequest,
  MemoryIngestionResult,
} from "@entitlement-os/shared";
import { extractParishFromAddress } from "./comp-to-market.service";
import { addMarketDataPoint } from "./market-monitor.service";
import { MemoryIngestionService } from "./memory-ingestion.service";

export class MemoryIngestionAccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MemoryIngestionAccessError";
    this.status = status;
  }
}

export async function processMemoryIngestion(params: {
  userId: string;
  orgId: string;
  request: MemoryIngestionRequest;
}): Promise<MemoryIngestionResult> {
  if (params.request.orgId !== params.orgId) {
    const membership = await prisma.orgMembership.findFirst({
      where: {
        orgId: params.request.orgId,
        userId: params.userId,
      },
    });

    if (!membership) {
      throw new MemoryIngestionAccessError("Forbidden: User not member of org", 403);
    }
  }

  const result = await MemoryIngestionService.ingestComps(params.request);

  if (params.request.autoVerify && result.verifiedCreated > 0) {
    const erroredIndexes = new Set(result.errors.map((error) => error.compIndex));
    for (let index = 0; index < params.request.comps.length; index += 1) {
      if (erroredIndexes.has(index)) continue;
      const comp = params.request.comps[index];
      const fullAddress = [comp.address, comp.city, `${comp.state} ${comp.zip ?? ""}`]
        .filter(Boolean)
        .join(", ")
        .trim();
      const parish = extractParishFromAddress(fullAddress) ?? "East Baton Rouge";
      const data: Record<string, unknown> = {
        address: fullAddress || null,
        sale_price: comp.salePrice ?? null,
        price_psf: comp.pricePerSf ?? null,
        cap_rate: comp.capRate ?? null,
        property_type: comp.propertyType ?? null,
        buyer: comp.buyer ?? null,
        seller: comp.seller ?? null,
      };
      const observedAt = comp.transactionDate ? new Date(comp.transactionDate) : undefined;
      addMarketDataPoint(
        parish,
        "comp_sale",
        `memory:${params.request.sourceType}`,
        data,
        observedAt,
      ).catch(() => {});
    }
  }

  return result;
}
