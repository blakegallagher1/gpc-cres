"""
Gallagher Property Company - Main Workflow Runner
"""

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

from agents import Runner
from agents.tracing import set_tracing_disabled, set_tracing_export_api_key

from config.settings import settings
from gpc_agents.coordinator import coordinator_agent
from gpc_agents.deal_screener import deal_screener_agent
from gpc_agents.design import design_agent
from gpc_agents.due_diligence import due_diligence_agent
from gpc_agents.entitlements import entitlements_agent
from gpc_agents.finance import finance_agent
from gpc_agents.legal import legal_agent
from gpc_agents.marketing import marketing_agent
from gpc_agents.market_intel import market_intel_agent
from gpc_agents.operations import operations_agent
from gpc_agents.research import research_agent
from gpc_agents.risk import risk_agent
from gpc_agents.tax_strategist import tax_strategist_agent
from tools.database import db


class DevelopmentWorkflowRunner:
    """
    Main workflow runner for the Gallagher Property Company AI system.
    Orchestrates agent interactions and manages the complete development lifecycle.
    """

    def __init__(self):
        self.coordinator = coordinator_agent
        self.max_turns = settings.agent.max_turns
        self.timeout = settings.agent.timeout_seconds

        # Configure tracing
        if settings.agent.enable_tracing:
            set_tracing_disabled(False)
            set_tracing_export_api_key(settings.openai.api_key)
        else:
            set_tracing_disabled(True)

    async def run_single_agent(
        self, agent_name: str, input_text: str, project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Run a single agent with the given input

        Args:
            agent_name: Name of agent to run
            input_text: Input query/instruction
            project_id: Optional project ID for context

        Returns:
            Agent output
        """
        agent_map = {
            "research": research_agent,
            "finance": finance_agent,
            "legal": legal_agent,
            "design": design_agent,
            "operations": operations_agent,
            "marketing": marketing_agent,
            "risk": risk_agent,
            "coordinator": coordinator_agent,
            "deal_screener": deal_screener_agent,
            "due_diligence": due_diligence_agent,
            "entitlements": entitlements_agent,
            "market_intel": market_intel_agent,
            "tax": tax_strategist_agent,
        }

        agent = agent_map.get(agent_name.lower())
        if not agent:
            return {"error": f"Unknown agent: {agent_name}"}

        # Add project context if available
        if project_id:
            project = await db.get_project(project_id)
            if project:
                input_text = f"""Project Context:
Name: {project.get('name')}
Address: {project.get('address')}
Type: {project.get('property_type')}
Status: {project.get('status')}

User Request: {input_text}"""

        result = await Runner.run(
            agent,
            input=input_text,
            max_turns=self.max_turns,
        )

        # Save output if project_id provided
        if project_id:
            await db.save_agent_output(
                {
                    "project_id": project_id,
                    "agent_name": agent_name,
                    "task_type": "single_agent_run",
                    "input_data": {"query": input_text},
                    "output_data": {"result": result.final_output},
                    "confidence": "medium",
                }
            )

        return {
            "agent": agent_name,
            "output": result.final_output,
            "turns_used": len(result.raw_responses) if hasattr(result, "raw_responses") else 1,
        }

    async def run_coordinated_workflow(
        self, user_request: str, project_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Run a coordinated workflow using the Coordinator agent

        Args:
            user_request: User's request/query
            project_id: Optional project ID for context

        Returns:
            Coordinated workflow output
        """
        # Add project context if available
        if project_id:
            project = await db.get_project(project_id)
            if project:
                user_request = f"""Project Context:
Name: {project.get('name')}
Address: {project.get('address')}
Type: {project.get('property_type')}
Status: {project.get('status')}
Asking Price: ${project.get('asking_price', 'N/A')}

User Request: {user_request}"""

        result = await Runner.run(
            self.coordinator,
            input=user_request,
            max_turns=self.max_turns,
        )

        # Save coordinator output
        if project_id:
            await db.save_agent_output(
                {
                    "project_id": project_id,
                    "agent_name": "coordinator",
                    "task_type": "coordinated_workflow",
                    "input_data": {"request": user_request},
                    "output_data": {"result": result.final_output},
                    "confidence": "high",
                }
            )

        return {"output": result.final_output, "workflow_completed": True}

    async def run_parallel_analysis(self, project_id: str, analyses: List[str]) -> Dict[str, Any]:
        """
        Run multiple analyses in parallel

        Args:
            project_id: Project ID
            analyses: List of analysis types to run (research, risk, finance, etc.)

        Returns:
            Combined results from all analyses
        """
        project = await db.get_project(project_id)
        if not project:
            return {"error": "Project not found"}

        # Build project context
        context = f"""Analyze the following project:
Name: {project.get('name')}
Address: {project.get('address')}
Type: {project.get('property_type')}
Size: {project.get('acres')} acres
Asking Price: ${project.get('asking_price', 'N/A')}
"""

        # Create tasks for parallel execution
        tasks = []
        agent_map = {
            "research": research_agent,
            "risk": risk_agent,
            "finance": finance_agent,
            "legal": legal_agent,
            "design": design_agent,
            "deal_screener": deal_screener_agent,
            "due_diligence": due_diligence_agent,
            "entitlements": entitlements_agent,
            "market_intel": market_intel_agent,
            "tax": tax_strategist_agent,
        }

        for analysis in analyses:
            agent = agent_map.get(analysis.lower())
            if agent:
                task = Runner.run(agent, input=context, max_turns=20)
                tasks.append((analysis, task))

        # Execute in parallel
        results = {}
        for analysis_name, task in tasks:
            try:
                result = await task
                results[analysis_name] = result.final_output
            except Exception as e:  # pylint: disable=broad-exception-caught
                results[analysis_name] = {"error": str(e)}

        # Save combined output
        await db.save_agent_output(
            {
                "project_id": project_id,
                "agent_name": "coordinator",
                "task_type": "parallel_analysis",
                "input_data": {"analyses": analyses},
                "output_data": results,
                "confidence": "high",
            }
        )

        return {
            "project_id": project_id,
            "analyses_completed": list(results.keys()),
            "results": results,
        }

    async def run_full_evaluation(self, project_id: str) -> Dict[str, Any]:
        """
        Run a complete project evaluation with all agents

        Args:
            project_id: Project ID to evaluate

        Returns:
            Complete evaluation with all agent outputs
        """
        project = await db.get_project(project_id)
        if not project:
            return {"error": "Project not found"}

        # Run all analyses in parallel
        analyses = ["research", "risk", "finance", "legal", "design"]
        parallel_results = await self.run_parallel_analysis(project_id, analyses)

        # Have coordinator synthesize results
        synthesis_input = f"""Synthesize the following analysis results for project '{project.get('name')}':

RESEARCH: {parallel_results['results'].get('research', 'N/A')}

RISK: {parallel_results['results'].get('risk', 'N/A')}

FINANCE: {parallel_results['results'].get('finance', 'N/A')}

LEGAL: {parallel_results['results'].get('legal', 'N/A')}

DESIGN: {parallel_results['results'].get('design', 'N/A')}

Provide a final go/no-go recommendation with supporting rationale.
"""

        synthesis = await Runner.run(self.coordinator, input=synthesis_input, max_turns=10)

        return {
            "project_id": project_id,
            "project_name": project.get("name"),
            "evaluation_date": datetime.now().isoformat(),
            "individual_analyses": parallel_results["results"],
            "synthesis": synthesis.final_output,
            "recommendation": "See synthesis for final recommendation",
        }

    async def create_project_and_evaluate(
        self, project_data: Dict[str, Any], run_evaluation: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new project and optionally run full evaluation

        Args:
            project_data: Project creation data
            run_evaluation: Whether to run full evaluation after creation

        Returns:
            Created project and evaluation results
        """
        # Create project
        project = await db.create_project(project_data)
        if not project:
            return {"error": "Failed to create project"}

        project_id = project["id"]

        # Run evaluation if requested
        evaluation = None
        if run_evaluation:
            evaluation = await self.run_full_evaluation(project_id)

        return {
            "project": project,
            "evaluation": evaluation,
            "message": "Project created successfully",
        }


# Global workflow runner instance
workflow_runner = DevelopmentWorkflowRunner()


# Convenience functions for direct use
async def run_development_workflow(
    user_request: str, project_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entry point for running development workflows

    Args:
        user_request: User's request/query
        project_id: Optional project ID for context

    Returns:
        Workflow result
    """
    return await workflow_runner.run_coordinated_workflow(user_request, project_id)


async def evaluate_project(project_id: str) -> Dict[str, Any]:
    """
    Run a full project evaluation

    Args:
        project_id: Project ID to evaluate

    Returns:
        Complete evaluation results
    """
    return await workflow_runner.run_full_evaluation(project_id)


async def quick_research(address: str, property_type: str) -> Dict[str, Any]:
    """
    Quick research on a property

    Args:
        address: Property address
        property_type: Type of property

    Returns:
        Research results
    """
    query = f"""Research the property at {address} for {property_type} development.

Provide:
1. Parcel information (size, zoning, owner)
2. Market context (vacancy, rents, absorption)
3. Comparable sales/leases
4. Preliminary go/no-go recommendation
"""
    return await workflow_runner.run_single_agent("research", query)


async def quick_underwrite(
    address: str, property_type: str, units: int, lot_rent: float, asking_price: float
) -> Dict[str, Any]:
    """
    Quick underwriting for a mobile home park or multifamily property

    Args:
        address: Property address
        property_type: Type of property
        units: Number of units/lots
        lot_rent: Monthly rent per unit
        asking_price: Asking price

    Returns:
        Underwriting results
    """
    query = f"""Underwrite the following {property_type} opportunity:

Address: {address}
Units/Lots: {units}
Monthly Rent per Unit: ${lot_rent}
Asking Price: ${asking_price:,.0f}

Provide:
1. Pro forma with 5-year projections
2. Returns analysis (IRR, equity multiple, cash-on-cash)
3. Sensitivity analysis
4. Financing recommendations
5. Go/no-go recommendation
"""
    return await workflow_runner.run_single_agent("finance", query)


# Example usage
if __name__ == "__main__":
    # Example: Run a complete workflow
    example_request = """
    I found a 10-acre parcel on Airline Highway in Baton Rouge that might
    work for a mobile home park. The asking price is $1.2M. Can you:
    1. Research the parcel and surrounding area
    2. Check zoning and flood zone
    3. Run preliminary financials assuming 80 pads at $450/month lot rent
    4. Identify any major risks
    5. Give me a go/no-go recommendation
    """

    example_result = asyncio.run(run_development_workflow(example_request))
    print(example_result)
