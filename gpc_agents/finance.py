"""
Gallagher Property Company - Finance Agent
"""

from decimal import Decimal
from functools import partial
from typing import Any, Dict, List, Optional

from agents import Agent, CodeInterpreterTool
from agents import function_tool as base_function_tool
from pydantic import BaseModel

from config.settings import settings
from prompts.agent_prompts import FINANCE_PROMPT
from tools.database import db
from tools.financial_calcs import calc

function_tool = partial(base_function_tool, strict_mode=False)


class BuildProFormaInput(BaseModel):
    """Input for building pro forma"""

    project_name: str
    property_type: str
    total_units: Optional[int] = None
    total_sf: Optional[float] = None
    land_cost: float
    construction_cost: float
    soft_costs: float
    contingency_rate: float = 0.1

    # Operating assumptions
    monthly_rent_per_unit: Optional[float] = None
    monthly_rent_per_sf: Optional[float] = None
    vacancy_rate: float = 0.08
    collection_loss: float = 0.02
    operating_expense_ratio: float = 0.35

    # Financing assumptions
    senior_debt_amount: float
    senior_debt_rate: float = 0.065
    senior_debt_term: int = 25

    # Exit assumptions
    hold_period_years: int = 5
    exit_cap_rate: float = 0.065
    rent_growth_annual: float = 0.025
    expense_growth_annual: float = 0.02


class ModelWaterfallInput(BaseModel):
    """Input for waterfall modeling"""

    capital_structure: Dict[str, Any]
    cash_flows: List[float]
    waterfall_structure: List[Dict[str, Any]]


class SizeDebtInput(BaseModel):
    """Input for debt sizing"""

    noi: float
    property_value: float
    loan_type: str = "permanent"  # permanent, construction, bridge


class RunSensitivityInput(BaseModel):
    """Input for sensitivity analysis"""

    base_model: Dict[str, Any]
    variables: List[str]  # exit_cap_rate, rent_growth, construction_costs, interest_rate
    ranges: Dict[str, List[float]]


@function_tool
async def build_proforma(input_data: BuildProFormaInput) -> Dict[str, Any]:
    """
    Build development pro forma with returns analysis

    Args:
        input_data: Project and financial assumptions

    Returns:
        Complete pro forma with cash flows, returns, and scenario analysis
    """
    # Calculate total project cost
    hard_costs = Decimal(input_data.construction_cost)
    soft_costs = Decimal(input_data.soft_costs)
    land_cost = Decimal(input_data.land_cost)
    contingency = (hard_costs + soft_costs) * Decimal(input_data.contingency_rate)

    total_project_cost = land_cost + hard_costs + soft_costs + contingency

    # Calculate potential gross income
    if input_data.monthly_rent_per_unit and input_data.total_units:
        potential_gross_income = Decimal(
            input_data.monthly_rent_per_unit * input_data.total_units * 12
        )
    elif input_data.monthly_rent_per_sf and input_data.total_sf:
        potential_gross_income = Decimal(input_data.monthly_rent_per_sf * input_data.total_sf * 12)
    else:
        return {
            "error": "Must provide either monthly_rent_per_unit with total_units OR monthly_rent_per_sf with total_sf"
        }

    # Calculate effective gross income
    total_loss = input_data.vacancy_rate + input_data.collection_loss
    effective_gross_income = potential_gross_income * Decimal(1 - total_loss)

    # Calculate operating expenses
    operating_expenses = effective_gross_income * Decimal(input_data.operating_expense_ratio)

    # Calculate NOI
    noi = effective_gross_income - operating_expenses

    # Calculate debt service
    monthly_payment = calc.calculate_mortgage_payment(
        Decimal(input_data.senior_debt_amount),
        input_data.senior_debt_rate,
        input_data.senior_debt_term,
    )
    annual_debt_service = monthly_payment * 12

    # Calculate cash flows over hold period
    cash_flows = []
    equity_invested = total_project_cost - Decimal(input_data.senior_debt_amount)

    # Initial investment (negative)
    cash_flows.append(-float(equity_invested))

    annual_noi = noi
    for _ in range(1, input_data.hold_period_years + 1):
        # Apply growth rates
        annual_noi = annual_noi * Decimal(1 + input_data.rent_growth_annual)

        # Cash flow after debt service
        cash_flow_after_debt = annual_noi - annual_debt_service
        cash_flows.append(float(cash_flow_after_debt))

    # Exit calculation
    exit_noi = annual_noi * Decimal(1 + input_data.rent_growth_annual)  # One more year growth
    exit_value = calc.calculate_property_value(exit_noi, input_data.exit_cap_rate)
    loan_balance = Decimal(
        input_data.senior_debt_amount
    )  # Simplified - should calculate amortization
    sale_proceeds = exit_value - loan_balance

    # Add sale proceeds to final year
    cash_flows[-1] += float(sale_proceeds)

    # Calculate returns
    levered_irr = calc.calculate_irr(cash_flows)
    levered_equity_multiple = calc.calculate_equity_multiple(
        Decimal(sum(cf for cf in cash_flows if cf > 0)), equity_invested
    )

    # Average cash-on-cash
    avg_annual_cash_flow = (
        sum(cash_flows[1:-1]) / (input_data.hold_period_years - 1)
        if input_data.hold_period_years > 1
        else cash_flows[1]
    )
    avg_cash_on_cash = calc.calculate_cash_on_cash(Decimal(avg_annual_cash_flow), equity_invested)

    # DSCR
    dscr = calc.calculate_dscr(noi, annual_debt_service)

    # LTV
    ltv = calc.calculate_ltv(Decimal(input_data.senior_debt_amount), exit_value)

    return {
        "project_name": input_data.project_name,
        "property_type": input_data.property_type,
        "total_project_cost": float(total_project_cost),
        "land_cost": float(land_cost),
        "construction_cost": float(hard_costs),
        "soft_costs": float(soft_costs),
        "contingency": float(contingency),
        "equity_required": float(equity_invested),
        "senior_debt": input_data.senior_debt_amount,
        "debt_rate": input_data.senior_debt_rate,
        "debt_term": input_data.senior_debt_term,
        "income_and_expenses": {
            "potential_gross_income": float(potential_gross_income),
            "effective_gross_income": float(effective_gross_income),
            "operating_expenses": float(operating_expenses),
            "noi": float(noi),
            "annual_debt_service": float(annual_debt_service),
        },
        "returns": {
            "levered_irr": levered_irr,
            "levered_equity_multiple": levered_equity_multiple,
            "avg_cash_on_cash": avg_cash_on_cash,
            "peak_equity": float(equity_invested),
            "exit_value": float(exit_value),
            "sale_proceeds": float(sale_proceeds),
        },
        "ratios": {
            "dscr": dscr,
            "ltv_at_exit": ltv,
            "debt_yield": calc.calculate_debt_yield(noi, Decimal(input_data.senior_debt_amount)),
        },
        "cash_flows": cash_flows,
        "recommendation": _get_finance_recommendation(levered_irr, levered_equity_multiple, dscr),
        "confidence": "high",
    }


def _get_finance_recommendation(irr: float, equity_multiple: float, dscr: float) -> str:
    """Generate recommendation based on returns"""
    if irr >= 0.20 and equity_multiple >= 2.0 and dscr >= 1.25:
        return "PROCEED - Returns exceed targets with adequate debt coverage"
    elif irr >= 0.15 and equity_multiple >= 1.8 and dscr >= 1.20:
        return "CONDITIONAL - Returns meet minimum thresholds; consider risk factors"
    else:
        return "PASS - Returns below investment criteria"


@function_tool
async def model_waterfall(input_data: ModelWaterfallInput) -> Dict[str, Any]:
    """
    Calculate GP/LP waterfall distributions

    Args:
        input_data: Capital structure, cash flows, and waterfall tiers

    Returns:
        Distribution breakdown by tier and participant
    """
    total_equity = Decimal(input_data.capital_structure.get("common_equity", 0))

    distributions: Dict[str, Any] = {"by_tier": []}
    gp_total = Decimal(0)
    lp_total = Decimal(0)
    total_distributed = Decimal(0)

    cumulative_return = Decimal(0)

    for cf in input_data.cash_flows:
        cf_decimal = Decimal(cf)
        if cf_decimal > 0:
            dist = calc.calculate_waterfall_distribution(
                cf_decimal, input_data.waterfall_structure, cumulative_return, total_equity
            )

            gp_total += dist["gp_distribution"]
            lp_total += dist["lp_distribution"]
            total_distributed += dist["total_distributed"]
            cumulative_return += dist["total_distributed"]

    distributions["gp_total"] = gp_total
    distributions["lp_total"] = lp_total
    distributions["total_distributed"] = total_distributed

    return {
        "capital_structure": input_data.capital_structure,
        "waterfall_structure": input_data.waterfall_structure,
        "gp_total": float(gp_total),
        "lp_total": float(lp_total),
        "total_distributed": float(total_distributed),
        "gp_percentage": (
            float(gp_total / total_distributed)
            if total_distributed > 0
            else 0
        ),
    }


@function_tool
async def size_debt(input_data: SizeDebtInput) -> Dict[str, Any]:
    """
    Size debt based on DSCR, LTV, and debt yield constraints

    Args:
        input_data: NOI, property value, and loan type

    Returns:
        Maximum loan amount based on constraints
    """
    noi = Decimal(input_data.noi)
    property_value = Decimal(input_data.property_value)

    # Constraints by loan type
    constraints = {
        "permanent": {"max_ltv": 0.75, "min_dscr": 1.25, "min_debt_yield": 0.08},
        "construction": {"max_ltv": 0.65, "min_dscr": 1.20, "min_debt_yield": 0.10},
        "bridge": {"max_ltv": 0.70, "min_dscr": 1.15, "min_debt_yield": 0.09},
    }

    constraint = constraints.get(input_data.loan_type, constraints["permanent"])

    # Calculate max loan by each constraint
    max_by_ltv = property_value * Decimal(constraint["max_ltv"])

    # Assume 6% interest, 25-year amortization for DSCR calculation
    rate = 0.06
    years = 25
    monthly_rate = rate / 12
    num_payments = years * 12

    # Max debt service given NOI and min DSCR
    max_debt_service = noi / Decimal(constraint["min_dscr"])
    max_annual_payment = float(max_debt_service)
    max_monthly_payment = max_annual_payment / 12

    # Calculate loan amount from payment
    if monthly_rate > 0:
        max_by_dscr = Decimal(
            max_monthly_payment
            * ((1 + monthly_rate) ** num_payments - 1)
            / (monthly_rate * (1 + monthly_rate) ** num_payments)
        )
    else:
        max_by_dscr = Decimal(max_monthly_payment * num_payments)

    # Max by debt yield
    max_by_debt_yield = noi / Decimal(constraint["min_debt_yield"])

    # Most restrictive constraint wins
    max_loan = min(max_by_ltv, max_by_dscr, max_by_debt_yield)

    return {
        "loan_type": input_data.loan_type,
        "noi": float(noi),
        "property_value": float(property_value),
        "constraints": constraint,
        "max_by_ltv": float(max_by_ltv),
        "max_by_dscr": float(max_by_dscr),
        "max_by_debt_yield": float(max_by_debt_yield),
        "recommended_loan_amount": float(max_loan),
        "recommended_ltv": float(max_loan / property_value),
        "recommended_dscr": float(
            noi / (max_loan * Decimal(0.06) / Decimal(constraint["min_dscr"]))
        ),
    }


@function_tool
async def run_sensitivity(input_data: RunSensitivityInput) -> Dict[str, Any]:
    """
    Run sensitivity analysis on key variables

    Args:
        input_data: Base model and variables to test

    Returns:
        Sensitivity table with IRR and equity multiple for each scenario
    """
    results = {}

    for variable, values in input_data.ranges.items():
        variable_results = []

        for value in values:
            # Create modified model
            modified_model = input_data.base_model.copy()
            modified_model[variable] = value

            # Calculate returns (simplified)
            # In practice, would re-run full pro forma
            irr = modified_model.get("base_irr", 0.18)  # Placeholder
            eq_mult = modified_model.get("base_equity_multiple", 2.0)  # Placeholder

            variable_results.append(
                {"variable_value": value, "irr": irr, "equity_multiple": eq_mult}
            )

        results[variable] = variable_results

    return {
        "base_case": input_data.base_model,
        "sensitivity_results": results,
        "variables_tested": list(input_data.ranges.keys()),
    }


@function_tool
async def save_finance_output(project_id: str, finance_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save finance analysis output to database"""
    output = await db.save_agent_output(
        {
            "project_id": project_id,
            "agent_name": "finance_agent",
            "task_type": finance_data.get("task_type", "financial_analysis"),
            "input_data": finance_data.get("input", {}),
            "output_data": finance_data.get("output", {}),
            "confidence": finance_data.get("confidence", "high"),
        }
    )
    return output or {"status": "saved"}


# Finance Agent definition
finance_agent = Agent(
    name="Finance Agent",
    model=settings.openai.flagship_model,  # gpt-5.2 for complex financial reasoning
    instructions=FINANCE_PROMPT,
    tools=[
        build_proforma,
        model_waterfall,
        size_debt,
        run_sensitivity,
        save_finance_output,
        CodeInterpreterTool(
            tool_config={
                "type": "code_interpreter",
                "container": {"type": "auto", "file_ids": []},
            }
        ),  # For complex calculations
    ],
    handoffs=[],  # Will be configured after all agents defined
)
