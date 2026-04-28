#!/usr/bin/env bash
# Deploy EBR zoning rules and parcel screening pipeline
# Usage: ./scripts/zoning-etl/deploy.sh [step]
# Steps: all, schema, rules, mapping, env, owner, scores, verify
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SQL_DIR="$PROJECT_ROOT/infra/sql/zoning"
SSH_HOST="${ZONING_ETL_SSH_HOST:-}"
PSQL_CMD="${ZONING_ETL_PSQL_CMD:-docker exec -i local-postgis psql -U postgres -d cres_db}"

run_psql() {
    if [[ -n "$SSH_HOST" ]]; then
        ssh "$SSH_HOST" "$PSQL_CMD"
    else
        eval "$PSQL_CMD"
    fi
}

run_sql_file() {
    local file="$1"
    local label="$2"
    echo "=== $label ==="
    echo "  Running: $file"
    run_psql < "$file"
    echo ""
}

run_sql_inline() {
    local label="$1"
    local sql="$2"
    echo "=== $label ==="
    echo "$sql" | run_psql
    echo ""
}

step_schema() {
    run_sql_file "$SQL_DIR/001-schema-and-tables.sql" "Step 1: Create schema and tables"
}

step_rules() {
    echo "=== Step 2: Load zoning rules from JSON ==="
    python3 "$SCRIPT_DIR/load_zoning_rules.py" | run_psql
    echo ""
}

step_mapping() {
    run_sql_file "$SQL_DIR/002-code-mapping-and-zoning-screening.sql" "Step 3: Code mapping + zoning screening"
}

step_env() {
    run_sql_file "$SQL_DIR/003-environmental-screening.sql" "Step 4: Environmental screening (slow — spatial joins)"
}

step_owner() {
    run_sql_file "$SQL_DIR/004-owner-analysis.sql" "Step 5: Owner analysis"
}

step_scores() {
    run_sql_file "$SQL_DIR/005-opportunity-scores.sql" "Step 6: Opportunity scores"
}

step_verify() {
    echo "=== Verification ==="
    run_sql_inline "Row counts" "
SELECT 'zoning_districts' as tbl, COUNT(*) as cnt FROM property.zoning_districts
UNION ALL SELECT 'dimensional_standards', COUNT(*) FROM property.zoning_dimensional_standards
UNION ALL SELECT 'use_permissions', COUNT(*) FROM property.zoning_use_permissions
UNION ALL SELECT 'parking_rules', COUNT(*) FROM property.zoning_parking_rules
UNION ALL SELECT 'entitlement_paths', COUNT(*) FROM property.zoning_entitlement_paths
UNION ALL SELECT 'code_mapping', COUNT(*) FROM property.zoning_code_mapping
UNION ALL SELECT 'parcel_zoning_screening', COUNT(*) FROM property.parcel_zoning_screening
UNION ALL SELECT 'parcel_environmental', COUNT(*) FROM property.parcel_environmental_screening
UNION ALL SELECT 'parcel_owner_analysis', COUNT(*) FROM property.parcel_owner_analysis
UNION ALL SELECT 'parcel_opportunity', COUNT(*) FROM property.parcel_opportunity_scores
ORDER BY tbl;
"

    run_sql_inline "Zoning screening summary" "
SELECT zoning_group, COUNT(*) as parcels,
  SUM(CASE WHEN conforming_lot_area_flag THEN 1 ELSE 0 END) as conforming,
  SUM(CASE WHEN theoretical_lot_split_count >= 2 THEN 1 ELSE 0 END) as splittable
FROM property.parcel_zoning_screening
GROUP BY zoning_group ORDER BY parcels DESC;
"

    run_sql_inline "Owner type distribution" "
SELECT owner_type, COUNT(*) as cnt FROM property.parcel_owner_analysis GROUP BY owner_type ORDER BY cnt DESC;
"

    run_sql_inline "Top opportunity scores" "
SELECT top_opportunity_type, COUNT(*) as cnt,
  ROUND(AVG(overall_opportunity_score), 1) as avg_score,
  MAX(overall_opportunity_score) as max_score
FROM property.parcel_opportunity_scores
WHERE overall_opportunity_score > 0
GROUP BY top_opportunity_type ORDER BY cnt DESC;
"

    run_sql_inline "Unmapped zoning codes" "
SELECT raw_code FROM property.zoning_code_mapping WHERE mapped = false ORDER BY raw_code;
"

    echo "=== Verification complete ==="
}

STEP="${1:-all}"
case "$STEP" in
    all)
        step_schema
        step_rules
        step_mapping
        step_env
        step_owner
        step_scores
        step_verify
        ;;
    schema)  step_schema ;;
    rules)   step_rules ;;
    mapping) step_mapping ;;
    env)     step_env ;;
    owner)   step_owner ;;
    scores)  step_scores ;;
    verify)  step_verify ;;
    *)
        echo "Usage: $0 [all|schema|rules|mapping|env|owner|scores|verify]"
        exit 1
        ;;
esac
