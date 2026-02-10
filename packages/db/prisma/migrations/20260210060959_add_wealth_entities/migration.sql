-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('LLC', 'TRUST', 'CORP', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "parent_id" UUID,
    "ownership_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "tax_id" TEXT,
    "state" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_deals" (
    "entity_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "ownership_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,

    CONSTRAINT "entity_deals_pkey" PRIMARY KEY ("entity_id","deal_id")
);

-- CreateTable
CREATE TABLE "tax_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "entity_id" UUID,
    "deal_id" UUID,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "deadline" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entities_org_id_idx" ON "entities"("org_id");

-- CreateIndex
CREATE INDEX "entities_parent_id_idx" ON "entities"("parent_id");

-- CreateIndex
CREATE INDEX "tax_events_org_id_idx" ON "tax_events"("org_id");

-- CreateIndex
CREATE INDEX "tax_events_entity_id_idx" ON "tax_events"("entity_id");

-- CreateIndex
CREATE INDEX "tax_events_deal_id_idx" ON "tax_events"("deal_id");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_deals" ADD CONSTRAINT "entity_deals_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_deals" ADD CONSTRAINT "entity_deals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_events" ADD CONSTRAINT "tax_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
