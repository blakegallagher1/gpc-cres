"""
Gallagher Property Company - Agent Tests
"""

import asyncio
from decimal import Decimal

import pytest

from tools.external_apis import FEMAClient, GoogleMapsClient, PerplexityClient
from tools.financial_calcs import calc

# ============================================
# Financial Calculator Tests
# ============================================


class TestFinancialCalculators:
    """Test financial calculation utilities"""

    def test_calculate_irr(self):
        """Test IRR calculation"""
        cash_flows = [-1000, 300, 400, 400, 300]
        irr = calc.calculate_irr(cash_flows)
        assert irr is not None
        assert irr > 0

    def test_calculate_equity_multiple(self):
        """Test equity multiple calculation"""
        distributions = Decimal(2500)
        invested = Decimal(1000)
        eq_mult = calc.calculate_equity_multiple(distributions, invested)
        assert eq_mult == 2.5

    def test_calculate_cash_on_cash(self):
        """Test cash-on-cash calculation"""
        annual_cf = Decimal(100)
        equity = Decimal(1000)
        coc = calc.calculate_cash_on_cash(annual_cf, equity)
        assert coc == 0.10

    def test_calculate_dscr(self):
        """Test DSCR calculation"""
        noi = Decimal(125000)
        debt_service = Decimal(100000)
        dscr = calc.calculate_dscr(noi, debt_service)
        assert dscr == 1.25

    def test_calculate_ltv(self):
        """Test LTV calculation"""
        loan = Decimal(750000)
        value = Decimal(1000000)
        ltv = calc.calculate_ltv(loan, value)
        assert ltv == 0.75

    def test_calculate_mortgage_payment(self):
        """Test mortgage payment calculation"""
        principal = Decimal(750000)
        rate = 0.06
        years = 25
        payment = calc.calculate_mortgage_payment(principal, rate, years)
        assert payment > 0

    def test_calculate_property_value(self):
        """Test property value calculation using cap rate"""
        noi = Decimal(100000)
        cap_rate = 0.065
        value = calc.calculate_property_value(noi, cap_rate)
        assert value == Decimal("1538461.54")


# ============================================
# API Client Tests
# ============================================


@pytest.mark.asyncio
class TestExternalAPIs:
    """Test external API integrations"""

    async def test_perplexity_client_initialization(self):
        """Test Perplexity client can be initialized"""
        client = PerplexityClient()
        assert client is not None
        assert client.base_url == "https://api.perplexity.ai"

    async def test_google_maps_client_initialization(self):
        """Test Google Maps client can be initialized"""
        client = GoogleMapsClient()
        assert client is not None

    async def test_fema_client_initialization(self):
        """Test FEMA client can be initialized"""
        client = FEMAClient()
        assert client is not None
        assert client.base_url == "https://msc.fema.gov/portal/api"


# ============================================
# Agent Tool Tests
# ============================================


class TestAgentTools:
    """Test agent tool functions"""

    def test_zoning_config_lookup(self):
        """Test zoning configuration lookup"""
        from gpc_agents.legal import _get_zoning_config

        config = _get_zoning_config("R-3")
        assert config["max_far"] > 0
        assert config["max_coverage"] > 0
        assert "setbacks" in config

    def test_parking_requirements(self):
        """Test parking requirements by use"""
        from gpc_agents.design import PARKING_REQUIREMENTS

        assert "mobile_home_park" in PARKING_REQUIREMENTS
        assert "flex_industrial" in PARKING_REQUIREMENTS
        assert "multifamily" in PARKING_REQUIREMENTS

        mhp_req = PARKING_REQUIREMENTS["mobile_home_park"]
        assert mhp_req["ratio"] == 2.0
        assert mhp_req["unit"] == "per_lot"

    def test_construction_costs_structure(self):
        """Test construction costs database structure"""
        from gpc_agents.design import CONSTRUCTION_COSTS

        assert "mobile_home_park" in CONSTRUCTION_COSTS
        assert "flex_industrial" in CONSTRUCTION_COSTS

        mhp_costs = CONSTRUCTION_COSTS["mobile_home_park"]
        assert "site_work" in mhp_costs
        assert "infrastructure" in mhp_costs


# ============================================
# Schema Validation Tests
# ============================================


class TestSchemaValidation:
    """Test Pydantic schema validation"""

    def test_project_schema(self):
        """Test Project schema"""
        from models.schemas import Project, ProjectStatus, PropertyType

        project = Project(
            name="Test Project",
            address="123 Test St",
            property_type=PropertyType.MOBILE_HOME_PARK,
            status=ProjectStatus.PROSPECTING,
            acres=10.5,
            asking_price=Decimal("1200000"),
        )

        assert project.name == "Test Project"
        assert project.acres == 10.5

    def test_task_schema(self):
        """Test Task schema"""
        from models.schemas import Task

        task = Task(
            project_id="test-project-id",
            title="Test Task",
            description="Test description",
            assigned_agent="research_agent",
            status="pending",
        )

        assert task.title == "Test Task"
        assert task.assigned_agent == "research_agent"


# ============================================
# Integration Tests (require API keys)
# ============================================


@pytest.mark.integration
@pytest.mark.asyncio
class TestIntegration:
    """Integration tests - require valid API keys"""

    async def test_fema_flood_zone_lookup(self):
        """Test FEMA flood zone lookup"""
        from tools.external_apis import fema

        # Test coordinates for Baton Rouge (approximate)
        result = await fema.get_flood_zone(30.4515, -91.1871)
        assert "zone" in result or "error" in result

    async def test_google_maps_geocode(self):
        """Test Google Maps geocoding"""
        from tools.external_apis import gmaps

        # Skip if no API key
        if not gmaps.client:
            pytest.skip("Google Maps API key not configured")

        result = await gmaps.geocode_address("1600 Pennsylvania Avenue, Washington, DC")
        # May return None if API key is invalid


# ============================================
# Main
# ============================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
