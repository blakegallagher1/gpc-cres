-- CreateEnum
CREATE TYPE "sku_type" AS ENUM ('SMALL_BAY_FLEX', 'OUTDOOR_STORAGE', 'TRUCK_PARKING');

-- CreateEnum
CREATE TYPE "deal_status" AS ENUM ('INTAKE', 'TRIAGE_DONE', 'PREAPP', 'CONCEPT', 'NEIGHBORS', 'SUBMITTED', 'HEARING', 'APPROVED', 'EXIT_MARKETED', 'EXITED', 'KILLED');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "artifact_type" AS ENUM ('TRIAGE_PDF', 'SUBMISSION_CHECKLIST_PDF', 'HEARING_DECK_PPTX', 'EXIT_PACKAGE_PDF', 'BUYER_TEASER_PDF');

-- CreateEnum
CREATE TYPE "evidence_type" AS ENUM ('WEB_PAGE', 'PDF', 'IMAGE', 'TEXT_EXTRACT');

-- CreateEnum
CREATE TYPE "run_type" AS ENUM ('TRIAGE', 'PARISH_PACK_REFRESH', 'ARTIFACT_GEN', 'BUYER_LIST_BUILD', 'CHANGE_DETECT');

-- CreateTable
CREATE TABLE "orgs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("org_id","user_id")
);

-- CreateTable
CREATE TABLE "jurisdictions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "official_domains" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurisdictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurisdiction_seed_sources" (
    "id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurisdiction_seed_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" "sku_type" NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "status" "deal_status" NOT NULL DEFAULT 'INTAKE',
    "target_close_date" DATE,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "apn" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "acreage" DECIMAL(12,4),
    "current_zoning" TEXT,
    "future_land_use" TEXT,
    "utilities_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "due_at" TIMESTAMPTZ(6),
    "owner_user_id" UUID,
    "pipeline_step" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyers" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "buyer_type" TEXT NOT NULL,
    "sku_interests" "sku_type"[],
    "jurisdiction_interests" UUID[],
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "last_contact_at" TIMESTAMPTZ(6),
    "next_followup_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "outreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "run_type" "run_type" NOT NULL,
    "deal_id" UUID,
    "jurisdiction_id" UUID,
    "sku" "sku_type",
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "openai_response_id" TEXT,
    "input_hash" TEXT,
    "output_json" JSONB,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_sources" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_snapshots" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "evidence_source_id" UUID NOT NULL,
    "retrieved_at" TIMESTAMPTZ(6) NOT NULL,
    "http_status" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "storage_object_key" TEXT NOT NULL,
    "text_extract_object_key" TEXT,
    "run_id" UUID NOT NULL,

    CONSTRAINT "evidence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parish_pack_versions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "sku" "sku_type" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL,
    "generated_by_run_id" UUID NOT NULL,
    "pack_json" JSONB NOT NULL,

    CONSTRAINT "parish_pack_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "artifact_type" "artifact_type" NOT NULL,
    "version" INTEGER NOT NULL,
    "storage_object_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by_run_id" UUID NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_object_key" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_memberships_user_id_idx" ON "org_memberships"("user_id");

-- CreateIndex
CREATE INDEX "jurisdictions_org_id_idx" ON "jurisdictions"("org_id");

-- CreateIndex
CREATE INDEX "jurisdiction_seed_sources_jurisdiction_id_idx" ON "jurisdiction_seed_sources"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "deals_org_id_idx" ON "deals"("org_id");

-- CreateIndex
CREATE INDEX "deals_jurisdiction_id_idx" ON "deals"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");

-- CreateIndex
CREATE INDEX "parcels_org_id_idx" ON "parcels"("org_id");

-- CreateIndex
CREATE INDEX "parcels_deal_id_idx" ON "parcels"("deal_id");

-- CreateIndex
CREATE INDEX "tasks_org_id_idx" ON "tasks"("org_id");

-- CreateIndex
CREATE INDEX "tasks_deal_id_idx" ON "tasks"("deal_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_pipeline_step_idx" ON "tasks"("pipeline_step");

-- CreateIndex
CREATE INDEX "buyers_org_id_idx" ON "buyers"("org_id");

-- CreateIndex
CREATE INDEX "outreach_org_id_idx" ON "outreach"("org_id");

-- CreateIndex
CREATE INDEX "outreach_deal_id_idx" ON "outreach"("deal_id");

-- CreateIndex
CREATE INDEX "outreach_buyer_id_idx" ON "outreach"("buyer_id");

-- CreateIndex
CREATE INDEX "runs_org_id_idx" ON "runs"("org_id");

-- CreateIndex
CREATE INDEX "runs_deal_id_idx" ON "runs"("deal_id");

-- CreateIndex
CREATE INDEX "runs_jurisdiction_id_idx" ON "runs"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "runs_run_type_idx" ON "runs"("run_type");

-- CreateIndex
CREATE INDEX "evidence_sources_org_id_idx" ON "evidence_sources"("org_id");

-- CreateIndex
CREATE INDEX "evidence_sources_domain_idx" ON "evidence_sources"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_sources_org_id_url_key" ON "evidence_sources"("org_id", "url");

-- CreateIndex
CREATE INDEX "evidence_snapshots_org_id_idx" ON "evidence_snapshots"("org_id");

-- CreateIndex
CREATE INDEX "evidence_snapshots_evidence_source_id_idx" ON "evidence_snapshots"("evidence_source_id");

-- CreateIndex
CREATE INDEX "evidence_snapshots_run_id_idx" ON "evidence_snapshots"("run_id");

-- CreateIndex
CREATE INDEX "parish_pack_versions_org_id_idx" ON "parish_pack_versions"("org_id");

-- CreateIndex
CREATE INDEX "parish_pack_versions_jurisdiction_id_idx" ON "parish_pack_versions"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "parish_pack_versions_status_idx" ON "parish_pack_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "parish_pack_versions_jurisdiction_id_sku_version_key" ON "parish_pack_versions"("jurisdiction_id", "sku", "version");

-- CreateIndex
CREATE INDEX "artifacts_org_id_idx" ON "artifacts"("org_id");

-- CreateIndex
CREATE INDEX "artifacts_deal_id_idx" ON "artifacts"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_deal_id_artifact_type_version_key" ON "artifacts"("deal_id", "artifact_type", "version");

-- CreateIndex
CREATE INDEX "uploads_org_id_idx" ON "uploads"("org_id");

-- CreateIndex
CREATE INDEX "uploads_deal_id_idx" ON "uploads"("deal_id");

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurisdictions" ADD CONSTRAINT "jurisdictions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurisdiction_seed_sources" ADD CONSTRAINT "jurisdiction_seed_sources_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_snapshots" ADD CONSTRAINT "evidence_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_snapshots" ADD CONSTRAINT "evidence_snapshots_evidence_source_id_fkey" FOREIGN KEY ("evidence_source_id") REFERENCES "evidence_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_snapshots" ADD CONSTRAINT "evidence_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parish_pack_versions" ADD CONSTRAINT "parish_pack_versions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parish_pack_versions" ADD CONSTRAINT "parish_pack_versions_jurisdiction_id_fkey" FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parish_pack_versions" ADD CONSTRAINT "parish_pack_versions_generated_by_run_id_fkey" FOREIGN KEY ("generated_by_run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_generated_by_run_id_fkey" FOREIGN KEY ("generated_by_run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
