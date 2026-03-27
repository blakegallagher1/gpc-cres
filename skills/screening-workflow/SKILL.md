---
name: screening-workflow
description: >
  Run environmental and zoning screening on a parcel or set of parcels.
  Use when: user asks to screen a parcel, check flood zones, soils, wetlands, EPA facilities,
  zoning compliance, traffic counts, LDEQ permits, or run full environmental analysis.
  Don't use when: user asks about deal status, document review, buyer outreach, financial modeling,
  or general questions that don't involve parcel-level environmental data.
---

## Screening Workflow

### Steps
1. Identify the target parcel(s) by address or parcel ID
2. Run individual screens in parallel: flood, soils, wetlands, EPA, zoning, traffic, LDEQ
3. For batch operations (>3 parcels), use screen_batch tool with max 20 parcels
4. Aggregate results into a summary with pass/fail per category
5. Flag any critical findings (FEMA Special Flood Hazard Area, wetland overlap >25%, EPA Superfund proximity)
6. Store results in knowledge base for future reference

### Quality Checks
- All 7 screening categories must return data (or explicit "no data available")
- Parcel ID must be validated before screening
- Results must include source attribution (FEMA, USDA, NWI, EPA)
- Confidence scores must be included where available

### Edge Cases
- If gateway is unresponsive, check knowledge base for cached screening data
- If parcel has no geometry, attempt geocoding from address first
- Multi-parish parcels may need separate screening per jurisdiction
