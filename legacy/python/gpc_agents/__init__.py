"""
Gallagher Property Company - Agent System Initialization
"""

from agents import handoff

# Import all agents
from gpc_agents.coordinator import (
    coordinator_agent,
    create_task,
    get_project_status,
    route_to_agents,
    update_project_state,
)
from gpc_agents.deal_screener import (
    deal_screener_agent,
    ingest_listing,
    save_screening_output,
    score_listing,
)
from gpc_agents.design import (
    calculate_development_capacity,
    design_agent,
    estimate_construction_cost,
    generate_site_plan,
)
from gpc_agents.due_diligence import (
    create_dd_deal,
    due_diligence_agent,
    flag_dd_red_flags,
    generate_dd_checklist,
    ingest_dd_document,
    save_dd_summary,
)
from gpc_agents.entitlements import (
    analyze_zoning_entitlements,
    create_permit_record,
    entitlements_agent,
    ingest_agenda_item,
    ingest_policy_change,
    save_entitlements_summary,
)
from gpc_agents.finance import (
    build_proforma,
    finance_agent,
    model_waterfall,
    run_sensitivity,
    size_debt,
)
from gpc_agents.legal import (
    analyze_zoning,
    draft_document,
    legal_agent,
    review_contract,
    track_permits,
)
from gpc_agents.marketing import (
    analyze_prospects,
    create_marketing_plan,
    create_offering_memo,
    generate_listing,
    marketing_agent,
)
from gpc_agents.market_intel import (
    generate_market_snapshot,
    ingest_absorption_data,
    ingest_competitor_transaction,
    ingest_economic_indicator,
    ingest_infrastructure_project,
    market_intel_agent,
)
from gpc_agents.operations import (
    create_schedule,
    evaluate_contractor,
    generate_status_report,
    operations_agent,
    track_costs,
)
from gpc_agents.research import (
    analyze_comparables,
    get_market_data,
    research_agent,
    research_parcel,
    search_parcels,
)
from gpc_agents.risk import (
    analyze_flood_risk,
    assess_market_risk,
    comprehensive_risk_assessment,
    estimate_insurance,
    evaluate_environmental,
    risk_agent,
)
from gpc_agents.tax_strategist import (
    lookup_irc_reference,
    search_tax_updates,
    tax_strategist_agent,
)


def configure_agent_handoffs():
    """
    Configure handoff relationships between agents.
    This must be called after all agents are imported.
    """

    # Coordinator handoffs - can delegate to all specialist agents
    coordinator_agent.handoffs = [
        handoff(
            research_agent,
            tool_description_override=(
                "Delegate to Research Agent for market research, parcel research, and comparable analysis"
            ),
        ),
        handoff(
            finance_agent,
            tool_description_override="Delegate to Finance Agent for underwriting, pro formas, and financial analysis",
        ),
        handoff(
            legal_agent,
            tool_description_override="Delegate to Legal Agent for zoning, contracts, and permit tracking",
        ),
        handoff(
            design_agent,
            tool_description_override="Delegate to Design Agent for site planning and development capacity",
        ),
        handoff(
            operations_agent,
            tool_description_override="Delegate to Operations Agent for scheduling and project management",
        ),
        handoff(
            marketing_agent,
            tool_description_override="Delegate to Marketing Agent for marketing strategy and leasing",
        ),
        handoff(
            risk_agent,
            tool_description_override="Delegate to Risk Agent for risk assessment and insurance",
        ),
        handoff(
            deal_screener_agent,
            tool_description_override="Delegate to Deal Screener for initial go/no-go scoring",
        ),
        handoff(
            due_diligence_agent,
            tool_description_override="Delegate to Due Diligence for checklist, documents, and red flags",
        ),
        handoff(
            entitlements_agent,
            tool_description_override="Delegate to Entitlements for zoning analysis and permit tracking",
        ),
        handoff(
            market_intel_agent,
            tool_description_override="Delegate to Market Intelligence for competitor and market data",
        ),
        handoff(
            tax_strategist_agent,
            tool_description_override="Delegate to Tax Strategist for IRC guidance and IRS update research",
        ),
    ]

    # Research Agent handoffs
    research_agent.handoffs = [
        handoff(
            risk_agent,
            tool_description_override="Hand off to Risk Agent for environmental or flood zone concerns",
        ),
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for pricing or financial analysis",
        ),
    ]

    # Finance Agent handoffs
    finance_agent.handoffs = [
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for entity structure or legal review",
        ),
        handoff(
            risk_agent,
            tool_description_override="Hand off to Risk Agent for market or financial risk assessment",
        ),
        handoff(
            tax_strategist_agent,
            tool_description_override="Hand off to Tax Strategist for IRC guidance and tax implications",
        ),
    ]

    # Deal Screener handoffs
    deal_screener_agent.handoffs = [
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for underwriting validation",
        ),
        handoff(
            research_agent,
            tool_description_override="Hand off to Research Agent for market or parcel research",
        ),
    ]

    # Due Diligence handoffs
    due_diligence_agent.handoffs = [
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for document or compliance review",
        ),
        handoff(
            research_agent,
            tool_description_override="Hand off to Research Agent for gaps or verification",
        ),
    ]

    # Entitlements handoffs
    entitlements_agent.handoffs = [
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for zoning interpretation",
        ),
    ]

    # Market Intelligence handoffs
    market_intel_agent.handoffs = [
        handoff(
            research_agent,
            tool_description_override="Hand off to Research Agent for deeper market research",
        ),
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for pricing implications",
        ),
    ]

    # Legal Agent handoffs
    legal_agent.handoffs = [
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for financial terms or structure questions",
        ),
        handoff(
            research_agent,
            tool_description_override="Hand off to Research Agent for title or ownership research",
        ),
        handoff(
            tax_strategist_agent,
            tool_description_override="Hand off to Tax Strategist for IRC guidance and tax structuring",
        ),
    ]

    # Design Agent handoffs
    design_agent.handoffs = [
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for zoning or code interpretation",
        ),
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for cost or budget validation",
        ),
    ]

    # Operations Agent handoffs
    operations_agent.handoffs = [
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for budget or payment issues",
        ),
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for contract or dispute issues",
        ),
        handoff(
            risk_agent,
            tool_description_override="Hand off to Risk Agent for safety or delay risk assessment",
        ),
    ]

    # Marketing Agent handoffs
    marketing_agent.handoffs = [
        handoff(
            research_agent,
            tool_description_override="Hand off to Research Agent for market research or comp analysis",
        ),
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for pricing or financial analysis",
        ),
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for lease or sale document review",
        ),
    ]

    # Risk Agent handoffs
    risk_agent.handoffs = [
        handoff(
            research_agent,
            tool_description_override="Hand off to Research Agent for additional research needed",
        ),
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for regulatory or legal risk clarification",
        ),
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for financial risk modeling",
        ),
    ]

    # Tax Strategist handoffs
    tax_strategist_agent.handoffs = [
        handoff(
            finance_agent,
            tool_description_override="Hand off to Finance Agent for underwriting or modeling context",
        ),
        handoff(
            legal_agent,
            tool_description_override="Hand off to Legal Agent for structuring or compliance considerations",
        ),
    ]


# Configure handoffs on module import
configure_agent_handoffs()

# Export all agents
__all__ = [
    # Coordinator
    "coordinator_agent",
    "get_project_status",
    "update_project_state",
    "create_task",
    "route_to_agents",
    # Deal Screener
    "deal_screener_agent",
    "ingest_listing",
    "score_listing",
    "save_screening_output",
    # Due Diligence
    "due_diligence_agent",
    "create_dd_deal",
    "ingest_dd_document",
    "generate_dd_checklist",
    "flag_dd_red_flags",
    "save_dd_summary",
    # Entitlements
    "entitlements_agent",
    "create_permit_record",
    "analyze_zoning_entitlements",
    "ingest_agenda_item",
    "ingest_policy_change",
    "save_entitlements_summary",
    # Market Intelligence
    "market_intel_agent",
    "ingest_competitor_transaction",
    "ingest_economic_indicator",
    "ingest_infrastructure_project",
    "ingest_absorption_data",
    "generate_market_snapshot",
    # Research
    "research_agent",
    "search_parcels",
    "get_market_data",
    "analyze_comparables",
    "research_parcel",
    # Finance
    "finance_agent",
    "build_proforma",
    "model_waterfall",
    "size_debt",
    "run_sensitivity",
    # Legal
    "legal_agent",
    "analyze_zoning",
    "draft_document",
    "review_contract",
    "track_permits",
    # Design
    "design_agent",
    "calculate_development_capacity",
    "generate_site_plan",
    "estimate_construction_cost",
    # Operations
    "operations_agent",
    "create_schedule",
    "track_costs",
    "evaluate_contractor",
    "generate_status_report",
    # Marketing
    "marketing_agent",
    "create_marketing_plan",
    "generate_listing",
    "analyze_prospects",
    "create_offering_memo",
    # Risk
    "risk_agent",
    "analyze_flood_risk",
    "assess_market_risk",
    "evaluate_environmental",
    "estimate_insurance",
    "comprehensive_risk_assessment",
    # Tax Strategist
    "tax_strategist_agent",
    "lookup_irc_reference",
    "search_tax_updates",
]
