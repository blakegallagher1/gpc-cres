CREATE TABLE "map_workspaces" (
  "id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" UUID NOT NULL,
  "updated_by" UUID,
  "deal_id" UUID,
  "summary" TEXT,
  "notes" TEXT,
  "selected_parcel_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "polygon" JSONB,
  "parcel_set_definition" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "parcel_set_materialization" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "overlay_state" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ai_outputs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "market_state" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "map_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "map_workspace_parcels" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "parcel_id" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "owner" TEXT,
  "acreage" DECIMAL(12,4),
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "current_zoning" TEXT,
  "flood_zone" TEXT,
  "note" TEXT,
  "task" TEXT,
  "status" TEXT,
  "selected" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "map_workspace_parcels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "map_workspace_contacts" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "parcel_id" TEXT,
  "owner_name" TEXT NOT NULL,
  "entity_name" TEXT,
  "mailing_address" TEXT,
  "mailing_city" TEXT,
  "mailing_state" TEXT,
  "mailing_zip" TEXT,
  "portfolio_context" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "skip_trace_state" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "broker_notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "map_workspace_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "map_workspace_outreach_logs" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "contact_id" UUID,
  "channel" TEXT NOT NULL,
  "direction" TEXT,
  "status" TEXT NOT NULL,
  "happened_at" TIMESTAMPTZ(6) NOT NULL,
  "next_contact_at" TIMESTAMPTZ(6),
  "broker_name" TEXT,
  "broker_company" TEXT,
  "summary" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "map_workspace_outreach_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "map_workspace_comps" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "parcel_id" TEXT,
  "address" TEXT NOT NULL,
  "use_type" TEXT,
  "land_use_filter" TEXT,
  "sale_date" DATE,
  "sale_price" DECIMAL(14,2),
  "acreage" DECIMAL(12,4),
  "price_per_acre" DECIMAL(14,2),
  "price_per_sf" DECIMAL(12,2),
  "recency_weight" DECIMAL(8,4),
  "adjustment_factor" DECIMAL(8,4),
  "adjusted_price_per_acre" DECIMAL(14,2),
  "adjustment_notes" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "export_group" TEXT,
  "selected" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "map_workspace_comps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "map_workspace_parcels_workspace_id_parcel_id_key"
  ON "map_workspace_parcels"("workspace_id", "parcel_id");

CREATE INDEX "map_workspaces_org_id_idx" ON "map_workspaces"("org_id");
CREATE INDEX "map_workspaces_deal_id_idx" ON "map_workspaces"("deal_id");
CREATE INDEX "map_workspaces_org_id_created_at_idx" ON "map_workspaces"("org_id", "created_at" DESC);
CREATE INDEX "map_workspaces_org_id_status_idx" ON "map_workspaces"("org_id", "status");

CREATE INDEX "map_workspace_parcels_workspace_id_idx" ON "map_workspace_parcels"("workspace_id");
CREATE INDEX "map_workspace_parcels_org_id_idx" ON "map_workspace_parcels"("org_id");
CREATE INDEX "map_workspace_parcels_org_id_parcel_id_idx" ON "map_workspace_parcels"("org_id", "parcel_id");

CREATE INDEX "map_workspace_contacts_workspace_id_idx" ON "map_workspace_contacts"("workspace_id");
CREATE INDEX "map_workspace_contacts_org_id_idx" ON "map_workspace_contacts"("org_id");
CREATE INDEX "map_workspace_contacts_org_id_owner_name_idx" ON "map_workspace_contacts"("org_id", "owner_name");

CREATE INDEX "map_workspace_outreach_logs_workspace_id_idx" ON "map_workspace_outreach_logs"("workspace_id");
CREATE INDEX "map_workspace_outreach_logs_org_id_idx" ON "map_workspace_outreach_logs"("org_id");
CREATE INDEX "map_workspace_outreach_logs_contact_id_idx" ON "map_workspace_outreach_logs"("contact_id");
CREATE INDEX "map_workspace_outreach_logs_org_id_happened_at_idx"
  ON "map_workspace_outreach_logs"("org_id", "happened_at" DESC);

CREATE INDEX "map_workspace_comps_workspace_id_idx" ON "map_workspace_comps"("workspace_id");
CREATE INDEX "map_workspace_comps_org_id_idx" ON "map_workspace_comps"("org_id");
CREATE INDEX "map_workspace_comps_org_id_sale_date_idx" ON "map_workspace_comps"("org_id", "sale_date" DESC);

ALTER TABLE "map_workspaces"
  ADD CONSTRAINT "map_workspaces_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "map_workspaces"
  ADD CONSTRAINT "map_workspaces_deal_id_fkey"
  FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "map_workspace_parcels"
  ADD CONSTRAINT "map_workspace_parcels_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "map_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "map_workspace_contacts"
  ADD CONSTRAINT "map_workspace_contacts_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "map_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "map_workspace_outreach_logs"
  ADD CONSTRAINT "map_workspace_outreach_logs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "map_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "map_workspace_outreach_logs"
  ADD CONSTRAINT "map_workspace_outreach_logs_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "map_workspace_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "map_workspace_comps"
  ADD CONSTRAINT "map_workspace_comps_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "map_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
