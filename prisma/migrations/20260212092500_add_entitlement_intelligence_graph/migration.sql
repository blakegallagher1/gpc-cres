-- CreateTable
CREATE TABLE "entitlement_graph_nodes" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "deal_id" UUID,
    "node_type" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entitlement_graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_graph_edges" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "from_node_id" UUID NOT NULL,
    "to_node_id" UUID NOT NULL,
    "edge_type" TEXT NOT NULL,
    "weight" DECIMAL(6,4) NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entitlement_graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_outcome_precedents" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "deal_id" UUID,
    "strategy_node_id" UUID,
    "precedent_key" TEXT NOT NULL,
    "strategy_key" TEXT NOT NULL,
    "strategy_label" TEXT NOT NULL,
    "sku" "sku_type",
    "application_type" TEXT,
    "hearing_body" TEXT,
    "submitted_at" DATE,
    "decision_at" DATE,
    "decision" TEXT NOT NULL,
    "timeline_days" INTEGER,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_snapshot_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.7000,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entitlement_outcome_precedents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_prediction_snapshots" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "jurisdiction_id" UUID NOT NULL,
    "deal_id" UUID,
    "strategy_key" TEXT NOT NULL,
    "strategy_label" TEXT NOT NULL,
    "sku" "sku_type",
    "probability_approval" DECIMAL(6,5) NOT NULL,
    "probability_low" DECIMAL(6,5) NOT NULL,
    "probability_high" DECIMAL(6,5) NOT NULL,
    "expected_days_p50" INTEGER NOT NULL,
    "expected_days_p75" INTEGER NOT NULL,
    "expected_days_p90" INTEGER NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "model_version" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "rationale" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_prediction_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_graph_nodes_org_id_jurisdiction_id_node_type_node_key_key"
ON "entitlement_graph_nodes"("org_id", "jurisdiction_id", "node_type", "node_key");

-- CreateIndex
CREATE INDEX "entitlement_graph_nodes_org_id_idx" ON "entitlement_graph_nodes"("org_id");

-- CreateIndex
CREATE INDEX "entitlement_graph_nodes_jurisdiction_id_idx" ON "entitlement_graph_nodes"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "entitlement_graph_nodes_deal_id_idx" ON "entitlement_graph_nodes"("deal_id");

-- CreateIndex
CREATE INDEX "entitlement_graph_nodes_node_type_idx" ON "entitlement_graph_nodes"("node_type");

-- CreateIndex
CREATE INDEX "entitlement_graph_nodes_node_key_idx" ON "entitlement_graph_nodes"("node_key");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_graph_edges_org_id_jurisdiction_id_from_node_id_to_node_id_edge_type_key"
ON "entitlement_graph_edges"("org_id", "jurisdiction_id", "from_node_id", "to_node_id", "edge_type");

-- CreateIndex
CREATE INDEX "entitlement_graph_edges_org_id_idx" ON "entitlement_graph_edges"("org_id");

-- CreateIndex
CREATE INDEX "entitlement_graph_edges_jurisdiction_id_idx" ON "entitlement_graph_edges"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "entitlement_graph_edges_from_node_id_idx" ON "entitlement_graph_edges"("from_node_id");

-- CreateIndex
CREATE INDEX "entitlement_graph_edges_to_node_id_idx" ON "entitlement_graph_edges"("to_node_id");

-- CreateIndex
CREATE INDEX "entitlement_graph_edges_edge_type_idx" ON "entitlement_graph_edges"("edge_type");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_outcome_precedents_org_id_jurisdiction_id_precedent_key_key"
ON "entitlement_outcome_precedents"("org_id", "jurisdiction_id", "precedent_key");

-- CreateIndex
CREATE INDEX "entitlement_outcome_precedents_org_id_idx" ON "entitlement_outcome_precedents"("org_id");

-- CreateIndex
CREATE INDEX "entitlement_outcome_precedents_jurisdiction_id_idx" ON "entitlement_outcome_precedents"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "entitlement_outcome_precedents_deal_id_idx" ON "entitlement_outcome_precedents"("deal_id");

-- CreateIndex
CREATE INDEX "entitlement_outcome_precedents_strategy_key_idx" ON "entitlement_outcome_precedents"("strategy_key");

-- CreateIndex
CREATE INDEX "entitlement_outcome_precedents_decision_idx" ON "entitlement_outcome_precedents"("decision");

-- CreateIndex
CREATE INDEX "entitlement_outcome_precedents_decision_at_idx" ON "entitlement_outcome_precedents"("decision_at");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_prediction_snapshots_org_id_jurisdiction_id_strategy_key_input_hash_key"
ON "entitlement_prediction_snapshots"("org_id", "jurisdiction_id", "strategy_key", "input_hash");

-- CreateIndex
CREATE INDEX "entitlement_prediction_snapshots_org_id_idx" ON "entitlement_prediction_snapshots"("org_id");

-- CreateIndex
CREATE INDEX "entitlement_prediction_snapshots_jurisdiction_id_idx" ON "entitlement_prediction_snapshots"("jurisdiction_id");

-- CreateIndex
CREATE INDEX "entitlement_prediction_snapshots_deal_id_idx" ON "entitlement_prediction_snapshots"("deal_id");

-- CreateIndex
CREATE INDEX "entitlement_prediction_snapshots_strategy_key_idx" ON "entitlement_prediction_snapshots"("strategy_key");

-- CreateIndex
CREATE INDEX "entitlement_prediction_snapshots_created_at_idx" ON "entitlement_prediction_snapshots"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "entitlement_graph_nodes"
ADD CONSTRAINT "entitlement_graph_nodes_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_graph_nodes"
ADD CONSTRAINT "entitlement_graph_nodes_jurisdiction_id_fkey"
FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_graph_nodes"
ADD CONSTRAINT "entitlement_graph_nodes_deal_id_fkey"
FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_graph_edges"
ADD CONSTRAINT "entitlement_graph_edges_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_graph_edges"
ADD CONSTRAINT "entitlement_graph_edges_jurisdiction_id_fkey"
FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_graph_edges"
ADD CONSTRAINT "entitlement_graph_edges_from_node_id_fkey"
FOREIGN KEY ("from_node_id") REFERENCES "entitlement_graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_graph_edges"
ADD CONSTRAINT "entitlement_graph_edges_to_node_id_fkey"
FOREIGN KEY ("to_node_id") REFERENCES "entitlement_graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_outcome_precedents"
ADD CONSTRAINT "entitlement_outcome_precedents_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_outcome_precedents"
ADD CONSTRAINT "entitlement_outcome_precedents_jurisdiction_id_fkey"
FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_outcome_precedents"
ADD CONSTRAINT "entitlement_outcome_precedents_deal_id_fkey"
FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_outcome_precedents"
ADD CONSTRAINT "entitlement_outcome_precedents_strategy_node_id_fkey"
FOREIGN KEY ("strategy_node_id") REFERENCES "entitlement_graph_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_prediction_snapshots"
ADD CONSTRAINT "entitlement_prediction_snapshots_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_prediction_snapshots"
ADD CONSTRAINT "entitlement_prediction_snapshots_jurisdiction_id_fkey"
FOREIGN KEY ("jurisdiction_id") REFERENCES "jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_prediction_snapshots"
ADD CONSTRAINT "entitlement_prediction_snapshots_deal_id_fkey"
FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
