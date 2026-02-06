# Advanced IRC Calculation and Logic Library
## 2026 Tax Year - Comprehensive Reference Guide

**Document Version:** 1.0  
**Effective Date:** February 3, 2026  
**Jurisdiction:** United States Internal Revenue Code

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Individual Income Tax](#2-individual-income-tax)
3. [Business Tax](#3-business-tax)
4. [Tax Credits](#4-tax-credits)
5. [Retirement & Savings](#5-retirement--savings)
6. [Capital Gains & Estate Tax](#6-capital-gains--estate-tax)
7. [Trump's OBBBA Provisions](#7-trumps-obbba-provisions)
8. [Calculation Library](#8-calculation-library)
9. [Quick Reference Tables](#9-quick-reference-tables)
10. [Real Estate Depreciation & Cost Segregation](#10-real-estate-depreciation--cost-segregation)

---

## 1. Executive Summary

### Overview

The **Advanced IRC Calculation and Logic Library** provides a comprehensive reference for all major tax calculations, thresholds, and provisions applicable to the 2026 tax year. This document serves as the authoritative source for tax professionals, software developers, and financial planners implementing tax logic systems.

### Key Changes from OBBBA (One Big Beautiful Bill Act)

The 2026 tax year incorporates significant provisions from the OBBBA legislation, representing the most substantial tax reform since the TCJA of 2017:

| Provision | Previous Law | OBBBA 2026 Change |
|-----------|--------------|-------------------|
| No Tax on Tips | Fully taxable | First $25,000 exempt |
| No Tax on Overtime | Fully taxable | First $12,500 exempt |
| Auto Loan Interest | Not deductible | Up to $10,000 deductible |
| Senior Bonus | Not available | $6,000 additional deduction |
| SALT Cap | $10,000 | Increased to $40,400 with phaseout |
| Estate Tax Exemption | $13.99M (2025) | $15M indexed |
| Gift Annual Exclusion | $18,000 (2025) | $19,000 indexed |
| Child Tax Credit | $2,000 | Increased to $2,200 |

### Document Structure

This library is organized into nine major sections:

- **Section 2:** Individual income tax brackets, deductions, and surtaxes
- **Section 3:** Business taxation including corporate rates, depreciation, and QBI
- **Section 4:** All major tax credits with phaseout calculations
- **Section 5:** Retirement account and health savings contribution limits
- **Section 6:** Capital gains rates and transfer tax provisions
- **Section 7:** OBBBA-specific provisions and implementation details
- **Section 8:** Mathematical formulas and calculation algorithms
- **Section 9:** Condensed quick reference tables

---

## 2. Individual Income Tax

### 2.1 2026 Federal Income Tax Brackets

#### Single Filers

| Tax Rate | Income Range | Tax Calculation |
|----------|--------------|-----------------|
| 10% | $0 - $11,925 | 10% of taxable income |
| 12% | $11,926 - $48,475 | $1,192.50 + 12% of amount over $11,925 |
| 22% | $48,476 - $103,350 | $5,578.50 + 22% of amount over $48,475 |
| 24% | $103,351 - $197,300 | $17,650.50 + 24% of amount over $103,350 |
| 32% | $197,301 - $250,525 | $40,198.50 + 32% of amount over $197,300 |
| 35% | $250,526 - $626,350 | $57,230.50 + 35% of amount over $250,525 |
| 37% | Over $626,350 | $188,769.25 + 37% of amount over $626,350 |

#### Married Filing Jointly (MFJ)

| Tax Rate | Income Range | Tax Calculation |
|----------|--------------|-----------------|
| 10% | $0 - $23,850 | 10% of taxable income |
| 12% | $23,851 - $96,950 | $2,385 + 12% of amount over $23,850 |
| 22% | $96,951 - $206,700 | $11,157 + 22% of amount over $96,950 |
| 24% | $206,701 - $394,600 | $35,301 + 24% of amount over $206,700 |
| 32% | $394,601 - $501,050 | $80,397 + 32% of amount over $394,600 |
| 35% | $501,051 - $751,600 | $114,461 + 35% of amount over $501,050 |
| 37% | Over $751,600 | $202,153.50 + 37% of amount over $751,600 |

#### Married Filing Separately (MFS)

| Tax Rate | Income Range | Tax Calculation |
|----------|--------------|-----------------|
| 10% | $0 - $11,925 | 10% of taxable income |
| 12% | $11,926 - $48,475 | $1,192.50 + 12% of amount over $11,925 |
| 22% | $48,476 - $103,350 | $5,578.50 + 22% of amount over $48,475 |
| 24% | $103,351 - $197,300 | $17,650.50 + 24% of amount over $103,350 |
| 32% | $197,301 - $250,525 | $40,198.50 + 32% of amount over $197,300 |
| 35% | $250,526 - $375,800 | $57,230.50 + 35% of amount over $250,525 |
| 37% | Over $375,800 | $101,076.75 + 37% of amount over $375,800 |

#### Head of Household (HoH)

| Tax Rate | Income Range | Tax Calculation |
|----------|--------------|-----------------|
| 10% | $0 - $17,000 | 10% of taxable income |
| 12% | $17,001 - $64,850 | $1,700 + 12% of amount over $17,000 |
| 22% | $64,851 - $103,350 | $7,442 + 22% of amount over $64,850 |
| 24% | $103,351 - $197,300 | $15,912 + 24% of amount over $103,350 |
| 32% | $197,301 - $250,500 | $38,460 + 32% of amount over $197,300 |
| 35% | $250,501 - $626,350 | $55,484 + 35% of amount over $250,500 |
| 37% | Over $626,350 | $187,031.50 + 37% of amount over $626,350 |

### 2.2 Standard Deduction Amounts

| Filing Status | 2026 Standard Deduction | Additional (Age 65+/Blind) |
|---------------|------------------------|---------------------------|
| Single | $15,000 | $1,950 |
| Married Filing Jointly | $30,000 | $1,550 per qualifying person |
| Married Filing Separately | $15,000 | $1,550 per qualifying person |
| Head of Household | $22,500 | $1,950 |
| Surviving Spouse | $30,000 | $1,550 |

**Note:** The additional standard deduction amount for age 65 or older and/or blind is added to the base standard deduction.

### 2.3 Alternative Minimum Tax (AMT)

#### AMT Exemption Amounts

| Filing Status | 2026 AMT Exemption |
|---------------|-------------------|
| Single | $88,100 |
| Married Filing Jointly | $137,000 |
| Married Filing Separately | $68,500 |
| Head of Household | $88,100 |

#### AMT Exemption Phaseout Thresholds

| Filing Status | Phaseout Begins | Phaseout Complete |
|---------------|-----------------|-------------------|
| Single | $609,350 | $875,800 |
| Married Filing Jointly | $1,218,700 | $1,751,600 |
| Married Filing Separately | $609,350 | $875,800 |
| Head of Household | $609,350 | $875,800 |

#### AMT Rate Structure

| AMT Taxable Income | Rate |
|-------------------|------|
| $0 - $232,600 (MFJ: $0 - $465,200) | 26% |
| Over $232,600 (MFJ: Over $465,200) | 28% |

### 2.4 Net Investment Income Tax (NIIT)

| Threshold | Amount |
|-----------|--------|
| Single / Head of Household | $200,000 |
| Married Filing Jointly | $250,000 |
| Married Filing Separately | $125,000 |
| Estates and Trusts | $14,450 |

**Rate:** 3.8% on the lesser of:
- Net investment income, OR
- MAGI exceeding the threshold

### 2.5 Additional Medicare Tax

| Threshold | Amount |
|-----------|--------|
| Single / Head of Household | $200,000 |
| Married Filing Jointly | $250,000 |
| Married Filing Separately | $125,000 |
| Self-employed (all filing statuses) | $200,000 |

**Rate:** 0.9% on wages/SE income exceeding the threshold

---

## 3. Business Tax

### 3.1 Corporate Tax Rates

| Taxable Income | Rate |
|----------------|------|
| $0 - $50,000 | 15% |
| $50,001 - $75,000 | 25% |
| $75,001 - $100,000 | 34% |
| $100,001 - $335,000 | 39% |
| $335,001 - $10,000,000 | 34% |
| $10,000,001 - $15,000,000 | 35% |
| $15,000,001 - $18,333,333 | 38% |
| Over $18,333,333 | 35% |

**Flat Rate Alternative:** 21% flat rate (TCJA provision, extended through 2026)

### 3.2 Section 179 Expensing

| Parameter | 2026 Amount |
|-----------|-------------|
| Maximum Section 179 Expense | $1,250,000 |
| Phase-Out Threshold (Total Investment) | $3,130,000 |
| Complete Phase-Out | $4,380,000 |

**Qualified Property Includes:**
- Tangible personal property
- Computer software
- Qualified real property (limited)
- Certain improvements to nonresidential real property

### 3.3 Bonus Depreciation

| Year | Bonus Depreciation Rate |
|------|------------------------|
| 2023 | 80% |
| 2024 | 60% |
| 2025 | 40% |
| **2026** | **20%** |
| 2027 | 0% (phased out) |

**Note:** 100% bonus depreciation restored for qualified property placed in service after September 27, 2017, and before January 1, 2023 under TCJA.

### 3.4 Qualified Business Income (QBI) Deduction (Section 199A)

#### QBI Deduction Thresholds

| Filing Status | 2026 Threshold | Phase-Out Range |
|---------------|----------------|-----------------|
| Single / Head of Household | $191,950 | $191,950 - $241,950 |
| Married Filing Jointly | $383,900 | $383,900 - $483,900 |

#### QBI Deduction Limitations

**General Rule:** Lesser of:
- 20% of QBI, OR
- 20% of taxable income (less net capital gains)

**Specified Service Trade or Business (SSTB) Limitation:**
- Full deduction below threshold
- Phased out within range
- No deduction above complete phase-out

**W-2 Wage and Property Limitation (for non-SSTBs above threshold):**
- Greater of:
  - 50% of W-2 wages, OR
  - 25% of W-2 wages + 2.5% of unadjusted basis of qualified property

### 3.5 Self-Employment Tax

| Component | Rate | Wage Base |
|-----------|------|-----------|
| Social Security (OASDI) | 12.4% | $176,100 |
| Medicare (HI) | 2.9% | No limit |
| **Total SE Tax** | **15.3%** | - |

**Self-Employment Tax Calculation:**
- Net earnings from self-employment × 92.35% = SE income subject to tax
- First $176,100 × 15.3%
- Amount over $176,100 × 2.9%

**Deductible Portion:** 50% of SE tax (above-the-line deduction)

### 3.6 Payroll Tax Rates (Employer/Employee)

| Tax | Employee Rate | Employer Rate | Total | Wage Base |
|-----|---------------|---------------|-------|-----------|
| Social Security | 6.2% | 6.2% | 12.4% | $176,100 |
| Medicare | 1.45% | 1.45% | 2.9% | No limit |
| Additional Medicare | 0.9%* | 0% | 0.9% | Over $200K/$250K |

*Employee-only tax on wages exceeding thresholds

---

## 4. Tax Credits

### 4.1 Child Tax Credit (CTC)

#### 2026 CTC Structure

| Component | Amount |
|-----------|--------|
| Maximum CTC per qualifying child | $2,200 |
| Refundable portion (ACTC) | $1,800 |
| Minimum earned income for refundability | $2,500 |
| Phase-out threshold (Single/HoH) | $200,000 |
| Phase-out threshold (MFJ) | $400,000 |
| Phase-out rate | $50 per $1,000 over threshold |

#### CTC Calculation Formula

```
Base CTC = $2,200 × Number of qualifying children

If MAGI > Phase-out threshold:
    Excess MAGI = MAGI - Threshold
    Phase-out amount = (Excess MAGI / $1,000) × $50
    Allowable CTC = MAX(Base CTC - Phase-out amount, $0)
Else:
    Allowable CTC = Base CTC

Refundable portion = MIN(Allowable CTC, $1,800)
    Limited to 15% of earned income over $2,500
```

**Qualifying Child Requirements:**
- Under age 17 at end of tax year
- U.S. citizen, national, or resident alien
- Relationship test (son, daughter, stepchild, etc.)
- Residency test (lived with taxpayer more than half the year)
- Support test (child did not provide over half own support)

### 4.2 Earned Income Tax Credit (EITC)

#### 2026 EITC Parameters

| Filing Status | No Children | 1 Child | 2 Children | 3+ Children |
|---------------|-------------|---------|------------|-------------|
| **Maximum Credit** | $649 | $4,328 | $7,152 | $8,046 |
| **Maximum AGI (Single/HoH)** | $18,591 | $49,084 | $55,768 | $59,899 |
| **Maximum AGI (MFJ)** | $25,511 | $56,004 | $62,688 | $66,819 |
| **Investment Income Limit** | $11,950 | $11,950 | $11,950 | $11,950 |

#### EITC Phase-Out Ranges

| Children | Phase-Out Begins (Single) | Phase-Out Complete (Single) |
|----------|---------------------------|----------------------------|
| 0 | $10,330 | $18,591 |
| 1 | $24,210 | $49,084 |
| 2 | $24,210 | $55,768 |
| 3+ | $24,210 | $59,899 |

#### EITC Rate Structure

| Children | Phase-In Rate | Plateau Range | Phase-Out Rate |
|----------|---------------|---------------|----------------|
| 0 | 7.65% | $7,840 - $10,330 | 7.65% |
| 1 | 34% | $11,610 - $24,210 | 15.98% |
| 2 | 40% | $16,310 - $24,210 | 21.06% |
| 3+ | 45% | $16,310 - $24,210 | 21.06% |

### 4.3 Education Credits

#### American Opportunity Tax Credit (AOTC)

| Component | Amount |
|-----------|--------|
| Maximum credit per student | $2,500 |
| Credit percentage (first $2,000) | 100% |
| Credit percentage (next $2,000) | 25% |
| Refundable portion | 40% of credit |
| Phase-out begins (Single) | $80,000 |
| Phase-out complete (Single) | $90,000 |
| Phase-out begins (MFJ) | $160,000 |
| Phase-out complete (MFJ) | $180,000 |

**Eligibility Requirements:**
- Student must be pursuing degree or credential
- Enrolled at least half-time
- First four years of post-secondary education
- No felony drug conviction

#### Lifetime Learning Credit (LLC)

| Component | Amount |
|-----------|--------|
| Maximum credit per return | $2,000 |
| Credit rate | 20% of qualified expenses |
| Maximum expenses | $10,000 |
| Phase-out begins (Single) | $80,000 |
| Phase-out complete (Single) | $90,000 |
| Phase-out begins (MFJ) | $160,000 |
| Phase-out complete (MFJ) | $180,000 |

**Key Differences from AOTC:**
- No limit on years claimed
- Available for non-degree courses
- No enrollment status requirement
- Not refundable

#### Student Loan Interest Deduction

| Component | Amount |
|-----------|--------|
| Maximum deduction | $2,500 |
| Phase-out begins (Single) | $75,000 |
| Phase-out complete (Single) | $90,000 |
| Phase-out begins (MFJ) | $155,000 |
| Phase-out complete (MFJ) | $185,000 |

### 4.4 Child and Dependent Care Credit

| Expense Limit | 1 Qualifying Person | 2+ Qualifying Persons |
|---------------|--------------------:|----------------------:|
| Maximum expenses | $3,000 | $6,000 |

#### Credit Percentage Based on AGI

| AGI Range | Credit Percentage |
|-----------|------------------:|
| $0 - $15,000 | 35% |
| $15,001 - $17,000 | 34% |
| $17,001 - $19,000 | 33% |
| $19,001 - $21,000 | 32% |
| $21,001 - $23,000 | 31% |
| $23,001 - $25,000 | 30% |
| $25,001 - $27,000 | 29% |
| $27,001 - $29,000 | 28% |
| $29,001 - $31,000 | 27% |
| $31,001 - $33,000 | 26% |
| $33,001 - $35,000 | 25% |
| $35,001 - $37,000 | 24% |
| $37,001 - $39,000 | 23% |
| $39,001 - $41,000 | 22% |
| $41,001 - $43,000 | 21% |
| Over $43,000 | 20% |

**Maximum Credit:**
- 1 person: $3,000 × 35% = $1,050
- 2+ persons: $6,000 × 35% = $2,100

---

## 5. Retirement & Savings

### 5.1 401(k) and Similar Employer Plans

| Contribution Type | 2026 Limit |
|-------------------|------------|
| Employee Elective Deferral | $23,500 |
| Employee + Employer Total | $70,000 |
| Compensation Limit | $350,000 |

#### Catch-Up Contributions (Age 50+)

| Plan Type | Regular Catch-Up | Super Catch-Up (60-63)* |
|-----------|-----------------:|------------------------:|
| 401(k)/403(b)/457 | $7,500 | $11,250 |
| SIMPLE 401(k) | $3,500 | $5,250 |

*OBBBA provision: Higher catch-up for ages 60-63 effective 2025-2033

### 5.2 IRA Contributions

| IRA Type | 2026 Limit | Catch-Up (50+) |
|----------|------------|----------------|
| Traditional IRA | $7,000 | $1,000 |
| Roth IRA | $7,000 | $1,000 |
| **Total IRA Contribution** | **$7,000** | **$8,000** |

#### Roth IRA Income Phase-Out Ranges

| Filing Status | Phase-Out Begins | Phase-Out Complete |
|---------------|------------------|-------------------|
| Single / Head of Household | $150,000 | $165,000 |
| Married Filing Jointly | $236,000 | $246,000 |
| Married Filing Separately | $0 | $10,000 |

#### Traditional IRA Deductibility (Active Plan Participant)

| Filing Status | Phase-Out Begins | Phase-Out Complete |
|---------------|------------------|-------------------|
| Single / Head of Household | $79,000 | $89,000 |
| Married Filing Jointly | $126,000 | $146,000 |
| MFJ (spouse not covered) | $236,000 | $246,000 |

### 5.3 Health Savings Accounts (HSA)

| Coverage Type | 2026 Contribution Limit | Catch-Up (55+) |
|---------------|------------------------:|---------------:|
| Self-Only | $4,300 | $1,000 |
| Family | $8,550 | $1,000 |

#### HSA-Qualified HDHP Requirements

| Requirement | Self-Only | Family |
|-------------|-----------|--------|
| Minimum Deductible | $1,650 | $3,300 |
| Maximum Out-of-Pocket | $8,300 | $16,600 |

### 5.4 Flexible Spending Accounts (FSA)

| FSA Type | 2026 Limit |
|----------|------------|
| Health Care FSA | $3,300 |
| Dependent Care FSA | $5,000 ($2,500 MFS) |
| Limited Purpose FSA (HSA compatible) | $3,300 |

**Carryover Provision:** Up to $660 of unused health FSA funds may carry over to next plan year

### 5.5 Other Retirement Accounts

| Account Type | 2026 Limit |
|--------------|------------|
| SEP IRA (employer contribution) | Lesser of $70,000 or 25% of compensation |
| SIMPLE IRA (employee deferral) | $16,500 |
| SIMPLE IRA (catch-up 50+) | $3,500 |
| 403(b) Elective Deferral | $23,500 |
| 457(b) Elective Deferral | $23,500 |

---

## 6. Capital Gains & Estate Tax

### 6.1 Long-Term Capital Gains Tax Brackets

#### 0% Rate Bracket

| Filing Status | Income Range |
|---------------|--------------|
| Single | $0 - $48,350 |
| Married Filing Jointly | $0 - $96,700 |
| Married Filing Separately | $0 - $48,350 |
| Head of Household | $0 - $64,750 |

#### 15% Rate Bracket

| Filing Status | Income Range |
|---------------|--------------|
| Single | $48,351 - $533,400 |
| Married Filing Jointly | $96,701 - $600,050 |
| Married Filing Separately | $48,351 - $300,025 |
| Head of Household | $64,751 - $566,700 |

#### 20% Rate Bracket

| Filing Status | Income Threshold |
|---------------|------------------|
| Single | Over $533,400 |
| Married Filing Jointly | Over $600,050 |
| Married Filing Separately | Over $300,025 |
| Head of Household | Over $566,700 |

#### Net Investment Income Tax (NIIT) on Capital Gains

Long-term capital gains may also be subject to 3.8% NIIT for taxpayers exceeding MAGI thresholds (see Section 2.4).

**Maximum Combined Rate:** 23.8% (20% + 3.8%)

### 6.2 Estate and Gift Tax

#### Estate Tax Exemption

| Year | Exemption Amount |
|------|-----------------|
| 2025 | $13,990,000 |
| **2026** | **$15,000,000** |
| 2027 (projected) | $15,300,000 |

#### Estate Tax Rate Structure

| Taxable Estate Above Exemption | Rate |
|-------------------------------|------|
| $0 - $10,000 | 18% |
| $10,001 - $20,000 | 20% |
| $20,001 - $40,000 | 22% |
| $40,001 - $60,000 | 24% |
| $60,001 - $80,000 | 26% |
| $80,001 - $100,000 | 28% |
| $100,001 - $150,000 | 30% |
| $150,001 - $250,000 | 32% |
| $250,001 - $500,000 | 34% |
| $500,001 - $750,000 | 37% |
| $750,001 - $1,000,000 | 39% |
| Over $1,000,000 | 40% |

#### Gift Tax Annual Exclusion

| Year | Annual Exclusion |
|------|-----------------|
| 2025 | $18,000 |
| **2026** | **$19,000** |

**Gift Splitting:** Married couples may combine exclusions to gift $38,000 per recipient

#### Gift Tax Lifetime Exemption

| Component | Amount |
|-----------|--------|
| Lifetime Gift Tax Exemption | $15,000,000 |
| Unified with Estate Tax | Yes |
| Portability to Surviving Spouse | Yes |

### 6.3 Generation-Skipping Transfer (GST) Tax

| Component | 2026 Amount |
|-----------|-------------|
| GST Exemption | $15,000,000 |
| GST Tax Rate | 40% |

---

## 7. Trump's OBBBA Provisions

### 7.1 No Tax on Tips

| Component | Details |
|-----------|---------|
| Exemption Amount | First $25,000 of tip income |
| Effective Date | January 1, 2026 |
| Eligible Workers | Service industry employees |
| Covered Tips | Cash and charged tips |
| Reporting Requirement | Form W-2, Box 7 (Social Security tips) |

#### Implementation Notes

- Tips exceeding $25,000 remain taxable as ordinary income
- Applies to federal income tax only; FICA taxes still apply
- Employer must report tips on W-2 for employee to claim exemption
- No phase-out based on income level

#### Calculation Example

```
Total Tip Income: $32,000
Exempt Amount: -$25,000
Taxable Tip Income: $7,000
```

### 7.2 No Tax on Overtime

| Component | Details |
|-----------|---------|
| Exemption Amount | First $12,500 of overtime pay |
| Effective Date | January 1, 2026 |
| Eligible Workers | Hourly employees |
| Definition | Hours worked over 40 per week (FLSA standard) |
| Salaried Workers | May qualify if classified as non-exempt |

#### Implementation Notes

- Applies to overtime premium portion of pay
- Regular wages remain fully taxable
- Employer must separately track overtime hours
- No income-based phase-out

#### Calculation Example

```
Regular Wages: $45,000
Overtime Pay: $15,000
Exempt Overtime: -$12,500
Taxable Overtime: $2,500
Total Taxable Wages: $47,500
```

### 7.3 Auto Loan Interest Deduction

| Component | Details |
|-----------|---------|
| Maximum Deduction | $10,000 per return |
| Effective Date | January 1, 2026 |
| Eligible Vehicles | New and used vehicles |
| Vehicle Type | Passenger vehicles, trucks, SUVs |
| Use Requirement | Must be used for personal purposes |
| Business Use | Pro-rated if mixed business/personal use |

#### Limitations and Phase-Out

| Filing Status | Phase-Out Begins | Phase-Out Complete |
|---------------|------------------|-------------------|
| Single / Head of Household | $100,000 | $150,000 |
| Married Filing Jointly | $200,000 | $300,000 |
| Married Filing Separately | $100,000 | $150,000 |

#### Calculation Example

```
Auto Loan Interest Paid: $12,000
Maximum Allowable: $10,000
AGI: $225,000 (MFJ)
Phase-out percentage: ($225,000 - $200,000) / $100,000 = 25%
Reduced Deduction: $10,000 × (1 - 0.25) = $7,500
```

### 7.4 Senior Bonus Deduction

| Component | Details |
|-----------|---------|
| Deduction Amount | $6,000 per return |
| Age Requirement | Both spouses must be 65 or older |
| Filing Status | Any (if both spouses meet age requirement) |
| Effective Date | January 1, 2026 |
| Income Limitation | Phases out above certain thresholds |

#### Phase-Out Schedule

| Filing Status | Full Deduction | Phase-Out Begins | Phase-Out Complete |
|---------------|----------------|------------------|-------------------|
| Single | $6,000 | $75,000 | $100,000 |
| Married Filing Jointly | $6,000 | $150,000 | $200,000 |
| Head of Household | $6,000 | $112,500 | $150,000 |

#### Calculation Example

```
Filing Status: MFJ
Ages: 67 and 66
AGI: $175,000
Phase-out percentage: ($175,000 - $150,000) / $50,000 = 50%
Senior Bonus Deduction: $6,000 × (1 - 0.50) = $3,000
```

### 7.5 SALT Cap Increase

| Component | Details |
|-----------|---------|
| New SALT Cap | $40,400 per return |
| Previous Cap | $10,000 per return |
| Effective Date | January 1, 2026 |
| Applicability | All state and local taxes |

#### Phase-Out for High-Income Taxpayers

| Filing Status | Phase-Out Begins | Phase-Out Complete |
|---------------|------------------|-------------------|
| Single | $300,000 | $400,000 |
| Married Filing Jointly | $600,000 | $800,000 |
| Head of Household | $300,000 | $400,000 |

#### SALT Cap Calculation

```
Base SALT Cap: $40,400

If AGI > Phase-out threshold:
    Excess AGI = AGI - Threshold
    Phase-out range = Complete - Begins
    Phase-out percentage = Excess AGI / Phase-out range
    Reduced Cap = $40,400 × (1 - Phase-out percentage)
Else:
    Reduced Cap = $40,400

Allowable SALT Deduction = MIN(Actual SALT paid, Reduced Cap)
```

### 7.6 Trump Savings Accounts

| Account Feature | Details |
|-----------------|---------|
| Annual Contribution Limit | $10,000 per individual |
| Tax Treatment | Tax-deductible contributions |
| Growth | Tax-deferred |
| Withdrawals | Tax-free for qualified expenses |
| Qualified Expenses | Education, home purchase, healthcare, retirement |
| Income Limits | Phase-out begins at $200,000 (Single), $400,000 (MFJ) |

#### Qualified Expense Categories

1. **Education:** Tuition, fees, books, supplies
2. **First Home Purchase:** Up to $50,000 lifetime
3. **Healthcare:** Medical expenses not covered by insurance
4. **Retirement:** Available without penalty after age 59.5

#### Phase-Out Schedule

| Filing Status | Full Contribution | Phase-Out Begins | Phase-Out Complete |
|---------------|------------------:|------------------:|-------------------:|
| Single | $10,000 | $200,000 | $250,000 |
| Married Filing Jointly | $20,000 | $400,000 | $500,000 |
| Head of Household | $10,000 | $200,000 | $250,000 |

### 7.7 Made Permanent Provisions

The following TCJA provisions have been made permanent under OBBBA:

| Provision | Previous Sunset | New Status |
|-----------|-----------------|------------|
| 21% Corporate Tax Rate | 2025 | Permanent |
| 20% QBI Deduction | 2025 | Permanent |
| Increased Standard Deduction | 2025 | Permanent |
| Expanded Child Tax Credit | 2025 | Permanent |
| AMT Exemption Increases | 2025 | Permanent |
| Estate Tax Exemption | 2025 (reduction) | Permanent at $15M+ |
| 529 Plan Expansion | 2025 | Permanent |
| Pass-Through Deduction | 2025 | Permanent |

---

## 8. Calculation Library

### 8.1 Federal Income Tax Calculation

```python
def calculate_federal_tax(taxable_income, filing_status):
    """
    Calculate federal income tax based on 2026 brackets
    """
    brackets = {
        'single': [
            (0, 11925, 0.10),
            (11925, 48475, 0.12),
            (48475, 103350, 0.22),
            (103350, 197300, 0.24),
            (197300, 250525, 0.32),
            (250525, 626350, 0.35),
            (626350, float('inf'), 0.37)
        ],
        'mfj': [
            (0, 23850, 0.10),
            (23850, 96950, 0.12),
            (96950, 206700, 0.22),
            (206700, 394600, 0.24),
            (394600, 501050, 0.32),
            (501050, 751600, 0.35),
            (751600, float('inf'), 0.37)
        ],
        'mfs': [
            (0, 11925, 0.10),
            (11925, 48475, 0.12),
            (48475, 103350, 0.22),
            (103350, 197300, 0.24),
            (197300, 250525, 0.32),
            (250525, 375800, 0.35),
            (375800, float('inf'), 0.37)
        ],
        'hoh': [
            (0, 17000, 0.10),
            (17000, 64850, 0.12),
            (64850, 103350, 0.22),
            (103350, 197300, 0.24),
            (197300, 250500, 0.32),
            (250500, 626350, 0.35),
            (626350, float('inf'), 0.37)
        ]
    }
    
    tax = 0
    remaining_income = taxable_income
    
    for low, high, rate in brackets[filing_status]:
        bracket_income = min(remaining_income, high - low)
        if bracket_income > 0:
            tax += bracket_income * rate
            remaining_income -= bracket_income
        if remaining_income <= 0:
            break
    
    return tax
```

### 8.2 AMT Calculation

```python
def calculate_amt(taxable_income, adjustments, exemptions, filing_status):
    """
    Calculate Alternative Minimum Tax
    """
    # AMT exemption amounts 2026
    amt_exemptions = {
        'single': 88100,
        'mfj': 137000,
        'mfs': 68500,
        'hoh': 88100
    }
    
    # Phase-out thresholds
    phaseout_starts = {
        'single': 609350,
        'mfj': 1218700,
        'mfs': 609350,
        'hoh': 609350
    }
    
    # Calculate AMT income
    amt_income = taxable_income + sum(adjustments)
    
    # Apply exemption phase-out
    exemption = amt_exemptions[filing_status]
    phaseout_start = phaseout_starts[filing_status]
    
    if amt_income > phaseout_start:
        phaseout_amount = (amt_income - phaseout_start) * 0.25
        exemption = max(0, exemption - phaseout_amount)
    
    amt_taxable = max(0, amt_income - exemption)
    
    # Calculate AMT (26% on first $232,600, 28% above)
    bracket_threshold = 232600 if filing_status != 'mfj' else 465200
    
    if amt_taxable <= bracket_threshold:
        amt = amt_taxable * 0.26
    else:
        amt = (bracket_threshold * 0.26) + 
              ((amt_taxable - bracket_threshold) * 0.28)
    
    return amt
```

### 8.3 Child Tax Credit Calculation

```python
def calculate_ctc(num_children, magi, filing_status):
    """
    Calculate Child Tax Credit with phase-out
    """
    base_ctc = 2200 * num_children
    refundable_limit = 1800 * num_children
    
    # Phase-out thresholds
    thresholds = {
        'single': 200000,
        'mfj': 400000,
        'mfs': 200000,
        'hoh': 200000
    }
    
    threshold = thresholds[filing_status]
    
    if magi <= threshold:
        allowable_ctc = base_ctc
    else:
        excess_magi = magi - threshold
        phaseout_units = excess_magi / 1000
        phaseout_amount = phaseout_units * 50
        allowable_ctc = max(0, base_ctc - phaseout_amount)
    
    # Calculate refundable portion
    # Limited to 15% of earned income over $2,500
    # Simplified - actual calculation uses earned income
    refundable_ctc = min(allowable_ctc, refundable_limit)
    nonrefundable_ctc = allowable_ctc - refundable_ctc
    
    return {
        'total_ctc': allowable_ctc,
        'refundable': refundable_ctc,
        'nonrefundable': nonrefundable_ctc
    }
```

### 8.4 QBI Deduction Calculation

```python
def calculate_qbi_deduction(qbi, taxable_income, w2_wages, 
                           property_basis, filing_status, is_sstb):
    """
    Calculate Qualified Business Income Deduction (Section 199A)
    """
    # Thresholds for 2026
    thresholds = {
        'single': (191950, 241950),
        'mfj': (383900, 483900),
        'mfs': (191950, 241950),
        'hoh': (191950, 241950)
    }
    
    threshold_start, threshold_end = thresholds[filing_status]
    
    # Base QBI deduction (20% of QBI or 20% of taxable income)
    base_deduction = min(qbi * 0.20, taxable_income * 0.20)
    
    if is_sstb and taxable_income > threshold_end:
        # SSTB completely phased out
        return 0
    
    if taxable_income <= threshold_start:
        # Below threshold - full deduction
        return base_deduction
    
    # Within phase-out range or above with limitations
    if taxable_income <= threshold_end:
        # Phase-out calculation for SSTBs
        phaseout_pct = (taxable_income - threshold_start) / \
                       (threshold_end - threshold_start)
        if is_sstb:
            return base_deduction * (1 - phaseout_pct)
    
    # W-2 wage and property limitation
    wage_limit = w2_wages * 0.50
    wage_property_limit = (w2_wages * 0.25) + (property_basis * 0.025)
    limitation = max(wage_limit, wage_property_limit)
    
    if is_sstb:
        # Apply phase-out to limitation
        phaseout_pct = (taxable_income - threshold_start) / \
                       (threshold_end - threshold_start)
        applicable_limitation = limitation * (1 - phaseout_pct)
    else:
        applicable_limitation = limitation
    
    return min(base_deduction, applicable_limitation)
```

### 8.5 Self-Employment Tax Calculation

```python
def calculate_se_tax(net_earnings, filing_status):
    """
    Calculate self-employment tax
    """
    social_security_wage_base = 176100
    se_rate = 0.9235  # 92.35% of net earnings
    
    # Calculate SE income
    se_income = net_earnings * se_rate
    
    # Social Security portion (12.4%)
    ss_taxable = min(se_income, social_security_wage_base)
    social_security_tax = ss_taxable * 0.124
    
    # Medicare portion (2.9%)
    medicare_tax = se_income * 0.029
    
    # Additional Medicare Tax (0.9% on income over thresholds)
    additional_medicare_thresholds = {
        'single': 200000,
        'mfj': 250000,
        'mfs': 125000,
        'hoh': 200000
    }
    
    threshold = additional_medicare_thresholds[filing_status]
    additional_medicare = max(0, (se_income - threshold)) * 0.009
    
    total_se_tax = social_security_tax + medicare_tax + additional_medicare
    deductible_portion = total_se_tax * 0.50
    
    return {
        'total_se_tax': total_se_tax,
        'deductible_portion': deductible_portion,
        'social_security': social_security_tax,
        'medicare': medicare_tax,
        'additional_medicare': additional_medicare
    }
```

### 8.6 Capital Gains Tax Calculation

```python
def calculate_capital_gains_tax(long_term_gains, short_term_gains, 
                                ordinary_income, filing_status):
    """
    Calculate capital gains tax with preferential rates
    """
    # 2026 LTCG brackets
    ltcg_brackets = {
        'single': (48350, 533400),
        'mfj': (96700, 600050),
        'mfs': (48350, 300025),
        'hoh': (64750, 566700)
    }
    
    zero_rate_top, fifteen_rate_top = ltcg_brackets[filing_status]
    
    # Short-term gains taxed as ordinary income
    st_tax = calculate_federal_tax(ordinary_income + short_term_gains, 
                                    filing_status) - \
             calculate_federal_tax(ordinary_income, filing_status)
    
    # Long-term gains taxed at preferential rates
    total_income = ordinary_income + short_term_gains
    remaining_gains = long_term_gains
    lt_tax = 0
    
    # 0% bracket
    space_in_zero = max(0, zero_rate_top - total_income)
    gains_at_zero = min(remaining_gains, space_in_zero)
    lt_tax += gains_at_zero * 0.00
    remaining_gains -= gains_at_zero
    
    # 15% bracket
    if remaining_gains > 0:
        space_in_fifteen = max(0, fifteen_rate_top - max(total_income, zero_rate_top))
        gains_at_fifteen = min(remaining_gains, space_in_fifteen)
        lt_tax += gains_at_fifteen * 0.15
        remaining_gains -= gains_at_fifteen
    
    # 20% bracket
    if remaining_gains > 0:
        lt_tax += remaining_gains * 0.20
    
    return {
        'short_term_tax': st_tax,
        'long_term_tax': lt_tax,
        'total_capital_gains_tax': st_tax + lt_tax
    }
```

### 8.7 EITC Calculation

```python
def calculate_eitc(earned_income, agi, investment_income, 
                   num_children, filing_status):
    """
    Calculate Earned Income Tax Credit
    """
    # 2026 EITC parameters
    eitc_params = {
        0: {'max_credit': 649, 'max_agi_single': 18591, 'max_agi_mfj': 25511},
        1: {'max_credit': 4328, 'max_agi_single': 49084, 'max_agi_mfj': 56004},
        2: {'max_credit': 7152, 'max_agi_single': 55768, 'max_agi_mfj': 62688},
        3: {'max_credit': 8046, 'max_agi_single': 59899, 'max_agi_mfj': 66819}
    }
    
    investment_income_limit = 11950
    
    # Check investment income limit
    if investment_income > investment_income_limit:
        return 0
    
    # Check AGI limit
    params = eitc_params.get(num_children, eitc_params[0])
    max_agi = params['max_agi_mfj'] if filing_status == 'mfj' else params['max_agi_single']
    
    if agi > max_agi:
        return 0
    
    # Phase-in rates
    phase_in_rates = {0: 0.0765, 1: 0.34, 2: 0.40, 3: 0.45}
    phase_in_rate = phase_in_rates.get(num_children, 0.0765)
    
    # Earnings required for maximum credit
    max_credit_earnings = {0: 7840, 1: 11610, 2: 16310, 3: 16310}
    max_earnings = max_credit_earnings.get(num_children, 7840)
    
    # Calculate credit
    if earned_income <= max_earnings:
        # Phase-in region
        eitc = earned_income * phase_in_rate
    else:
        # Plateau then phase-out
        eitc = params['max_credit']
        # Phase-out calculation would continue here based on filing status
        # and number of children
    
    return min(eitc, params['max_credit'])
```

### 8.8 OBBBA Provisions Combined Calculation

```python
def calculate_obbba_adjustments(wages, tips, overtime_pay, auto_loan_interest,
                                ages, agi, filing_status, salt_paid):
    """
    Calculate all OBBBA provision adjustments
    """
    adjustments = {}
    
    # No Tax on Tips
    exempt_tips = min(tips, 25000)
    taxable_tips = tips - exempt_tips
    adjustments['tip_exemption'] = exempt_tips
    adjustments['taxable_tips'] = taxable_tips
    
    # No Tax on Overtime
    exempt_overtime = min(overtime_pay, 12500)
    taxable_overtime = overtime_pay - exempt_overtime
    adjustments['overtime_exemption'] = exempt_overtime
    adjustments['taxable_overtime'] = taxable_overtime
    
    # Auto Loan Interest Deduction
    auto_deduction = min(auto_loan_interest, 10000)
    # Apply phase-out
    auto_phaseout = {
        'single': (100000, 150000),
        'mfj': (200000, 300000),
        'mfs': (100000, 150000),
        'hoh': (100000, 150000)
    }
    auto_start, auto_end = auto_phaseout[filing_status]
    if agi > auto_start:
        auto_phaseout_pct = min(1, (agi - auto_start) / (auto_end - auto_start))
        auto_deduction = auto_deduction * (1 - auto_phaseout_pct)
    adjustments['auto_loan_deduction'] = auto_deduction
    
    # Senior Bonus
    senior_bonus = 0
    if all(age >= 65 for age in ages):
        senior_bonus = 6000
        senior_phaseout = {
            'single': (75000, 100000),
            'mfj': (150000, 200000),
            'mfs': (75000, 100000),
            'hoh': (112500, 150000)
        }
        senior_start, senior_end = senior_phaseout[filing_status]
        if agi > senior_start:
            senior_phaseout_pct = min(1, (agi - senior_start) / (senior_end - senior_start))
            senior_bonus = senior_bonus * (1 - senior_phaseout_pct)
    adjustments['senior_bonus'] = senior_bonus
    
    # SALT Cap
    salt_cap = 40400
    salt_phaseout = {
        'single': (300000, 400000),
        'mfj': (600000, 800000),
        'mfs': (300000, 400000),
        'hoh': (300000, 400000)
    }
    salt_start, salt_end = salt_phaseout[filing_status]
    if agi > salt_start:
        salt_phaseout_pct = min(1, (agi - salt_start) / (salt_end - salt_start))
        salt_cap = salt_cap * (1 - salt_phaseout_pct)
    adjustments['salt_cap'] = salt_cap
    adjustments['allowable_salt'] = min(salt_paid, salt_cap)
    
    return adjustments
```

---

## 9. Quick Reference Tables

### 9.1 2026 Tax Year At-a-Glance

| Category | Single | MFJ | MFS | HoH |
|----------|--------|-----|-----|-----|
| **Standard Deduction** | $15,000 | $30,000 | $15,000 | $22,500 |
| **10% Bracket Top** | $11,925 | $23,850 | $11,925 | $17,000 |
| **12% Bracket Top** | $48,475 | $96,950 | $48,475 | $64,850 |
| **22% Bracket Top** | $103,350 | $206,700 | $103,350 | $103,350 |
| **24% Bracket Top** | $197,300 | $394,600 | $197,300 | $197,300 |
| **32% Bracket Top** | $250,525 | $501,050 | $250,525 | $250,500 |
| **35% Bracket Top** | $626,350 | $751,600 | $375,800 | $626,350 |
| **37% Bracket Start** | $626,351 | $751,601 | $375,801 | $626,351 |

### 9.2 Retirement & Savings Limits Quick Reference

| Account Type | 2026 Limit | Catch-Up (50+) | Super Catch-Up (60-63) |
|--------------|------------|----------------|------------------------|
| 401(k) | $23,500 | $7,500 | $11,250 |
| IRA (Traditional/Roth) | $7,000 | $1,000 | N/A |
| HSA (Self-Only) | $4,300 | $1,000 | N/A |
| HSA (Family) | $8,550 | $1,000 | N/A |
| FSA (Health) | $3,300 | N/A | N/A |
| FSA (Dependent Care) | $5,000 | N/A | N/A |
| SEP IRA | $70,000 | N/A | N/A |
| SIMPLE IRA | $16,500 | $3,500 | $5,250 |

### 9.3 Tax Credits Quick Reference

| Credit | Maximum Amount | Phase-Out Begins (Single) | Phase-Out Begins (MFJ) |
|--------|---------------|---------------------------|------------------------|
| Child Tax Credit | $2,200/child | $200,000 | $400,000 |
| EITC (3+ children) | $8,046 | $59,899 | $66,819 |
| AOTC | $2,500/student | $80,000 | $160,000 |
| LLC | $2,000/return | $80,000 | $160,000 |
| CDCC (1 child) | $1,050 | N/A | N/A |
| CDCC (2+ children) | $2,100 | N/A | N/A |

### 9.4 OBBBA Provisions Quick Reference

| Provision | Amount | Phase-Out Begins (Single) | Phase-Out Begins (MFJ) |
|-----------|--------|---------------------------|------------------------|
| No Tax on Tips | $25,000 | No phase-out | No phase-out |
| No Tax on Overtime | $12,500 | No phase-out | No phase-out |
| Auto Loan Interest | $10,000 | $100,000 | $200,000 |
| Senior Bonus | $6,000 | $75,000 | $150,000 |
| SALT Cap | $40,400 | $300,000 | $600,000 |
| Trump Savings Account | $10,000 | $200,000 | $400,000 |

### 9.5 Capital Gains & Estate Tax Quick Reference

| Metric | Single | MFJ | MFS | HoH |
|--------|--------|-----|-----|-----|
| **0% LTCG Top** | $48,350 | $96,700 | $48,350 | $64,750 |
| **15% LTCG Top** | $533,400 | $600,050 | $300,025 | $566,700 |
| **20% LTCG Start** | $533,401 | $600,051 | $300,026 | $566,701 |
| **NIIT Threshold** | $200,000 | $250,000 | $125,000 | $200,000 |
| **Add. Medicare Threshold** | $200,000 | $250,000 | $125,000 | $200,000 |

| Transfer Tax | 2026 Amount |
|--------------|-------------|
| Estate Tax Exemption | $15,000,000 |
| Gift Annual Exclusion | $19,000 |
| GST Exemption | $15,000,000 |
| Estate/GST Tax Rate | 40% |

### 9.6 Business Tax Quick Reference

| Provision | 2026 Amount |
|-----------|-------------|
| Corporate Tax Rate (Flat) | 21% |
| Section 179 Limit | $1,250,000 |
| Section 179 Phase-Out | $3,130,000 |
| Bonus Depreciation | 20% |
| QBI Deduction | 20% of QBI |
| QBI Threshold (Single) | $191,950 |
| QBI Threshold (MFJ) | $383,900 |
| SE Tax Wage Base | $176,100 |
| SE Tax Rate | 15.3% |

### 9.7 Payroll Tax Quick Reference

| Tax | Employee Rate | Employer Rate | Wage Base |
|-----|---------------|---------------|-----------|
| Social Security | 6.2% | 6.2% | $176,100 |
| Medicare | 1.45% | 1.45% | No limit |
| FUTA | 0% | 0.6%* | $7,000 |

*After credit; gross rate is 6.0%

---

## Appendix A: Filing Status Determination

| Status | Requirements |
|--------|--------------|
| **Single** | Unmarried, not qualifying widow(er), not HoH |
| **Married Filing Jointly** | Married as of December 31, both spouses agree |
| **Married Filing Separately** | Married, choose to file separate returns |
| **Head of Household** | Unmarried, pay >50% household costs, qualifying person |
| **Qualifying Widow(er)** | Spouse died in prior 2 years, dependent child, not remarried |

### Head of Household Qualifying Persons

- Child, stepchild, or descendant who lived with you >6 months
- Qualifying relative who lived with you all year
- Parent (need not live with you if you paid >50% of household costs)

---

## Appendix B: Important Dates

| Date | Action Required |
|------|-----------------|
| January 31, 2026 | W-2 and 1099 forms due to employees/recipients |
| April 15, 2026 | Individual tax return filing deadline |
| April 15, 2026 | IRA contribution deadline for 2025 |
| June 15, 2026 | Extended deadline for overseas taxpayers |
| October 15, 2026 | Extended filing deadline (with approved extension) |
| December 31, 2026 | Last day for 2026 retirement contributions |

---

## Document Information

**Version:** 1.0  
**Last Updated:** February 3, 2026  
**Next Review:** January 2027  
**Author:** Advanced IRC Calculation and Logic Library  
**Classification:** Reference Document - Public Use

### Disclaimer

This document is provided for informational purposes only and does not constitute legal or tax advice. Tax laws are subject to change, and individual circumstances may vary. Consult a qualified tax professional for advice specific to your situation.

### Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | February 3, 2026 | Initial release with 2026 tax year provisions |

---

*End of Document*
---

# 10. REAL ESTATE DEPRECIATION & COST SEGREGATION

## 10.1 Overview of Real Estate Depreciation

Depreciation is the systematic allocation of the cost of tangible property over its useful life. For real estate, depreciation allows investors to recover the cost of income-producing property through annual tax deductions.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Basis** | The amount of your investment in property for tax purposes |
| **Recovery Period** | The number of years over which the property's cost is recovered |
| **Depreciation Method** | The formula used to calculate depreciation (straight-line, declining balance) |
| **Convention** | The rule determining when depreciation begins and ends (mid-month, mid-quarter, half-year) |
| **Placed in Service** | The date property is ready and available for use |

### Depreciable vs. Non-Depreciable Property

**Depreciable:**
- Buildings and structures
- Land improvements
- Furniture and fixtures
- Equipment
- Qualified improvement property

**Non-Depreciable:**
- Land (including land preparation costs)
- Inventory
- Personal residences (not used for business)
- Property placed in service and disposed of in same year

---

## 10.2 Residential Rental Property (27.5-Year)

### Definition
Residential rental property is a building or structure from which you receive rental income, where 80% or more of the gross rental income is from dwelling units.

### Key Characteristics

| Attribute | Specification |
|-----------|---------------|
| **Recovery Period (GDS)** | 27.5 years |
| **Recovery Period (ADS)** | 30 years (40 years for pre-2018 property) |
| **Depreciation Method** | Straight-line |
| **Convention** | Mid-month |
| **Applicable Percentage** | 3.636% annually (full year) |

### 27.5-Year Depreciation Schedule (Sample)

| Year | Percentage | Annual Depreciation (on $100,000 basis) |
|------|------------|----------------------------------------|
| 1 (month varies) | 3.182% - 3.485% | $3,182 - $3,485 |
| 2-27 | 3.636% | $3,636 |
| 28 (partial) | 0.000% - 1.97% | $0 - $1,970 |

### Example Calculation

**Property Details:**
- Purchase Price: $400,000
- Land Value: $100,000
- Building Basis: $300,000
- Placed in Service: July 15, 2026

**Year 1 Depreciation:**
```
Basis: $300,000
Month Placed in Service: July (7th month)
First Year Percentage (from Table A-6): 2.273%
Year 1 Depreciation: $300,000 × 2.273% = $6,819
```

**Years 2-27:**
```
Annual Depreciation: $300,000 × 3.636% = $10,908
```

---

## 10.3 Nonresidential Real Property (39-Year Commercial)

### Definition
Nonresidential real property includes commercial buildings, office buildings, retail spaces, warehouses, and industrial facilities.

### Key Characteristics

| Attribute | Specification |
|-----------|---------------|
| **Recovery Period (GDS)** | 39 years |
| **Recovery Period (ADS)** | 40 years |
| **Depreciation Method** | Straight-line |
| **Convention** | Mid-month |
| **Applicable Percentage** | 2.564% annually (full year) |

### 39-Year Depreciation Schedule (Sample)

| Year | Percentage | Annual Depreciation (on $100,000 basis) |
|------|------------|----------------------------------------|
| 1 (month varies) | 1.391% - 2.247% | $1,391 - $2,247 |
| 2-39 | 2.564% | $2,564 |
| 40 (partial) | 0.000% - 1.391% | $0 - $1,391 |

### Example Calculation

**Property Details:**
- Purchase Price: $1,000,000
- Land Value: $200,000
- Building Basis: $800,000
- Placed in Service: March 10, 2026

**Year 1 Depreciation:**
```
Basis: $800,000
Month Placed in Service: March (3rd month)
First Year Percentage (from Table A-7a): 2.033%
Year 1 Depreciation: $800,000 × 2.033% = $16,264
```

**Years 2-39:**
```
Annual Depreciation: $800,000 × 2.564% = $20,512
```


---

## 10.4 Land Improvements (15-Year Property)

### Definition
Land improvements are enhancements to land that have a limited life and are separate from the land itself.

### Qualifying Land Improvements

| Category | Examples |
|----------|----------|
| **Site Improvements** | Parking lots, driveways, sidewalks, curbs |
| **Landscaping** | Shrubs, trees (non-bearing), sod, irrigation systems |
| **Fencing** | Chain-link, wood, vinyl fencing |
| **Utilities** | Water, sewer, electrical, gas hookups |
| **Site Preparation** | Grading, excavation, drainage systems |
| **Outdoor Lighting** | Parking lot lights, security lighting |
| **Retaining Walls** | Structural walls, decorative walls |

### Key Characteristics

| Attribute | Specification |
|-----------|---------------|
| **Recovery Period (GDS)** | 15 years |
| **Recovery Period (ADS)** | 20 years |
| **Depreciation Method** | 150% declining balance (switches to straight-line) |
| **Convention** | Half-year or mid-quarter |
| **Bonus Depreciation (2026)** | 100% (OBBBA made permanent for post-Jan 19, 2025) |

### 15-Year Depreciation Schedule (150% DB Method)

| Year | Percentage (Half-Year) | Annual Depreciation (on $100,000 basis) |
|------|------------------------|----------------------------------------|
| 1 | 5.0% | $5,000 |
| 2 | 9.5% | $9,500 |
| 3 | 8.55% | $8,550 |
| 4-15 | Varies | Declining balance |

---

## 10.5 Qualified Improvement Property (QIP) - 15-Year

### Definition (IRC §168(e)(6))

Qualified Improvement Property (QIP) is any improvement made by the taxpayer to an interior portion of a nonresidential building that is already in service, excluding:
- Building enlargements
- Elevators and escalators
- Internal structural framework

### Key Characteristics

| Attribute | Specification |
|-----------|---------------|
| **Recovery Period (GDS)** | 15 years |
| **Recovery Period (ADS)** | 20 years |
| **Depreciation Method** | Straight-line |
| **Convention** | Half-year or mid-quarter |
| **Bonus Depreciation (2026)** | 100% (post-Jan 19, 2025 property under OBBBA) |

### QIP Eligibility Requirements

1. **Made by the taxpayer** (not inherited or purchased from related party)
2. **Interior portion only** (exterior improvements don't qualify)
3. **Building already in service** (not new construction)
4. **Nonresidential building** (not residential rental)

### Example Calculation

**Improvement Details:**
- Interior office renovation: $150,000
- Placed in Service: June 2026
- Building already in service since 2019

**Bonus Depreciation (2026 - Post OBBBA):**
```
Bonus Depreciation Rate: 100% (for post-Jan 19, 2025 property)
Bonus Deduction: $150,000 × 100% = $150,000
Remaining Basis: $0
```

**If Bonus Not Taken (Straight-Line 15-Year):**
```
Year 1 (Half-Year): $150,000 × 3.333% = $5,000
Years 2-15: $150,000 × 6.667% = $10,000 annually
```

---

## 10.6 Cost Segregation Studies

### Definition

A cost segregation study is an engineering-based analysis that identifies and reclassifies personal property assets to shorten depreciation time for taxation purposes.

### Primary Objectives

1. **Accelerate Depreciation** - Reclassify 39-year or 27.5-year property to 5, 7, or 15-year property
2. **Maximize Bonus Depreciation** - Identify assets eligible for immediate expensing
3. **Reduce Taxable Income** - Generate larger deductions in early years
4. **Improve Cash Flow** - Defer tax payments to later years

### Asset Classification System

| Asset Class | Recovery Period | Depreciation Method | Examples |
|-------------|-----------------|---------------------|----------|
| **3-Year Property** | 3 years | 200% DB | Special handling devices, qualified rent-to-own |
| **5-Year Property** | 5 years | 200% DB | Computers, office equipment, appliances, carpeting |
| **7-Year Property** | 7 years | 200% DB | Furniture, fixtures, most personal property |
| **15-Year Property** | 15 years | 150% DB | Land improvements, QIP |
| **27.5-Year Property** | 27.5 years | Straight-line | Residential rental buildings |
| **39-Year Property** | 39 years | Straight-line | Nonresidential real property |

### Cost Segregation Methodologies

#### 1. Detailed Cost Approach (Actual Cost)
**Best for:** New construction, properties with detailed construction records

**Process:**
- Review actual construction invoices and contracts
- Itemize costs by trade (electrical, plumbing, HVAC, etc.)
- Allocate costs to specific assets using engineering judgment
- Apply unit costs from detailed estimates

**Accuracy:** Highest (±5-10%)

#### 2. Residual Estimation Approach
**Best for:** Acquired properties without detailed records

**Process:**
- Start with total purchase price
- Allocate to land (non-depreciable)
- Estimate building structure (39 or 27.5-year)
- Estimate land improvements (15-year)
- Residual allocated to personal property (5, 7, 15-year)

**Accuracy:** Moderate (±10-15%)

#### 3. Sampling/Modeling Approach
**Best for:** Multiple similar properties (fast food chains, retail outlets)

**Process:**
- Stratify properties by type
- Perform detailed study on sample properties
- Develop standard model/template
- Apply model percentages to entire portfolio

**Accuracy:** Variable (±15-20%)

#### 4. Rule of Thumb Approach (NOT Recommended)
**Process:** Apply industry averages without property-specific analysis

**IRS Position:** Viewed with caution; lacks sufficient documentation


### Cost Segregation Example

**Commercial Property Purchase:**
- Total Purchase Price: $2,000,000
- Land Value: $400,000
- Building Basis: $1,600,000

**Without Cost Segregation:**
```
39-Year Depreciation: $1,600,000 × 2.564% = $41,024 annually
Year 1-5 Total Depreciation: $205,120
```

**With Cost Segregation Study:**

| Asset Class | Amount | Recovery Period | Year 1 Depreciation |
|-------------|--------|-----------------|---------------------|
| Personal Property (5-year) | $240,000 | 5 years | $240,000 (100% bonus) |
| Personal Property (7-year) | $80,000 | 7 years | $80,000 (100% bonus) |
| Land Improvements (15-year) | $160,000 | 15 years | $160,000 (100% bonus) |
| Building Structure (39-year) | $1,120,000 | 39 years | $28,717 |
| **Total** | **$1,600,000** | | **$508,717** |

**Benefit:**
```
Additional Year 1 Depreciation: $508,717 - $41,024 = $467,693
Tax Savings (37% bracket): $467,693 × 37% = $173,046
```

### Look-Back Studies (Form 3115)

For properties placed in service in prior years, taxpayers can:

1. **File Form 3115** (Application for Change in Accounting Method)
2. **Claim "Catch-Up" Depreciation** - Deduct missed depreciation in current year
3. **No Amended Returns Required** - Adjustment taken in current year

**Example:**
- Property purchased 2022 for $1,000,000
- Cost segregation identifies $200,000 in 5-year property
- 2026 Look-back study filed
- Catch-up depreciation: $200,000 × 100% bonus = $200,000 deduction in 2026

---

## 10.7 Bonus Depreciation for Real Estate

### OBBBA Changes (2026)

The One Big Beautiful Bill Act made **100% bonus depreciation permanent** for qualified property acquired and placed in service after January 19, 2025.

### Bonus Depreciation Rates by Year

| Year | Pre-OBBBA Rate | Post-OBBBA Rate |
|------|----------------|-----------------|
| 2023 | 80% | 80% |
| 2024 | 60% | 60% |
| 2025 | 40% | 100% (post-Jan 19) |
| **2026** | **20%** | **100%** |
| 2027+ | 0% | 100% |

### Real Estate Property Eligible for Bonus Depreciation

| Property Type | Eligible? | Notes |
|--------------|-----------|-------|
| **Qualified Improvement Property (QIP)** | Yes | 15-year property |
| **Land Improvements** | Yes | 15-year property |
| **Residential Rental Property** | No | 27.5-year real property |
| **Commercial Real Property** | No | 39-year real property |
| **Furniture & Fixtures** | Yes | 5 or 7-year property |
| **Equipment** | Yes | 5 or 7-year property |

### Bonus Depreciation Calculation Example

**Commercial Property with Cost Segregation:**
- Total Basis: $1,500,000
- Land: $300,000
- Building Structure: $900,000 (39-year, NOT eligible)
- QIP: $150,000 (15-year, eligible)
- Land Improvements: $100,000 (15-year, eligible)
- 5-Year Property: $50,000 (eligible)

**2026 Bonus Depreciation (Post-OBBBA):**
```
Eligible for Bonus:
- QIP: $150,000 × 100% = $150,000
- Land Improvements: $100,000 × 100% = $100,000
- 5-Year Property: $50,000 × 100% = $50,000

Total Bonus Depreciation: $300,000
Remaining Basis: $0 (for bonus-eligible property)

Building Structure (39-year):
- Year 1 Depreciation: $900,000 × 2.564% = $23,076

Total First Year Deduction: $323,076
```

---

## 10.8 Section 179 for Real Estate

### OBBBA Enhancements (2026)

| Limit | Pre-OBBBA (2024) | OBBBA 2026 |
|-------|------------------|------------|
| **Maximum Deduction** | $1,220,000 | $2,560,000 |
| **Phase-Out Threshold** | $3,050,000 | $4,090,000 |
| **Complete Phase-Out** | $4,270,000 | $6,650,000 |

### Real Property Eligible for Section 179

| Property Type | Eligible? | Notes |
|--------------|-----------|-------|
| **Roofs** | Yes | Nonresidential buildings only |
| **HVAC Systems** | Yes | Heating, ventilation, air conditioning |
| **Fire Protection/Alarm Systems** | Yes | Sprinklers, alarms, monitoring |
| **Security Systems** | Yes | Cameras, access control |
| **Qualified Improvement Property** | Yes | Interior improvements |
| **Residential Rental Property** | No | Excluded from Section 179 |
| **Building Structure** | No | 39/27.5-year real property |

### Section 179 Limitations

1. **Taxable Income Limitation** - Deduction cannot exceed taxable income from active trade or business
2. **Business Use Requirement** - Property must be used >50% for business
3. **Carryforward** - Unused deduction carried forward to future years

---

## 10.9 Depreciation Recapture (Section 1250)

### Overview

When depreciable real property is sold at a gain, the IRS requires taxpayers to "recapture" depreciation deductions previously taken by taxing them at a special rate.

### Section 1250 Recapture Rules

| Property Type | Recapture Rate | Applies To |
|--------------|----------------|------------|
| **Residential Rental** | 25% | Depreciation taken in excess of straight-line |
| **Nonresidential Real** | 25% | All depreciation (since only straight-line allowed) |
| **Personal Property** | Ordinary income rates | Section 1245 recapture |

### Depreciation Recapture Calculation

**Example - Residential Rental Property:**

| Item | Amount |
|------|--------|
| Original Purchase Price | $400,000 |
| Land Value | $100,000 |
| Building Basis | $300,000 |
| Accumulated Depreciation (10 years) | $109,091 |
| Adjusted Basis | $290,909 |
| Sale Price | $525,000 |
| Selling Costs | $31,500 |
| Net Sale Proceeds | $493,500 |
| **Total Gain** | **$202,591** |

**Gain Characterization:**
```
Section 1250 Recapture (25% rate): $109,091 (depreciation taken)
Long-Term Capital Gain (15%/20%): $93,500 (remaining appreciation)

Total Tax:
- Recapture: $109,091 × 25% = $27,273
- Capital Gains: $93,500 × 15% = $14,025
- Total Federal Tax: $41,298
```

### Avoiding Depreciation Recapture

1. **Section 1031 Exchange** - Defer recapture indefinitely
2. **Stepped-Up Basis at Death** - Heirs receive FMV basis, eliminating recapture
3. **Installment Sale** - Spread recapture over multiple years
4. **Opportunity Zone Investment** - Defer and potentially reduce gain


---

## 10.10 1031 Like-Kind Exchanges

### Overview

Section 1031 allows taxpayers to defer capital gains tax and depreciation recapture when exchanging investment property for like-kind property.

### Key Requirements (2026)

| Requirement | Rule |
|-------------|------|
| **Property Type** | Real property held for investment or business use |
| **Like-Kind Standard** | Any real property for any real property (broad definition) |
| **Identification Period** | 45 days from sale of relinquished property |
| **Exchange Period** | 180 days from sale (or tax return due date, whichever is earlier) |
| **Qualified Intermediary** | Required - taxpayer cannot touch proceeds |
| **Boot** | Taxable to extent of cash or non-like-kind property received |

### Depreciation Recapture in 1031 Exchanges

- **Deferred, Not Eliminated** - Recapture liability carries to replacement property
- **Basis Carryover** - Adjusted basis transfers to new property
- **Accumulated Depreciation** - Continues to track

**Example:**
```
Relinquished Property:
- Original Basis: $300,000
- Accumulated Depreciation: $100,000
- Adjusted Basis: $200,000
- Sale Price: $500,000
- Deferred Gain: $300,000

Replacement Property:
- Purchase Price: $600,000
- Deferred Gain: $300,000
- New Basis: $300,000 ($600,000 - $300,000 deferred gain)
- Accumulated Depreciation: $100,000 (carries over)
```

### Stepped-Up Basis at Death

If taxpayer holds replacement property until death:
- Heirs receive stepped-up basis to FMV
- All accumulated depreciation recapture liability eliminated
- Permanent elimination of tax

---

## 10.11 Passive Activity Loss (PAL) Rules

### Overview (IRC §469)

Passive activity loss rules limit the ability to deduct rental real estate losses against non-passive income (W-2 wages, business income, portfolio income).

### $25,000 Special Allowance

| Filing Status | MAGI Threshold | Phase-Out Range |
|--------------|----------------|-----------------|
| **Single/MFJ** | $100,000 | $100,000 - $150,000 |
| **Married Filing Separately** | $50,000 | $50,000 - $75,000 |

**Calculation:**
```
If MAGI ≤ $100,000: Full $25,000 allowance
If MAGI > $150,000: $0 allowance
If MAGI between: $25,000 - [(MAGI - $100,000) × 50%]

Example: MAGI = $120,000
Phase-out = $25,000 - [($120,000 - $100,000) × 50%] = $15,000 allowance
```

### Suspended Losses

- Losses exceeding annual allowance are suspended
- Carried forward indefinitely
- Deductible when:
  - Passive income generated
  - Property disposed of to unrelated party
  - Real estate professional status achieved

### Real Estate Professional Status (IRC §469(c)(7))

**Requirements (must meet BOTH):**

1. **50% Test** - More than 50% of personal services during year in real property trades or businesses
2. **750-Hour Test** - More than 750 hours per year in real property trades or businesses

**Qualifying Activities:**
- Property development/redevelopment
- Construction/reconstruction
- Property acquisition
- Rental operations and management
- Leasing activities
- Real estate brokerage

**Benefits of Real Estate Professional Status:**
- Rental losses treated as non-passive
- Unlimited deduction against ordinary income
- Avoids 3.8% NIIT on rental income
- No PAL limitations

---

## 10.12 Tangible Property Regulations & De Minimis Safe Harbor

### De Minimis Safe Harbor Election (§1.263(a)-1(f))

**Purpose:** Deduct small-dollar expenditures immediately rather than capitalizing and depreciating.

**Thresholds:**

| Financial Statement Type | Maximum Per Item/Invoice |
|-------------------------|--------------------------|
| **With AFS (audited financials)** | $5,000 |
| **Without AFS** | $2,500 |

**Requirements:**
- Must have written accounting policy (if AFS)
- Must expense on books consistently
- Must elect annually by attaching statement to return
- Applies to all qualifying expenditures for the year

**Exclusions:**
- Inventory
- Land
- Rotable/temporary spare parts (if capitalized)
- Amounts subject to §263A (UNICAP)

### Betterment vs. Repair Analysis

**Betterments (Capitalize):**
- Enlargement or expansion
- Material increase in capacity, productivity, efficiency
- Material extension of useful life
- Cure of material condition or defect that existed before acquisition

**Repairs (Deduct):**
- Keeps property in operating condition
- Does not materially increase value or extend life
- Routine maintenance

---

## 10.13 ADS vs. GDS Comparison

### General Depreciation System (GDS)

| Feature | Specification |
|---------|---------------|
| **Recovery Periods** | Shorter (27.5, 39, 15, 5, 7 years) |
| **Depreciation Methods** | 200% DB, 150% DB, Straight-line |
| **Bonus Depreciation** | Available |
| **Section 179** | Available |

### Alternative Depreciation System (ADS)

| Feature | Specification |
|---------|---------------|
| **Recovery Periods** | Longer (30, 40, 20 years) |
| **Depreciation Method** | Straight-line only |
| **Bonus Depreciation** | Not available |
| **Section 179** | Not available |

### When ADS is Required

| Situation | ADS Requirement |
|-----------|-----------------|
| **Electing Real Property Trade or Business** | Required for §163(j) interest limitation election |
| **Farming Business (UNICAP election out)** | Required |
| **Tax-Exempt Use Property** | Required |
| **Property Financed with Tax-Exempt Bonds** | Required |
| **Property Used Predominantly Outside U.S.** | Required |

---

## 10.14 Depreciation Conventions

### Mid-Month Convention (Real Property)

**Applies to:**
- Residential rental property (27.5-year)
- Nonresidential real property (39-year)

**Rule:** Property placed in service or disposed of during a month is treated as placed in service or disposed of at the midpoint of that month.

**First Year Calculation:**
```
Depreciation = Full Year Depreciation × (Months in Service - 0.5) / 12

Example: Property placed in service July 10
Months in service: July - December = 6 months
First year percentage: (6 - 0.5) / 12 = 5.5 / 12 = 45.83%
```

### Half-Year Convention (Personal Property)

**Applies to:**
- 3, 5, 7, 10, 15, 20-year property (unless mid-quarter applies)

**Rule:** Property placed in service or disposed of during the year is treated as placed in service or disposed of at the midpoint of the tax year.

**First Year:** 50% of full-year depreciation (regardless of when placed in service)

### Mid-Quarter Convention (Personal Property)

**Applies when:** >40% of total depreciable basis placed in service during last 3 months of tax year

**Quarter Percentages:**

| Quarter Placed in Service | First Year % |
|---------------------------|--------------|
| Q1 (Jan-Mar) | 87.5% |
| Q2 (Apr-Jun) | 62.5% |
| Q3 (Jul-Sep) | 37.5% |
| Q4 (Oct-Dec) | 12.5% |


---

## 10.15 Real Estate Depreciation Calculation Library

### Function 1: Residential Rental Depreciation

```python
def calculate_residential_rental_depreciation(purchase_price, land_value, 
                                               placed_in_service_month, year):
    """
    Calculate residential rental property depreciation (27.5-year)
    
    Parameters:
    - purchase_price: Total purchase price
    - land_value: Allocated land value (non-depreciable)
    - placed_in_service_month: Month placed in service (1-12)
    - year: Tax year (1 = first year)
    
    Returns: Annual depreciation amount
    """
    building_basis = purchase_price - land_value
    annual_rate = 0.03636  # 3.636%
    
    # First year - mid-month convention
    if year == 1:
        months_in_service = 13 - placed_in_service_month
        first_year_fraction = (months_in_service - 0.5) / 12
        return building_basis * annual_rate * first_year_fraction
    
    # Years 2-27 - full year
    elif 2 <= year <= 27:
        return building_basis * annual_rate
    
    # Year 28 - remaining basis
    elif year == 28:
        total_prior = (building_basis * annual_rate * 
                      ((12.5 - placed_in_service_month) / 12) + 
                      (building_basis * annual_rate * 26))
        return building_basis - total_prior
    
    else:
        return 0
```

### Function 2: Commercial Property Depreciation

```python
def calculate_commercial_depreciation(purchase_price, land_value,
                                      placed_in_service_month, year):
    """
    Calculate commercial property depreciation (39-year)
    
    Parameters:
    - purchase_price: Total purchase price
    - land_value: Allocated land value
    - placed_in_service_month: Month placed in service (1-12)
    - year: Tax year (1 = first year)
    
    Returns: Annual depreciation amount
    """
    building_basis = purchase_price - land_value
    annual_rate = 0.02564  # 2.564%
    
    # First year - mid-month convention
    if year == 1:
        months_in_service = 13 - placed_in_service_month
        first_year_fraction = (months_in_service - 0.5) / 12
        return building_basis * annual_rate * first_year_fraction
    
    # Years 2-39 - full year
    elif 2 <= year <= 39:
        return building_basis * annual_rate
    
    # Year 40 - remaining basis
    elif year == 40:
        total_prior = (building_basis * annual_rate * 
                      ((12.5 - placed_in_service_month) / 12) + 
                      (building_basis * annual_rate * 38))
        return building_basis - total_prior
    
    else:
        return 0
```

### Function 3: Cost Segregation with Bonus Depreciation

```python
def calculate_cost_segregation_bonus(purchase_price, land_value, 
                                     cost_seg_percentages, bonus_rate):
    """
    Calculate depreciation with cost segregation and bonus
    
    Parameters:
    - purchase_price: Total purchase price
    - land_value: Land allocation
    - cost_seg_percentages: Dict of {recovery_period: percentage}
        Example: {5: 0.15, 7: 0.05, 15: 0.10, 39: 0.70}
    - bonus_rate: Bonus depreciation rate (e.g., 1.00 for 100%)
    
    Returns: Dict with year 1 and ongoing depreciation
    """
    depreciable_basis = purchase_price - land_value
    
    # Asset class allocations
    five_year = depreciable_basis * cost_seg_percentages.get(5, 0)
    seven_year = depreciable_basis * cost_seg_percentages.get(7, 0)
    fifteen_year = depreciable_basis * cost_seg_percentages.get(15, 0)
    real_property = depreciable_basis * cost_seg_percentages.get(39, 0.70)
    
    # Bonus depreciation (on 5, 7, 15-year property)
    bonus_eligible = five_year + seven_year + fifteen_year
    bonus_depreciation = bonus_eligible * bonus_rate
    
    # Remaining basis after bonus
    remaining_five = five_year * (1 - bonus_rate)
    remaining_seven = seven_year * (1 - bonus_rate)
    remaining_fifteen = fifteen_year * (1 - bonus_rate)
    
    # Year 1 regular depreciation (half-year convention)
    year1_five = remaining_five * 0.20  # 5-year, half-year
    year1_seven = remaining_seven * 0.1429  # 7-year, half-year
    year1_fifteen = remaining_fifteen * 0.05  # 15-year, half-year
    year1_real = real_property * 0.02564  # 39-year, mid-month (simplified)
    
    total_year1 = (bonus_depreciation + year1_five + year1_seven + 
                   year1_fifteen + year1_real)
    
    return {
        'bonus_depreciation': bonus_depreciation,
        'year1_total': total_year1,
        'five_year_basis': remaining_five,
        'seven_year_basis': remaining_seven,
        'fifteen_year_basis': remaining_fifteen,
        'real_property_basis': real_property
    }
```

### Function 4: Section 1250 Depreciation Recapture

```python
def calculate_depreciation_recapture(original_basis, accumulated_depreciation,
                                     sale_price, selling_costs):
    """
    Calculate Section 1250 depreciation recapture
    
    Parameters:
    - original_basis: Original cost basis
    - accumulated_depreciation: Total depreciation taken
    - sale_price: Gross sale price
    - selling_costs: Commissions, fees, etc.
    
    Returns: Dict with gain characterization
    """
    adjusted_basis = original_basis - accumulated_depreciation
    net_sale_price = sale_price - selling_costs
    total_gain = net_sale_price - adjusted_basis
    
    # Section 1250 recapture (lesser of gain or accumulated depreciation)
    section_1250_recapture = min(total_gain, accumulated_depreciation)
    
    # Remaining gain is capital gain
    capital_gain = total_gain - section_1250_recapture
    
    # Tax calculation (2026 rates)
    recapture_tax = section_1250_recapture * 0.25  # 25% maximum
    
    # Capital gains rate (0%, 15%, or 20% depending on income)
    # Simplified - assume 15% for this example
    capital_gains_tax = capital_gain * 0.15
    
    return {
        'total_gain': total_gain,
        'section_1250_recapture': section_1250_recapture,
        'capital_gain': capital_gain,
        'recapture_tax': recapture_tax,
        'capital_gains_tax': capital_gains_tax,
        'total_tax': recapture_tax + capital_gains_tax
    }
```

### Function 5: Passive Activity Loss Limitation

```python
def calculate_pal_limitation(rental_loss, magi, filing_status):
    """
    Calculate allowable rental loss under PAL rules
    
    Parameters:
    - rental_loss: Total rental loss
    - magi: Modified Adjusted Gross Income
    - filing_status: 'single', 'mfj', 'mfs'
    
    Returns: Allowable loss and suspended loss
    """
    # Determine threshold based on filing status
    if filing_status == 'mfs':
        threshold = 50000
        phaseout_range = 25000
        max_allowance = 12500
    else:  # single, mfj, hoh
        threshold = 100000
        phaseout_range = 50000
        max_allowance = 25000
    
    # Calculate phase-out
    if magi <= threshold:
        allowable = min(rental_loss, max_allowance)
    elif magi >= threshold + phaseout_range:
        allowable = 0
    else:
        phaseout_pct = (magi - threshold) / phaseout_range
        reduced_allowance = max_allowance * (1 - phaseout_pct)
        allowable = min(rental_loss, reduced_allowance)
    
    suspended = rental_loss - allowable
    
    return {
        'total_loss': rental_loss,
        'allowable_loss': allowable,
        'suspended_loss': suspended,
        'magi': magi,
        'threshold': threshold
    }
```


---

## 10.16 Quick Reference Tables

### Real Estate Depreciation Summary

| Property Type | Recovery Period | Method | Convention | Bonus Eligible? |
|--------------|-----------------|--------|------------|-----------------|
| **Residential Rental** | 27.5 years | Straight-line | Mid-month | No |
| **Commercial Real Estate** | 39 years | Straight-line | Mid-month | No |
| **Land Improvements** | 15 years | 150% DB | Half-year/Mid-quarter | Yes |
| **Qualified Improvement Property** | 15 years | Straight-line | Half-year/Mid-quarter | Yes |
| **5-Year Property** | 5 years | 200% DB | Half-year/Mid-quarter | Yes |
| **7-Year Property** | 7 years | 200% DB | Half-year/Mid-quarter | Yes |

### Cost Segregation Asset Classifications

| Asset Category | Recovery Period | Common Examples |
|---------------|-----------------|-----------------|
| **Personal Property** | 5 years | Carpeting, appliances, signage |
| **Personal Property** | 7 years | Furniture, fixtures, equipment |
| **Land Improvements** | 15 years | Parking lots, landscaping, fencing |
| **Building Systems** | 39 years | HVAC, electrical, plumbing (if structural) |
| **QIP** | 15 years | Interior improvements (non-structural) |

### 2026 Real Estate Tax Limits

| Limit Type | Amount |
|------------|--------|
| **Section 179 Maximum** | $2,560,000 |
| **Section 179 Phase-Out** | $4,090,000 |
| **Bonus Depreciation Rate** | 100% (post-Jan 19, 2025) |
| **PAL Allowance (MFJ)** | $25,000 |
| **PAL Phase-Out Start (MFJ)** | $100,000 MAGI |
| **PAL Phase-Out Complete (MFJ)** | $150,000 MAGI |
| **De Minimis Safe Harbor (no AFS)** | $2,500 per item |
| **De Minimis Safe Harbor (with AFS)** | $5,000 per item |

### Depreciation Recapture Rates (2026)

| Gain Type | Rate | Applies To |
|-----------|------|------------|
| **Unrecaptured Section 1250** | 25% | Depreciation on real property |
| **Long-Term Capital Gain** | 0%, 15%, 20% | Remaining appreciation |
| **Section 1245 Recapture** | Ordinary rates | Personal property depreciation |

### Real Estate Professional Status Requirements

| Requirement | Threshold |
|-------------|-----------|
| **50% Test** | >50% of personal services in real property trades/businesses |
| **750-Hour Test** | >750 hours annually in real property activities |
| **Material Participation** | Any one of 7 tests (500+ hours, substantial participation, etc.) |

### 1031 Exchange Timeline

| Milestone | Deadline |
|-----------|----------|
| **Identify Replacement Property** | 45 days from sale of relinquished property |
| **Close on Replacement Property** | 180 days from sale (or tax return due date) |
| **Qualified Intermediary Required** | Yes - taxpayer cannot touch proceeds |

### ADS vs. GDS Recovery Periods

| Property Type | GDS Period | ADS Period |
|--------------|------------|------------|
| **Residential Rental** | 27.5 years | 30 years |
| **Commercial Real Estate** | 39 years | 40 years |
| **Land Improvements** | 15 years | 20 years |
| **QIP** | 15 years | 20 years |
| **5-Year Property** | 5 years | 5 years |
| **7-Year Property** | 7 years | 7 years |

---

## 10.17 Additional Real Estate Tax Provisions

### Opportunity Zones (OZ 2.0 under OBBBA)

**Key Changes Effective January 1, 2027:**

| Feature | OZ 1.0 (Pre-2027) | OZ 2.0 (Post-2027) |
|---------|-------------------|-------------------|
| **Deferral Period** | Until Dec 31, 2026 | Rolling 5-year deferral |
| **Basis Step-Up (5 years)** | 10% | 10% (30% for rural QOFs) |
| **Exclusion Period** | 10+ years | 10+ years (30-year cap) |
| **Automatic Step-Up** | No | Yes, after 30 years |

### 179D Energy Efficient Commercial Building Deduction

**Note:** Phasing out for projects beginning construction after June 30, 2026.

| Requirement | Amount |
|-------------|--------|
| **Maximum Deduction** | $5.80 per square foot |
| **Energy Savings Required** | 50% |
| **Partial Deduction** | $2.50 - $5.00 per sq ft for individual systems |

### Rehabilitation Tax Credit

| Credit Type | Rate | Requirements |
|-------------|------|--------------|
| **Historic Structures** | 20% | Certified historic structure, income-producing |
| **Pre-1936 Buildings** | 10% | Non-residential, built before 1936 |

---

*End of Real Estate Depreciation & Cost Segregation Section*

---

