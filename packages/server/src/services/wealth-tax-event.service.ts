import { Prisma, prisma } from "@entitlement-os/db";

export class WealthTaxEventRouteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toJsonValue(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function listWealthTaxEvents(
  orgId: string,
  filters: { eventType: string | null; status: string | null },
): Promise<{
  taxEvents: Array<Record<string, unknown>>;
}> {
  const where: Record<string, unknown> = { orgId };
  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.status) where.status = filters.status;

  const taxEvents = await prisma.taxEvent.findMany({
    where,
    include: {
      entity: { select: { id: true, name: true, entityType: true } },
      deal: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return { taxEvents };
}

export async function createWealthTaxEvent(
  orgId: string,
  body: Record<string, unknown>,
): Promise<{ taxEvent: Record<string, unknown> }> {
  const entityId = typeof body.entityId === "string" ? body.entityId : null;
  const dealId = typeof body.dealId === "string" ? body.dealId : null;
  const eventType = typeof body.eventType === "string" ? body.eventType : "";
  const title = typeof body.title === "string" ? body.title : "";
  const description = typeof body.description === "string" ? body.description : null;
  const severity = typeof body.severity === "string" ? body.severity : "";
  const deadline = typeof body.deadline === "string" ? body.deadline : null;
  const metadata = body.metadata;

  if (!eventType || !title || !severity) {
    throw new WealthTaxEventRouteError(
      400,
      "eventType, title, and severity are required",
    );
  }

  if (entityId) {
    const entity = await prisma.entity.findFirst({ where: { id: entityId, orgId } });
    if (!entity) {
      throw new WealthTaxEventRouteError(404, "Entity not found");
    }
  }

  if (dealId) {
    const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId } });
    if (!deal) {
      throw new WealthTaxEventRouteError(404, "Deal not found");
    }
  }

  const taxEvent = await prisma.taxEvent.create({
    data: {
      orgId,
      entityId,
      dealId,
      eventType,
      title,
      description,
      severity,
      deadline: deadline ? new Date(deadline) : null,
      metadata: toJsonValue(metadata),
    },
  });

  return { taxEvent };
}
