"""
Gallagher Property Company - New Agent Tests
"""

from decimal import Decimal

import pytest

from gpc_agents.deal_screener import compute_weighted_score


class TestDealScreenerScoring:
    """Test deal screener scoring logic"""

    def test_weighted_score_tier_b(self):
        scores = {
            "financial": 90,
            "location": 80,
            "utilities": 70,
            "zoning": 60,
            "market": 75,
            "risk": 50,
        }
        breakdown = compute_weighted_score(scores)
        assert breakdown["total_score"] == 75.25
        assert breakdown["tier"] == "B"

    def test_weighted_score_normalizes_fraction(self):
        scores = {
            "financial": 0.9,
            "location": 0.9,
            "utilities": 0.9,
            "zoning": 0.9,
            "market": 0.9,
            "risk": 0.9,
        }
        breakdown = compute_weighted_score(scores)
        assert breakdown["total_score"] == 90.0
        assert breakdown["tier"] == "A"

    def test_weight_override_applied(self):
        scores = {"financial": 80}
        breakdown = compute_weighted_score(scores, weights={"financial": 1.0})
        assert breakdown["weights"]["financial"] == 1.0
        assert breakdown["total_score"] == 80.0


class TestNewSchemas:
    """Test new Pydantic schema models"""

    def test_screener_models(self):
        from models.schemas import ScreenedListing, ScreeningCriteria, ScreeningScore

        criteria = ScreeningCriteria(name="Base Criteria")
        listing = ScreenedListing(address="123 Main St")
        score = ScreeningScore(listing_id="listing-1", total_score=78.5, tier="B")
        assert criteria.name == "Base Criteria"
        assert listing.address == "123 Main St"
        assert score.tier == "B"

    def test_due_diligence_models(self):
        from models.schemas import (
            DueDiligenceChecklistItem,
            DueDiligenceDeal,
            DueDiligenceDocument,
            DueDiligenceRedFlag,
        )

        deal = DueDiligenceDeal(name="DD Deal 1")
        doc = DueDiligenceDocument(dd_deal_id="dd-1", document_type="survey")
        checklist = DueDiligenceChecklistItem(dd_deal_id="dd-1", name="Phase I")
        red_flag = DueDiligenceRedFlag(dd_deal_id="dd-1", description="Title issue")
        assert deal.status == "open"
        assert doc.document_type == "survey"
        assert checklist.status == "pending"
        assert red_flag.status == "open"

    def test_entitlements_models(self):
        from models.schemas import AgendaItem, EntitlementZoningAnalysis, PermitRecord, PolicyChange

        analysis = EntitlementZoningAnalysis(project_id="proj-1", zoning_code="C-2")
        permit = PermitRecord(project_id="proj-1", permit_type="site_plan")
        agenda = AgendaItem(body="Planning commission agenda")
        policy = PolicyChange(body="New impact fee schedule")
        assert analysis.project_id == "proj-1"
        assert permit.permit_type == "site_plan"
        assert agenda.body.startswith("Planning")
        assert policy.body.startswith("New impact")

    def test_market_intel_models(self):
        from models.schemas import (
            AbsorptionMetric,
            CompetitorTransaction,
            EconomicIndicator,
            InfrastructureProject,
        )

        competitor = CompetitorTransaction(region="BR", price=Decimal("1000000"))
        indicator = EconomicIndicator(indicator_name="Jobs", value=Decimal("1.2"))
        project = InfrastructureProject(name="Road Expansion", budget=Decimal("5000000"))
        absorption = AbsorptionMetric(region="BR", absorption_rate=Decimal("0.02"))
        assert competitor.region == "BR"
        assert indicator.indicator_name == "Jobs"
        assert project.name == "Road Expansion"
        assert absorption.region == "BR"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
