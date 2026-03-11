-- CreateEnum
CREATE TYPE "deal_asset_class" AS ENUM ('LAND', 'INDUSTRIAL', 'OFFICE', 'RETAIL', 'MULTIFAMILY', 'SELF_STORAGE', 'HOSPITALITY', 'MIXED_USE', 'SPECIALTY', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "deal_strategy" AS ENUM ('ENTITLEMENT', 'GROUND_UP_DEVELOPMENT', 'VALUE_ADD_ACQUISITION', 'CORE_ACQUISITION', 'LEASE_UP', 'ASSET_MANAGEMENT', 'RECAPITALIZATION', 'REFINANCE', 'DISPOSITION', 'DEBT_PLACEMENT');

-- CreateEnum
CREATE TYPE "workflow_template_key" AS ENUM ('ENTITLEMENT_LAND', 'DEVELOPMENT', 'ACQUISITION', 'LEASE_UP', 'ASSET_MANAGEMENT', 'DISPOSITION', 'REFINANCE', 'PORTFOLIO_REVIEW');

-- CreateEnum
CREATE TYPE "deal_stage_key" AS ENUM ('ORIGINATION', 'SCREENING', 'UNDERWRITING', 'DUE_DILIGENCE', 'CONTRACTING', 'EXECUTION', 'ASSET_MANAGEMENT', 'DISPOSITION', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "opportunity_kind" AS ENUM ('SITE', 'PROPERTY', 'LOAN', 'PORTFOLIO', 'TENANT', 'JV');

-- CreateEnum
CREATE TYPE "deal_source_type" AS ENUM ('MANUAL', 'BROKER', 'OWNER_DIRECT', 'MARKET_SCAN', 'AGENT_DISCOVERY', 'REFERRAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "deal_asset_role" AS ENUM ('PRIMARY', 'COMPARABLE', 'ADJACENT');

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "asset_class" "deal_asset_class",
ADD COLUMN     "asset_subtype" TEXT,
ADD COLUMN     "business_plan_summary" TEXT,
ADD COLUMN     "current_stage_key" "deal_stage_key",
ADD COLUMN     "deal_source_type" "deal_source_type",
ADD COLUMN     "investment_summary" TEXT,
ADD COLUMN     "legacy_sku" "sku_type",
ADD COLUMN     "legacy_status" "deal_status",
ADD COLUMN     "market_name" TEXT,
ADD COLUMN     "opportunity_kind" "opportunity_kind",
ADD COLUMN     "primary_asset_id" UUID,
ADD COLUMN     "strategy" "deal_strategy",
ADD COLUMN     "workflow_template_key" "workflow_template_key";

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "county" TEXT,
    "parcel_number" TEXT,
    "asset_class" "deal_asset_class",
    "asset_subtype" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "acreage" DECIMAL(12,4),
    "sf_gross" DECIMAL(14,2),
    "sf_net" DECIMAL(14,2),
    "year_built" INTEGER,
    "zoning" TEXT,
    "zoning_description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_assets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "role" "deal_asset_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "key" "workflow_template_key" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_stages" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "key" "deal_stage_key" NOT NULL,
    "name" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "description" TEXT,
    "required_gate" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_stage_history" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "from_stage_key" "deal_stage_key",
    "to_stage_key" "deal_stage_key" NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "deal_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generalized_scorecards" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION,
    "evidence" TEXT,
    "scored_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scored_by" UUID,

    CONSTRAINT "generalized_scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_states" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "state_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "module_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_org_id_idx" ON "assets"("org_id");

-- CreateIndex
CREATE INDEX "assets_org_id_parcel_number_idx" ON "assets"("org_id", "parcel_number");

-- CreateIndex
CREATE INDEX "assets_org_id_address_idx" ON "assets"("org_id", "address");

-- CreateIndex
CREATE UNIQUE INDEX "assets_id_org_id_key" ON "assets"("id", "org_id");

-- CreateIndex
CREATE INDEX "deal_assets_org_id_idx" ON "deal_assets"("org_id");

-- CreateIndex
CREATE INDEX "deal_assets_org_id_deal_id_idx" ON "deal_assets"("org_id", "deal_id");

-- CreateIndex
CREATE INDEX "deal_assets_org_id_asset_id_idx" ON "deal_assets"("org_id", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_assets_deal_id_asset_id_key" ON "deal_assets"("deal_id", "asset_id");

-- CreateIndex
CREATE INDEX "workflow_templates_org_id_idx" ON "workflow_templates"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_id_org_id_key" ON "workflow_templates"("id", "org_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_org_id_key_key" ON "workflow_templates"("org_id", "key");

-- CreateIndex
CREATE INDEX "workflow_stages_org_id_idx" ON "workflow_stages"("org_id");

-- CreateIndex
CREATE INDEX "workflow_stages_org_id_template_id_idx" ON "workflow_stages"("org_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stages_template_id_key_key" ON "workflow_stages"("template_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_stages_template_id_ordinal_key" ON "workflow_stages"("template_id", "ordinal");

-- CreateIndex
CREATE INDEX "deal_stage_history_org_id_idx" ON "deal_stage_history"("org_id");

-- CreateIndex
CREATE INDEX "deal_stage_history_org_id_deal_id_idx" ON "deal_stage_history"("org_id", "deal_id");

-- CreateIndex
CREATE INDEX "deal_stage_history_to_stage_key_idx" ON "deal_stage_history"("to_stage_key");

-- CreateIndex
CREATE INDEX "generalized_scorecards_org_id_idx" ON "generalized_scorecards"("org_id");

-- CreateIndex
CREATE INDEX "generalized_scorecards_org_id_deal_id_idx" ON "generalized_scorecards"("org_id", "deal_id");

-- CreateIndex
CREATE INDEX "generalized_scorecards_module_idx" ON "generalized_scorecards"("module");

-- CreateIndex
CREATE INDEX "module_states_org_id_idx" ON "module_states"("org_id");

-- CreateIndex
CREATE INDEX "module_states_org_id_deal_id_idx" ON "module_states"("org_id", "deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_states_org_id_deal_id_module_key" ON "module_states"("org_id", "deal_id", "module");

-- CreateIndex
CREATE INDEX "deals_org_id_primary_asset_id_idx" ON "deals"("org_id", "primary_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "deals_id_org_id_key" ON "deals"("id", "org_id");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_primary_asset_id_org_id_fkey" FOREIGN KEY ("primary_asset_id", "org_id") REFERENCES "assets"("id", "org_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_assets" ADD CONSTRAINT "deal_assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_assets" ADD CONSTRAINT "deal_assets_deal_id_org_id_fkey" FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_assets" ADD CONSTRAINT "deal_assets_asset_id_org_id_fkey" FOREIGN KEY ("asset_id", "org_id") REFERENCES "assets"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_template_id_org_id_fkey" FOREIGN KEY ("template_id", "org_id") REFERENCES "workflow_templates"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_org_id_fkey" FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generalized_scorecards" ADD CONSTRAINT "generalized_scorecards_deal_id_org_id_fkey" FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generalized_scorecards" ADD CONSTRAINT "generalized_scorecards_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_states" ADD CONSTRAINT "module_states_deal_id_org_id_fkey" FOREIGN KEY ("deal_id", "org_id") REFERENCES "deals"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_states" ADD CONSTRAINT "module_states_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

