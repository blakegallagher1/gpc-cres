"""
Gallagher Property Company - Data Models and Schemas
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ProjectStatus(str, Enum):
    """Project lifecycle statuses"""

    PROSPECTING = "prospecting"
    UNDER_CONTRACT = "under_contract"
    DUE_DILIGENCE = "due_diligence"
    ENTITLEMENTS = "entitlements"
    CONSTRUCTION = "construction"
    LEASE_UP = "lease_up"
    STABILIZED = "stabilized"
    DISPOSITION = "disposition"
    CLOSED = "closed"
    DEAD = "dead"


class PropertyType(str, Enum):
    """Property types"""

    MOBILE_HOME_PARK = "mobile_home_park"
    FLEX_INDUSTRIAL = "flex_industrial"
    SMALL_COMMERCIAL = "small_commercial"
    MULTIFAMILY = "multifamily"
    RETAIL = "retail"
    OFFICE = "office"
    WAREHOUSE = "warehouse"
    MIXED_USE = "mixed_use"


class ConfidenceLevel(str, Enum):
    """Confidence levels for estimates"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RiskLevel(str, Enum):
    """Risk assessment levels"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Recommendation(str, Enum):
    """Go/no-go recommendations"""

    PROCEED = "proceed"
    CONDITIONAL = "conditional"
    PASS = "pass"
    FURTHER_ANALYSIS = "further_analysis"


# ============================================
# Project Models
# ============================================


class Project(BaseModel):
    """Core project entity"""

    id: Optional[str] = None
    name: str
    address: Optional[str] = None
    parcel_id: Optional[str] = None
    property_type: Optional[PropertyType] = None
    status: ProjectStatus = ProjectStatus.PROSPECTING
    acres: Optional[float] = None
    square_feet: Optional[float] = None
    asking_price: Optional[Decimal] = None
    target_irr: Optional[float] = Field(default=0.20, description="Target IRR as decimal")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentOutput(BaseModel):
    """Agent analysis output"""

    id: Optional[str] = None
    project_id: str
    agent_name: str
    task_type: str
    input_data: Dict[str, Any] = Field(default_factory=dict)
    output_data: Dict[str, Any] = Field(default_factory=dict)
    confidence: Optional[ConfidenceLevel] = None
    sources: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None


class Task(BaseModel):
    """Task entity"""

    id: Optional[str] = None
    project_id: str
    title: str
    description: Optional[str] = None
    assigned_agent: Optional[str] = None
    status: str = "pending"
    due_date: Optional[date] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class Document(BaseModel):
    """Document entity"""

    id: Optional[str] = None
    project_id: str
    document_type: str
    file_path: str
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


# ============================================
# Research Agent Models
# ============================================


class ParcelAttributes(BaseModel):
    """Parcel physical and legal attributes"""

    parcel_id: str
    address: str
    acres: float
    square_feet: float
    zoning_code: str
    zoning_description: str
    current_use: Optional[str] = None
    owner_name: Optional[str] = None
    owner_since: Optional[int] = None
    tax_assessment: Optional[Decimal] = None
    flood_zone: Optional[str] = None
    utilities_available: List[str] = Field(default_factory=list)


class MarketMetrics(BaseModel):
    """Submarket performance metrics"""

    submarket: str
    property_type: str
    vacancy_rate: Optional[float] = None
    absorption_rate: Optional[float] = None
    avg_rent_per_sf: Optional[Decimal] = None
    avg_rent_per_unit: Optional[Decimal] = None
    rent_growth_yoy: Optional[float] = None
    cap_rate_range_low: Optional[float] = None
    cap_rate_range_high: Optional[float] = None
    data_date: Optional[date] = None


class ComparableProperty(BaseModel):
    """Comparable sale or lease"""

    property_id: str
    address: str
    property_type: str
    sale_date: Optional[date] = None
    sale_price: Optional[Decimal] = None
    square_feet: Optional[float] = None
    units: Optional[int] = None
    price_per_sf: Optional[Decimal] = None
    price_per_unit: Optional[Decimal] = None
    cap_rate: Optional[float] = None
    distance_miles: Optional[float] = None
    notes: Optional[str] = None


class ResearchReport(BaseModel):
    """Research agent output"""

    parcel: ParcelAttributes
    market_context: MarketMetrics
    comparables: List[ComparableProperty] = Field(default_factory=list)
    development_potential: Dict[str, Any] = Field(default_factory=dict)
    recommendation: Recommendation
    confidence: ConfidenceLevel
    data_sources: List[str] = Field(default_factory=list)
    data_gaps: List[str] = Field(default_factory=list)


# ============================================
# Finance Agent Models
# ============================================


class ProFormaAssumptions(BaseModel):
    """Financial modeling assumptions"""

    hold_period_years: int = 5
    exit_cap_rate: float = Field(..., description="Exit cap rate as decimal")
    rent_growth_annual: float = Field(..., description="Annual rent growth as decimal")
    expense_growth_annual: float = Field(..., description="Annual expense growth as decimal")
    vacancy_rate: float = Field(..., description="Vacancy rate as decimal")
    collection_loss: float = Field(default=0.01, description="Collection loss as decimal")
    capex_reserve_annual: Optional[Decimal] = None


class CapitalStructure(BaseModel):
    """Capital stack configuration"""

    total_cost: Decimal
    senior_debt: Decimal
    senior_debt_rate: float
    senior_debt_term: int
    mezz_debt: Optional[Decimal] = None
    mezz_debt_rate: Optional[float] = None
    preferred_equity: Optional[Decimal] = None
    preferred_return: Optional[float] = None
    common_equity: Decimal


class ReturnsSummary(BaseModel):
    """Investment returns summary"""

    unlevered_irr: float
    unlevered_equity_multiple: float
    levered_irr: float
    levered_equity_multiple: float
    avg_cash_on_cash: float
    peak_equity: Decimal
    payback_period_months: int


class ScenarioAnalysis(BaseModel):
    """Base/downside/upside scenarios"""

    scenario_name: str
    exit_cap_rate: float
    rent_growth: float
    construction_costs: Decimal
    returns: ReturnsSummary


class WaterfallTier(BaseModel):
    """Waterfall distribution tier"""

    tier_name: str
    hurdle_rate: Optional[float] = None
    gp_share: float
    lp_share: float


class FinancialAnalysis(BaseModel):
    """Complete financial analysis output"""

    project_name: str
    total_project_cost: Decimal
    capital_structure: CapitalStructure
    base_case: ReturnsSummary
    scenarios: List[ScenarioAnalysis] = Field(default_factory=list)
    waterfall: List[WaterfallTier] = Field(default_factory=list)
    monthly_cash_flows: List[Dict[str, Any]] = Field(default_factory=list)
    key_risks: List[str] = Field(default_factory=list)
    mitigants: List[str] = Field(default_factory=list)
    recommendation: Recommendation


# ============================================
# Legal Agent Models
# ============================================


class ZoningAnalysis(BaseModel):
    """Zoning compliance analysis"""

    zoning_code: str
    zoning_description: str
    permitted_uses: List[str] = Field(default_factory=list)
    prohibited_uses: List[str] = Field(default_factory=list)
    max_density: Optional[str] = None
    max_height: Optional[str] = None
    setback_front: Optional[str] = None
    setback_rear: Optional[str] = None
    setback_side: Optional[str] = None
    parking_requirements: Optional[str] = None
    compliance_status: str
    variance_required: bool = False
    variance_types: List[str] = Field(default_factory=list)


class ContractIssue(BaseModel):
    """Contract review issue"""

    issue_type: str
    description: str
    severity: str
    recommendation: str


class ContractReview(BaseModel):
    """Contract review output"""

    document_name: str
    document_type: str
    parties: List[str] = Field(default_factory=list)
    key_terms: Dict[str, Any] = Field(default_factory=dict)
    issues: List[ContractIssue] = Field(default_factory=list)
    missing_provisions: List[str] = Field(default_factory=list)
    risk_assessment: RiskLevel
    recommendation: str


class PermitStatus(BaseModel):
    """Permit application status"""

    permit_type: str
    permit_number: Optional[str] = None
    status: str
    applied_date: Optional[date] = None
    approved_date: Optional[date] = None
    estimated_completion: Optional[date] = None
    notes: Optional[str] = None


# ============================================
# Design Agent Models
# ============================================


class DevelopmentProgram(BaseModel):
    """Development program by use type"""

    use_type: str
    units_or_sf: float
    parking_spaces: int
    efficiency_ratio: Optional[float] = None
    notes: Optional[str] = None


class SiteMetrics(BaseModel):
    """Site planning metrics"""

    total_acres: float
    total_sf: float
    building_coverage_percent: float
    floor_area_ratio: float
    open_space_percent: float
    parking_ratio_per_1000sf: Optional[float] = None
    parking_ratio_per_unit: Optional[float] = None


class ConstructionCostEstimate(BaseModel):
    """Construction cost breakdown"""

    category: str
    cost_per_sf: Decimal
    total_cost: Decimal
    notes: Optional[str] = None


class SitePlanAnalysis(BaseModel):
    """Design agent output"""

    project_name: str
    site_area_acres: float
    zoning_code: str
    development_program: List[DevelopmentProgram] = Field(default_factory=list)
    site_metrics: SiteMetrics
    cost_estimates: List[ConstructionCostEstimate] = Field(default_factory=list)
    design_considerations: List[str] = Field(default_factory=list)
    total_estimated_cost: Decimal


# ============================================
# Operations Agent Models
# ============================================


class ScheduleMilestone(BaseModel):
    """Project schedule milestone"""

    milestone_name: str
    original_date: date
    current_date: date
    actual_date: Optional[date] = None
    status: str
    variance_days: int


class BudgetCategory(BaseModel):
    """Budget tracking by category"""

    category: str
    budget: Decimal
    committed: Decimal
    spent: Decimal
    variance: Decimal
    percent_complete: float


class ProjectStatusReport(BaseModel):
    """Operations agent output"""

    project_name: str
    report_date: date
    report_period_start: date
    report_period_end: date

    # Schedule
    original_completion: date
    current_projected: date
    schedule_variance_days: int
    schedule_status: str
    milestones: List[ScheduleMilestone] = Field(default_factory=list)

    # Budget
    budget_categories: List[BudgetCategory] = Field(default_factory=list)
    total_budget: Decimal
    total_committed: Decimal
    total_spent: Decimal
    total_variance: Decimal

    # Issues
    key_issues: List[Dict[str, str]] = Field(default_factory=list)
    next_period_milestones: List[Dict[str, Any]] = Field(default_factory=list)


# ============================================
# Marketing Agent Models
# ============================================


class MarketingChannel(BaseModel):
    """Marketing channel configuration"""

    channel_name: str
    budget: Decimal
    timeline: str
    kpis: List[str] = Field(default_factory=list)


class MarketingPlan(BaseModel):
    """Marketing agent output"""

    property_name: str
    campaign_type: str
    target_launch_date: date

    # Market analysis
    target_market: str
    competition_summary: str
    pricing_strategy: str

    # Marketing mix
    channels: List[MarketingChannel] = Field(default_factory=list)
    total_budget: Decimal

    # Creative requirements
    creative_deliverables: List[Dict[str, Any]] = Field(default_factory=list)

    # Success metrics
    target_leads_monthly: int
    target_tours_monthly: int
    target_conversion_rate: float
    target_time_to_lease_months: int


class OfferingMemo(BaseModel):
    """Investment offering memorandum"""

    property_name: str
    property_type: str
    address: str
    key_highlights: List[str] = Field(default_factory=list)
    property_description: str
    location_highlights: str
    financial_summary: Dict[str, Any] = Field(default_factory=dict)
    investment_thesis: List[str] = Field(default_factory=list)
    risk_factors: List[str] = Field(default_factory=list)
    photos: List[str] = Field(default_factory=list)


# ============================================
# Risk Agent Models
# ============================================


class RiskCategory(BaseModel):
    """Risk assessment by category"""

    category: str
    risk_level: RiskLevel
    probability: str
    impact: str
    key_concerns: str
    mitigation_actions: str


class InsuranceRequirement(BaseModel):
    """Insurance coverage requirement"""

    coverage_type: str
    recommended_limit: Decimal
    estimated_premium: Optional[Decimal] = None
    deductible: Optional[Decimal] = None
    notes: Optional[str] = None


class FloodRiskAnalysis(BaseModel):
    """FEMA flood zone analysis"""

    address: str
    fema_flood_zone: str
    zone_description: str
    base_flood_elevation: Optional[float] = None
    property_elevation: Optional[float] = None
    elevation_difference: Optional[float] = None
    flood_insurance_required: bool
    estimated_premium: Optional[Decimal] = None
    special_flood_hazard_area: bool


class RiskAssessmentReport(BaseModel):
    """Risk agent output"""

    project_name: str
    assessment_date: date
    overall_risk_level: RiskLevel

    # Risk categories
    risks: List[RiskCategory] = Field(default_factory=list)

    # Critical risks
    critical_risks: List[Dict[str, str]] = Field(default_factory=list)

    # Insurance
    insurance_requirements: List[InsuranceRequirement] = Field(default_factory=list)

    # Recommendation
    recommendation: Recommendation
    conditions: List[str] = Field(default_factory=list)


# ============================================
# Coordinator Models
# ============================================


class AgentRoutingDecision(BaseModel):
    """Agent routing decision"""

    primary_agent: str
    supporting_agents: List[str] = Field(default_factory=list)
    reasoning: str


class WorkflowStep(BaseModel):
    """Workflow execution step"""

    step_number: int
    agent_name: str
    task_description: str
    dependencies: List[int] = Field(default_factory=list)
    expected_output: str


class WorkflowPlan(BaseModel):
    """Coordinator workflow plan"""

    task_understanding: str
    execution_plan: List[WorkflowStep] = Field(default_factory=list)
    parallel_groups: List[List[int]] = Field(default_factory=list)


class CoordinatorOutput(BaseModel):
    """Coordinator agent final output"""

    task_understanding: str
    execution_plan: str
    agent_outputs: Dict[str, Any] = Field(default_factory=dict)
    synthesis: str
    next_steps: List[Dict[str, Any]] = Field(default_factory=list)
    final_recommendation: Recommendation
    confidence: ConfidenceLevel
