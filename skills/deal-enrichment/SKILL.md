---
name: deal-enrichment
description: >
  Enrich a deal with parcel data, screening results, and market context.
  Use when: a new deal is created, a parcel is added to a deal, or user asks
  to enrich or update deal data with property intelligence.
  Don't use when: user asks for financial modeling, document review, buyer outreach,
  or tasks that don't involve adding property data to a deal record.
---

## Deal Enrichment Workflow

### Steps
1. Load deal context and identify associated parcels
2. For each parcel without screening data, run full screening
3. Pull market comps within 1-mile radius
4. Check knowledge base for prior intelligence on the area
5. Update deal record with enrichment results
6. Calculate confidence score based on data completeness
7. If confidence >= 0.8, mark as enrichment complete
8. If confidence < 0.8, flag missing data for manual review

### Confidence Scoring
- Zoning confirmed: +0.2
- Flood zone confirmed: +0.2
- Environmental clear: +0.15
- Market comps available: +0.15
- Traffic data available: +0.1
- Soils data available: +0.1
- Utilities confirmed: +0.1
