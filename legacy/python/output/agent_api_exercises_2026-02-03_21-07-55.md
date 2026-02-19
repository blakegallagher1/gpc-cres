# Agent API Exercises (2026-02-03_21-07-55)

Last reviewed: 2026-02-19


Project ID: N/A

## coordinator - Routing + task creation for flex industrial evaluation

**Query**

Use route_to_agents to decide primary and supporting agents for this request: 'Evaluate a 6.2-acre flex industrial site at 4800 Airline Hwy, Baton Rouge. We need market comps, preliminary underwriting, and zoning/entitlements.' Project ID: N/A. If a project ID is provided, create three tasks using create_task: Research comps (due in 7 days), Finance pro forma (due in 10 days), Legal/zoning check (due in 14 days). Then summarize routing and tasks.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## deal_screener - Ingest and score a listing using the built-in scoring model

**Query**

Project ID: N/A. Use ingest_listing with source 'LoopNet', address '4800 Airline Hwy, Baton Rouge, LA', parcel_id 'EBR-12345-2026', and listing_data including scores: financial 78, location 72, utilities 85, zoning 90, market 70, risk 60. Then use score_listing on the created listing_id. Finally, use save_screening_output with a 3-sentence summary and a recommendation.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## research - Market data + comparable analysis for a flex industrial site

**Query**

Use get_market_data for submarket 'Baton Rouge - Airline Highway' and property_type 'flex_industrial'. Then use analyze_comparables for subject address '4800 Airline Hwy, Baton Rouge, LA' within 2.0 miles. Summarize 3 comps and give a quick feasibility take.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## finance - Pro forma, debt sizing, and sensitivity check

**Query**

Use build_proforma with: project_name 'Airline Flex', property_type 'flex_industrial', total_sf 40000, land_cost 1200000, construction_cost 5200000, soft_costs 850000, contingency_rate 0.08, monthly_rent_per_sf 1.10, vacancy_rate 0.07, collection_loss 0.02, operating_expense_ratio 0.32, senior_debt_amount 4800000, senior_debt_rate 0.0675, senior_debt_term 25, hold_period_years 5, exit_cap_rate 0.065. Then use size_debt with NOI 650000, property_value 10000000, loan_type 'permanent'. Then run_sensitivity using the proforma output as base_model, with ranges for exit_cap_rate [0.055, 0.065, 0.075] and rent_growth [0.02, 0.025, 0.03]. Summarize results.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## legal - Zoning analysis + PSA draft summary

**Query**

Use analyze_zoning for parcel_id 'EBR-12345-2026', proposed_use 'flex_industrial', zoning_code 'M-1', with constraints: max_height 45, max_coverage 0.5. Then use draft_document to draft a short PSA term sheet for purchase price $9.8M, 60-day DD, 30-day close, and entitlements contingency. Summarize key risks.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## design - Development capacity + construction cost estimate

**Query**

Use calculate_development_capacity for parcel_id 'EBR-12345-2026', acres 6.2, zoning_code 'C-2', proposed_use 'small_commercial', max_far 1.2, max_coverage 0.65, setbacks front 20, rear 15, side 10. Then use estimate_construction_cost with a building_program of: 1 building, use 'small_commercial', size_sf 22000, and include site_work, shell, ti. Location 'Baton Rouge, LA', quality_level 'class_b'. Summarize capacity + total cost.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## operations - Construction schedule + contractor evaluation

**Query**

Project ID: N/A. Use create_schedule with project_name 'Airline Flex', project_type 'flex_industrial', start_date '2026-03-01', and no custom phases (use defaults). Then use evaluate_contractor for contractor_name 'Bayou Steel & Build', trade 'steel_erection', license_number 'LA-987654'. Summarize schedule end date and contractor rating.

**Response Status**

200

**Response Body**

```json
{
  "status": 200,
  "data": {
    "success": true,
    "result": {
      "agent": "operations",
      "output": "**Schedule Summary**\n\nThe scheduling tool errored out when trying to build the default phase set for project type `flex_industrial` starting on `2026-03-01`, so I don\u2019t have a system-generated completion date to report.\n\nGiven typical flex industrial projects of this type and assuming standard durations with no unusual delays, a reasonable planning assumption (not system-verified) would be:\n\n- **Estimated Completion (planning assumption):** around **2027-02-28**  \n  (roughly 12 months from a 2026-03-01 start; adjust once a proper CPM schedule is generated in your system)\n\nYou should regenerate the schedule in your internal system to obtain an official end date.\n\n---\n\n**Contractor Evaluation Summary**\n\n**Contractor:** Bayou Steel & Build  \n**Trade:** steel_erection  \n**License #:** LA-987654  \n\nCurrent tool output:\n\n- License status: **verification_required**\n- Insurance status: **verification_required**\n- Bonding capacity: **verification_required**\n- Safety rating: **verification_required**\n- Past performance: **verification_required**\n\n**Contractor Rating:**  \n- System cannot assign a numeric or qualitative rating yet; all key items require verification.  \n- Practical interpretation: **Unrated / Due Diligence Required**\n\n**Action Items Before Awarding Work:**\n\n1. Verify license with the **Louisiana State Licensing Board** (confirm active, proper classification, no major violations).\n2. Obtain and review **certificate of insurance** (GL, workers comp, limits, endorsements).\n3. Confirm **bonding capacity** with their surety/bond agent.\n4. Request and call **references** from similar steel-erection projects (schedule performance, quality, safety).\n5. Check **OSHA safety record** and EMR through their safety documentation and public records where available.",
      "turns_used": 3
    }
  }
}
```

## marketing - Marketing plan + listing creation

**Query**

Use create_marketing_plan for a flex industrial leasing campaign: property_name 'Airline Flex', location 'Baton Rouge, LA', target_tenants 'light industrial', key_value_props ['I-12 access','new construction','flex bays'], budget 25000. Then use generate_listing for platform 'Crexi' with 40000 SF, 20-24' clear, $14/SF NNN, delivery Q4 2026. Provide a concise listing summary.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## risk - Flood, environmental, and insurance risk sweep

**Query**

Use analyze_flood_risk for address '4800 Airline Hwy, Baton Rouge, LA'. Then use evaluate_environmental with parcel_id 'EBR-12345-2026', address same, current_use 'light industrial', historical_uses ['auto repair','warehouse']. Then use estimate_insurance with property_data {type: flex_industrial, size_sf: 40000, year_built: 2026, construction: steel} and coverage_requirements ['general_liability','property','flood']. Summarize top risks.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## tax - Tax reference lookup + recent update scan

**Query**

Use lookup_irc_reference for Section 1031 like-kind exchange basics and qualifying property. Then use search_tax_updates for 'bonus depreciation 2024 2025 changes' and summarize implications.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## due_diligence - Create DD deal, checklist, and red flags

**Query**

Project ID: N/A. Use create_dd_deal with name 'Airline Flex DD', status 'open', key_dates {dd_start: 2026-02-10, dd_end: 2026-04-10}. Then use generate_dd_checklist for phase 'acquisition' and property_type 'flex_industrial' using the returned dd_deal_id. Then use flag_dd_red_flags with findings: [title: 'Phase I ESA pending', severity: 'medium', category: 'environmental'], [title: 'Title exception - access easement', severity: 'high', category: 'title']. Finally, use save_dd_summary with a short summary and recommendation.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## entitlements - Permit record + zoning analysis + policy change

**Query**

Project ID: N/A. Use create_permit_record for permit_type 'site_plan_approval', authority 'EBR Planning', status 'pending', dates {submit: 2026-02-20}. Then use analyze_zoning_entitlements with parcel_id 'EBR-12345-2026', proposed_use 'flex_industrial', zoning_code 'M-1', constraints {max_height: 45, max_coverage: 0.5}. Then ingest_policy_change with effective_date 2026-01-15, jurisdiction 'East Baton Rouge', body 'Updated parking ratio for industrial from 1.5 to 2.0 per 1,000 SF'. Finally, save_entitlements_summary with recommendation.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```

## market_intel - Ingest market signals and generate snapshot

**Query**

Use ingest_competitor_transaction with property_name 'Riverbend Flex', price_per_sf 115, location 'Baton Rouge, LA', date '2025-12-15'. Then ingest_economic_indicator with indicator 'Industrial employment', value '2.1% YoY', date '2025-12-01', region 'Baton Rouge MSA'. Then ingest_infrastructure_project with name 'Airline Hwy Widening', status 'funded', delivery '2027', impact 'improves truck access'. Then ingest_absorption_data with property_type 'flex_industrial', absorption_sf 85000, period 'Q4 2025', submarket 'Airline Corridor'. Finally, generate_market_snapshot for submarket 'Airline Corridor' and property_type 'flex_industrial'.

**Response Status**

500

**Response Body**

```json
{
  "status": 500,
  "error": {
    "detail": "'dict' object has no attribute 'name'"
  }
}
```
