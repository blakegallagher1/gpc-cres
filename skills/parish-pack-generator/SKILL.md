---
name: parish-pack-generator
description: >
  Generate a comprehensive parish pack document for a deal or jurisdiction.
  Use when: user asks to create a parish pack, jurisdiction summary, market overview,
  or comprehensive area analysis for a specific parish or municipality.
  Don't use when: user asks for individual parcel screening, financial modeling,
  deal-specific analysis, or document extraction from uploaded files.
---

## Parish Pack Generation

### Steps
1. Identify the target jurisdiction (parish, municipality, or custom boundary)
2. Gather market data: recent transactions, vacancy rates, rental comps, absorption
3. Gather regulatory data: zoning districts, permitted uses, setback requirements
4. Gather infrastructure data: traffic counts, utility availability, transit access
5. Gather environmental context: flood zones, wetland coverage, EPA sites
6. Compile into structured report with citations
7. Generate PDF artifact via generate_artifact tool
8. Validate all citations reference actual data sources

### Quality Checks
- Every factual claim must have a citation to a data source
- Market data must be within 12 months of current date
- Zoning information must reference the specific ordinance section
- Report must include a "Limitations" section noting data gaps

### Staleness Rules
- Regenerate if data is older than 90 days
- Flag stale sections rather than regenerating the entire pack
