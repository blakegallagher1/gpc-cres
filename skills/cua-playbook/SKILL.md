---
name: cua-playbook
description: >
  Browser automation strategies for navigating county assessor portals and government websites.
  Use when: using browser_task tool to navigate county assessor portals, LACDB, parish clerk sites,
  FEMA flood map service, or any government property data website.
  Don't use when: browsing the production gallagherpropco.com site (use first-party auth instead),
  or when data is available through the property database API.
---

## CUA Browser Automation Playbook

### General Strategy
1. Always check the knowledge base first for a learned strategy for this site
2. Navigate to the target URL and wait for full page load
3. Look for search forms or input fields before scrolling
4. Prefer structured search (parcel ID, address) over free-text search
5. After finding results, extract ALL visible data fields before navigating away
6. Take screenshots at each major step for verification

### Common Patterns
- **Assessor Portals**: Search by parcel ID → results table → detail page → extract fields
- **FEMA Flood Maps**: Enter address → map view → identify flood zone designation
- **Parish Clerk**: Search by owner name or parcel → deed records → extract dates and amounts
- **LACDB**: Navigate to property search → enter criteria → extract environmental data

### Error Recovery
- If login is required, report back and suggest using stored credentials
- If CAPTCHA appears, report back and ask user to complete manually
- If data is behind a paywall, note the source and suggest alternative paths
- If page layout has changed from learned strategy, fall back to visual navigation

### Data Extraction Standards
- Extract exact values, never paraphrase or round numbers
- Include units (acres, sq ft, dollars) with every numeric value
- Note the extraction date and source URL for every data point
- If a field is empty or N/A on the page, record that explicitly
