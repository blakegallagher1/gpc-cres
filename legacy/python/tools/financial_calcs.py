"""
Gallagher Property Company - Financial Calculation Utilities
"""

from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Tuple


def _npv(rate: float, cash_flows: List[float]) -> float:
    return sum(cf / ((1 + rate) ** idx) for idx, cf in enumerate(cash_flows))


def _irr(cash_flows: List[float]) -> float:
    if not cash_flows:
        return 0.0
    has_positive = any(cf > 0 for cf in cash_flows)
    has_negative = any(cf < 0 for cf in cash_flows)
    if not (has_positive and has_negative):
        return 0.0

    low = -0.9999
    high = 10.0
    npv_low = _npv(low, cash_flows)
    npv_high = _npv(high, cash_flows)
    if npv_low == 0:
        return low
    if npv_high == 0:
        return high
    if npv_low * npv_high > 0:
        return 0.0

    mid = 0.0
    for _ in range(100):
        mid = (low + high) / 2
        npv_mid = _npv(mid, cash_flows)
        if abs(npv_mid) < 1e-6:
            return mid
        if npv_low * npv_mid < 0:
            high = mid
            npv_high = npv_mid
        else:
            low = mid
            npv_low = npv_mid
    return mid


class FinancialCalculator:
    """Real estate financial calculation utilities"""

    @staticmethod
    def calculate_irr(cash_flows: List[float]) -> float:
        """
        Calculate Internal Rate of Return

        Args:
            cash_flows: List of cash flows (negative for outflows, positive for inflows)

        Returns:
            IRR as a decimal
        """
        try:
            return float(_irr(cash_flows))
        except Exception:  # pylint: disable=broad-exception-caught
            return 0.0

    @staticmethod
    def calculate_npv(rate: float, cash_flows: List[float]) -> float:
        """
        Calculate Net Present Value

        Args:
            rate: Discount rate as decimal
            cash_flows: List of cash flows

        Returns:
            NPV
        """
        return float(_npv(rate, cash_flows))

    @staticmethod
    def calculate_equity_multiple(
        total_cash_distributions: Decimal, total_equity_invested: Decimal
    ) -> float:
        """
        Calculate equity multiple

        Args:
            total_cash_distributions: Total cash returned to investors
            total_equity_invested: Total equity invested

        Returns:
            Equity multiple (e.g., 2.0x means double the investment)
        """
        if total_equity_invested == 0:
            return 0.0
        return float(total_cash_distributions / total_equity_invested)

    @staticmethod
    def calculate_cash_on_cash(annual_cash_flow: Decimal, equity_invested: Decimal) -> float:
        """
        Calculate cash-on-cash return

        Args:
            annual_cash_flow: Annual cash flow before tax
            equity_invested: Equity invested

        Returns:
            Cash-on-cash return as decimal
        """
        if equity_invested == 0:
            return 0.0
        return float(annual_cash_flow / equity_invested)

    @staticmethod
    def calculate_dscr(noi: Decimal, debt_service: Decimal) -> float:
        """
        Calculate Debt Service Coverage Ratio

        Args:
            noi: Net Operating Income
            debt_service: Annual debt service

        Returns:
            DSCR
        """
        if debt_service == 0:
            return float("inf")
        return float(noi / debt_service)

    @staticmethod
    def calculate_ltv(loan_amount: Decimal, property_value: Decimal) -> float:
        """
        Calculate Loan-to-Value ratio

        Args:
            loan_amount: Loan amount
            property_value: Property value

        Returns:
            LTV as decimal
        """
        if property_value == 0:
            return 0.0
        return float(loan_amount / property_value)

    @staticmethod
    def calculate_debt_yield(noi: Decimal, loan_amount: Decimal) -> float:
        """
        Calculate Debt Yield

        Args:
            noi: Net Operating Income
            loan_amount: Loan amount

        Returns:
            Debt yield as decimal
        """
        if loan_amount == 0:
            return 0.0
        return float(noi / loan_amount)

    @staticmethod
    def calculate_mortgage_payment(principal: Decimal, annual_rate: float, years: int) -> Decimal:
        """
        Calculate monthly mortgage payment

        Args:
            principal: Loan principal
            annual_rate: Annual interest rate as decimal
            years: Loan term in years

        Returns:
            Monthly payment
        """
        annual_rate_decimal = Decimal(str(annual_rate))
        monthly_rate = annual_rate_decimal / Decimal(12)
        num_payments = years * 12

        if monthly_rate == 0:
            return principal / num_payments

        payment = (
            principal
            * (monthly_rate * (Decimal(1) + monthly_rate) ** num_payments)
            / ((Decimal(1) + monthly_rate) ** num_payments - Decimal(1))
        )

        return Decimal(payment).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_property_value(noi: Decimal, cap_rate: float) -> Decimal:
        """
        Calculate property value using cap rate

        Args:
            noi: Net Operating Income
            cap_rate: Capitalization rate as decimal

        Returns:
            Property value
        """
        if cap_rate == 0:
            return Decimal(0)
        return Decimal(noi / Decimal(cap_rate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_noi(effective_gross_income: Decimal, operating_expenses: Decimal) -> Decimal:
        """
        Calculate Net Operating Income

        Args:
            effective_gross_income: Effective Gross Income
            operating_expenses: Operating Expenses

        Returns:
            NOI
        """
        return effective_gross_income - operating_expenses

    @staticmethod
    def calculate_effective_gross_income(
        potential_gross_income: Decimal, vacancy_rate: float, collection_loss: float
    ) -> Decimal:
        """
        Calculate Effective Gross Income

        Args:
            potential_gross_income: Potential Gross Income
            vacancy_rate: Vacancy rate as decimal
            collection_loss: Collection loss as decimal

        Returns:
            EGI
        """
        total_loss = vacancy_rate + collection_loss
        return potential_gross_income * Decimal(1 - total_loss)

    @staticmethod
    def run_sensitivity_analysis(
        base_value: float, variable_range: List[float], calculation_func
    ) -> List[Tuple[float, float]]:
        """
        Run sensitivity analysis

        Args:
            base_value: Base case value
            variable_range: Range of values to test
            calculation_func: Function that takes a value and returns result

        Returns:
            List of (variable_value, result) tuples
        """
        _ = base_value
        results = []
        for var_value in variable_range:
            result = calculation_func(var_value)
            results.append((var_value, result))
        return results

    @staticmethod
    def calculate_waterfall_distribution(
        cash_flow: Decimal,
        tiers: List[Dict],
        cumulative_return: Decimal = Decimal(0),
        total_equity: Decimal = Decimal(0),
    ) -> Dict:
        """
        Calculate GP/LP waterfall distribution

        Args:
            cash_flow: Cash flow to distribute
            tiers: List of waterfall tiers with hurdle rates and splits
            cumulative_return: Cumulative return to date
            total_equity: Total equity invested

        Returns:
            Distribution breakdown
        """
        gp_distribution = Decimal(0)
        lp_distribution = Decimal(0)
        remaining = cash_flow

        for tier in tiers:
            if remaining <= 0:
                break

            hurdle_rate = tier.get("hurdle_rate")
            gp_share = Decimal(tier.get("gp_share", 0))
            lp_share = Decimal(tier.get("lp_share", 1))

            # Check if hurdle is met
            if hurdle_rate is not None and total_equity > 0:
                target_return = total_equity * Decimal(hurdle_rate)
                if cumulative_return >= target_return:
                    # Hurdle already met, apply split to all remaining
                    tier_amount = remaining
                else:
                    # Calculate amount to reach hurdle
                    amount_to_hurdle = target_return - cumulative_return
                    tier_amount = min(remaining, amount_to_hurdle)
            else:
                tier_amount = remaining

            # Distribute according to split
            gp_distribution += tier_amount * gp_share
            lp_distribution += tier_amount * lp_share
            remaining -= tier_amount

        return {
            "gp_distribution": gp_distribution,
            "lp_distribution": lp_distribution,
            "total_distributed": gp_distribution + lp_distribution,
        }


# Global calculator instance
calc = FinancialCalculator()
