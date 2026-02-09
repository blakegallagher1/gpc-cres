"""
Gallagher Property Company - Legal Agent
"""

import os
from functools import partial
from typing import Any, Dict, List, Optional

from agents import Agent, FileSearchTool, Tool
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import LEGAL_PROMPT
from tools.database import db

function_tool = partial(base_function_tool, strict_mode=False)


class AnalyzeZoningInput(BaseModel):
    """Input for zoning analysis"""

    parcel_id: str
    address: Optional[str] = None
    proposed_use: str
    zoning_code: Optional[str] = None


class DraftDocumentInput(BaseModel):
    """Input for document drafting"""

    document_type: str  # psa, lease, jv_agreement, construction_contract
    parties: Dict[str, Any]
    key_terms: Dict[str, Any]
    governing_law: str = "Louisiana"


class ReviewContractInput(BaseModel):
    """Input for contract review"""

    document_text: str
    review_type: str = "initial"  # initial, redline, final
    document_name: Optional[str] = None


class TrackPermitsInput(BaseModel):
    """Input for permit tracking"""

    project_id: str
    parish: str = "East Baton Rouge"


# Louisiana zoning codes reference
LOUISIANA_ZONING_CODES = {
    "A-1": "Agricultural",
    "R-1": "Single Family Residential",
    "R-2": "Two-Family Residential",
    "R-3": "Multi-Family Residential",
    "R-4": "High Density Residential",
    "C-1": "Neighborhood Commercial",
    "C-2": "General Commercial",
    "C-3": "Highway Commercial",
    "M-1": "Light Industrial",
    "M-2": "Heavy Industrial",
    "MX": "Mixed Use",
    "PUD": "Planned Unit Development",
}

# EBR Unified Development Code use permissions (simplified)
EBR_UDC_USES = {
    "mobile_home_park": {
        "permitted": ["R-3", "R-4", "PUD"],
        "conditional": ["A-1"],
        "prohibited": ["R-1", "R-2", "C-1", "C-2", "C-3", "M-1", "M-2"],
    },
    "flex_industrial": {
        "permitted": ["M-1", "PUD"],
        "conditional": ["C-3", "MX"],
        "prohibited": ["A-1", "R-1", "R-2", "R-3", "R-4", "C-1", "C-2"],
    },
    "small_commercial": {
        "permitted": ["C-1", "C-2", "MX", "PUD"],
        "conditional": ["R-3", "R-4"],
        "prohibited": ["A-1", "R-1", "R-2", "M-1", "M-2"],
    },
    "multifamily": {
        "permitted": ["R-3", "R-4", "MX", "PUD"],
        "conditional": ["C-2"],
        "prohibited": ["A-1", "R-1", "R-2", "C-1", "C-3", "M-1", "M-2"],
    },
}


@function_tool
async def analyze_zoning(input_data: AnalyzeZoningInput) -> Dict[str, Any]:
    """
    Analyze zoning compliance for proposed development

    Args:
        input_data: Parcel and proposed use information

    Returns:
        Zoning analysis with compliance status and requirements
    """
    # Get zoning code for parcel
    zoning_code = input_data.zoning_code

    if not zoning_code:
        # Would typically query database or API for parcel zoning
        zoning_code = "Unknown"

    # Check use permissions
    use_config = EBR_UDC_USES.get(input_data.proposed_use.lower(), {})

    permitted = use_config.get("permitted", [])
    conditional = use_config.get("conditional", [])
    prohibited = use_config.get("prohibited", [])

    if zoning_code in permitted:
        compliance_status = "Permitted Use"
        variance_required = False
        variance_types = []
    elif zoning_code in conditional:
        compliance_status = "Conditional Use Permit Required"
        variance_required = True
        variance_types = ["Conditional Use Permit"]
    elif zoning_code in prohibited:
        compliance_status = "Use Prohibited - Variance Required"
        variance_required = True
        variance_types = ["Use Variance"]
    else:
        compliance_status = "Unknown - Further Research Required"
        variance_required = True
        variance_types = ["Zoning Verification"]

    # Get zoning description
    zoning_description = LOUISIANA_ZONING_CODES.get(zoning_code, "Unknown Zoning Code")

    return {
        "parcel_id": input_data.parcel_id,
        "address": input_data.address,
        "zoning_code": zoning_code,
        "zoning_description": zoning_description,
        "proposed_use": input_data.proposed_use,
        "compliance_status": compliance_status,
        "variance_required": variance_required,
        "variance_types": variance_types,
        "permitted_uses": use_config.get("permitted", []),
        "next_steps": _get_zoning_next_steps(variance_required, variance_types),
        "confidence": "high" if zoning_code != "Unknown" else "medium",
    }


def _get_zoning_next_steps(variance_required: bool, variance_types: List[str]) -> List[str]:
    """Generate next steps for zoning compliance"""
    if not variance_required:
        return [
            "Verify zoning with EBR Planning Commission",
            "Review setback and height requirements",
            "Confirm parking requirements",
            "Proceed to site plan submission",
        ]

    steps = ["Schedule pre-application meeting with Planning Commission"]
    for vt in variance_types:
        steps.append(f"Prepare {vt} application")
    steps.extend(
        [
            "Notify adjacent property owners",
            "Prepare site plan and supporting documents",
            "Submit application with required fees",
        ]
    )
    return steps


@function_tool
async def draft_document(input_data: DraftDocumentInput) -> Dict[str, Any]:
    """
    Draft legal document based on template and parameters

    Args:
        input_data: Document type, parties, and key terms

    Returns:
        Draft document text
    """
    document_templates = {
        "psa": _draft_psa,
        "lease": _draft_lease,
        "jv_agreement": _draft_jv_agreement,
        "construction_contract": _draft_construction_contract,
    }

    drafter = document_templates.get(input_data.document_type.lower())
    if not drafter:
        return {
            "error": f"Unknown document type: {input_data.document_type}",
            "supported_types": list(document_templates.keys()),
        }

    document_text = drafter(input_data.parties, input_data.key_terms, input_data.governing_law)

    return {
        "document_type": input_data.document_type,
        "parties": input_data.parties,
        "governing_law": input_data.governing_law,
        "document_text": document_text,
        "disclaimer": (
            "This is a draft document for review only. "
            "Consult with qualified legal counsel before execution."
        ),
        "confidence": "medium",
    }


def _draft_psa(parties: Dict, terms: Dict, governing_law: str) -> str:
    """Draft Purchase and Sale Agreement"""
    return f"""
PURCHASE AND SALE AGREEMENT

THIS PURCHASE AND SALE AGREEMENT (the "Agreement") is entered into as of
{terms.get('effective_date', '[DATE]')}, by and between:

SELLER: {parties.get('seller_name', '[SELLER NAME]')}, a
{parties.get('seller_entity_type', 'Louisiana limited liability company')}

BUYER: {parties.get('buyer_name', '[BUYER NAME]')}, a
{parties.get('buyer_entity_type', 'Louisiana limited liability company')}

PROPERTY: {terms.get('property_address', '[PROPERTY ADDRESS]')}, legally described as
{terms.get('legal_description', '[LEGAL DESCRIPTION]')}

1. PURCHASE PRICE: ${terms.get('purchase_price', '[AMOUNT]')} (the "Purchase Price")
   - Earnest Money Deposit: ${terms.get('earnest_money', '[AMOUNT]')} due within
     {terms.get('deposit_due_days', '3')} business days

2. DUE DILIGENCE PERIOD: {terms.get('due_diligence_days', '30')} days from Effective Date

3. FINANCING CONTINGENCY:
{terms.get('financing_contingency', 'This Agreement is contingent upon Buyer obtaining financing')}

4. CLOSING DATE: {terms.get('closing_date', '[DATE]')} or {terms.get('days_to_close', '45')} days from Effective Date

5. POSSESSION: {terms.get('possession', 'At closing')}

GOVERNING LAW: {governing_law}

[Additional terms and conditions to be added based on specific transaction requirements]
"""


def _draft_lease(parties: Dict, terms: Dict, governing_law: str) -> str:
    """Draft Lease Agreement"""
    return f"""
COMMERCIAL LEASE AGREEMENT

THIS LEASE AGREEMENT is entered into as of {terms.get('lease_date', '[DATE]')},
by and between:

LANDLORD: {parties.get('landlord_name', '[LANDLORD NAME]')}

TENANT: {parties.get('tenant_name', '[TENANT NAME]')}

PREMISES: {terms.get('premises_address', '[ADDRESS]')}, Suite {terms.get('suite', '[NUMBER]')}

1. TERM: {terms.get('lease_term_months', '[MONTHS]')} months
   Commencement Date: {terms.get('commencement_date', '[DATE]')}
   Expiration Date: {terms.get('expiration_date', '[DATE]')}

2. BASE RENT: ${terms.get('base_rent', '[AMOUNT]')} per month

3. ADDITIONAL RENT (NNN): Tenant's proportionate share of Operating Expenses

4. SECURITY DEPOSIT: ${terms.get('security_deposit', '[AMOUNT]')}

5. USE: {terms.get('permitted_use', '[DESCRIBE USE]')}

GOVERNING LAW: {governing_law}
"""


def _draft_jv_agreement(parties: Dict, terms: Dict, governing_law: str) -> str:
    """Draft Joint Venture Agreement"""
    return f"""
JOINT VENTURE AGREEMENT

THIS JOINT VENTURE AGREEMENT is entered into as of {terms.get('effective_date', '[DATE]')},
by and between:

GP (Managing Member): {parties.get('gp_name', '[GP NAME]')}

LP (Investor Member): {parties.get('lp_name', '[LP NAME]')}

PROJECT: {terms.get('project_name', '[PROJECT NAME]')}

1. CAPITAL CONTRIBUTIONS:
   - GP Contribution: ${terms.get('gp_contribution', '[AMOUNT]')} ({terms.get('gp_percentage', '[%]')}%)
   - LP Contribution: ${terms.get('lp_contribution', '[AMOUNT]')} ({terms.get('lp_percentage', '[%]')}%)

2. DISTRIBUTIONS (Waterfall):
   - Tier 1: Return of capital to all members
   - Tier 2: Preferred return of {terms.get('preferred_return', '8%')} to LP
   - Tier 3: {terms.get('promote_structure', '70/30 split (LP/GP) after preferred return')}

3. MANAGEMENT: GP has exclusive authority over day-to-day operations

GOVERNING LAW: {governing_law}
"""


def _draft_construction_contract(parties: Dict, terms: Dict, governing_law: str) -> str:
    """Draft Construction Contract"""
    return f"""
CONSTRUCTION CONTRACT

THIS CONSTRUCTION CONTRACT is entered into as of {terms.get('contract_date', '[DATE]')},
by and between:

OWNER: {parties.get('owner_name', '[OWNER NAME]')}

CONTRACTOR: {parties.get('contractor_name', '[CONTRACTOR NAME]')}

PROJECT: {terms.get('project_name', '[PROJECT NAME]')}

1. CONTRACT PRICE: ${terms.get('contract_price', '[AMOUNT]')}
   Type: {terms.get('contract_type', 'Lump Sum')}

2. SCOPE OF WORK: {terms.get('scope_description', '[DESCRIBE WORK]')}

3. TIME OF COMPLETION: {terms.get('completion_days', '[DAYS]')} calendar days
   Substantial Completion Date: {terms.get('substantial_completion_date', '[DATE]')}

4. PAYMENT SCHEDULE: {terms.get('payment_schedule', 'Monthly progress payments based on % complete')}

5. RETAINAGE: {terms.get('retainage', '10%')} until final completion

GOVERNING LAW: {governing_law}
"""


@function_tool
async def review_contract(input_data: ReviewContractInput) -> Dict[str, Any]:
    """
    Review contract and identify issues/recommendations

    Args:
        input_data: Contract text and review parameters

    Returns:
        Review memo with issues and recommendations
    """
    # This would typically use the file_search tool or AI analysis
    # For now, returning structure for manual review

    return {
        "document_name": input_data.document_name or "Unnamed Document",
        "review_type": input_data.review_type,
        "key_terms_summary": "[To be extracted from document]",
        "issues_identified": [
            {
                "issue_type": "Review Required",
                "description": "Contract requires detailed legal review",
                "severity": "medium",
                "recommendation": "Engage qualified real estate attorney for comprehensive review",
            }
        ],
        "missing_provisions": [
            "Assignment rights",
            "Default remedies",
            "Dispute resolution mechanism",
        ],
        "risk_assessment": "medium",
        "recommendation": "REVISE - Contract requires revisions before execution",
        "confidence": "medium",
    }


@function_tool
async def track_permits(input_data: TrackPermitsInput) -> Dict[str, Any]:
    """
    Get status of all permits for a project

    Args:
        input_data: Project ID and parish

    Returns:
        Permit status summary
    """
    # This would typically query parish permit database
    # For now, returning structure

    return {
        "project_id": input_data.project_id,
        "parish": input_data.parish,
        "permits": [
            {
                "permit_type": "Site Plan Review",
                "status": "pending_submission",
                "notes": "Required for all commercial development",
            },
            {
                "permit_type": "Building Permit",
                "status": "pending_prerequisites",
                "notes": "Requires approved site plan",
            },
            {
                "permit_type": "Utility Connection",
                "status": "pending_application",
                "notes": "Contact Entergy and Baton Rouge Water Company",
            },
        ],
        "next_steps": [
            "Submit site plan to EBR Planning Commission",
            "Schedule pre-application meeting",
            "Prepare traffic impact study if required",
        ],
        "confidence": "medium",
    }


def _get_zoning_config(zoning_code: str) -> Dict[str, Any]:
    """Proxy zoning lookup to the design module for tests and reuse."""
    from gpc_agents.design import _get_zoning_config as design_zoning_config

    return design_zoning_config(zoning_code)


@function_tool
async def save_legal_output(project_id: str, legal_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save legal analysis output to database"""
    output = await db.save_agent_output(
        {
            "project_id": project_id,
            "agent_name": "legal_agent",
            "task_type": legal_data.get("task_type", "legal_analysis"),
            "input_data": legal_data.get("input", {}),
            "output_data": legal_data.get("output", {}),
            "confidence": legal_data.get("confidence", "medium"),
        }
    )
    return output or {"status": "saved"}


vector_store_ids = [
    value.strip()
    for value in os.getenv("OPENAI_VECTOR_STORE_IDS", "").split(",")
    if value.strip()
]

legal_tools: list[Tool] = [
    analyze_zoning,
    draft_document,
    review_contract,
    track_permits,
    save_legal_output,
]

if vector_store_ids:
    legal_tools.append(FileSearchTool(vector_store_ids=vector_store_ids))


# Legal Agent definition
legal_agent = Agent(
    name="Legal Agent",
    model=settings.openai.standard_model,  # gpt-5.1 for legal tasks
    instructions=LEGAL_PROMPT,
    tools=legal_tools,
    handoffs=[],  # Will be configured after all agents defined
)
