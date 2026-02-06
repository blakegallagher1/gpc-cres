"""
Gallagher Property Company - AI Agent System
Basic Usage Examples
"""

import asyncio
import os
from decimal import Decimal

# Set up environment (in production, use .env file)
os.environ.setdefault("OPENAI_API_KEY", "your-api-key")
os.environ.setdefault("PERPLEXITY_API_KEY", "your-perplexity-key")

from tools.database import db
from workflows.runner import (
    evaluate_project,
    quick_research,
    quick_underwrite,
    run_development_workflow,
    workflow_runner,
)


async def example_1_create_project():
    """Example: Create a new project"""
    print("=" * 60)
    print("Example 1: Create a New Project")
    print("=" * 60)

    project_data = {
        "name": "Airline Highway MHP Opportunity",
        "address": "12345 Airline Highway, Baton Rouge, LA 70816",
        "property_type": "mobile_home_park",
        "status": "prospecting",
        "acres": 10.5,
        "square_feet": 457380,  # 10.5 acres
        "asking_price": 1200000,
        "target_irr": 0.20,
        "metadata": {"contact": "John Smith", "phone": "(225) 555-0123", "source": "LoopNet"},
    }

    project = await db.create_project(project_data)
    print(f"Created project: {project['name']}")
    print(f"Project ID: {project['id']}")
    print(f"Address: {project['address']}")
    print(f"Asking Price: ${project['asking_price']:,.2f}")

    return project["id"]


async def example_2_quick_research():
    """Example: Quick research on a property"""
    print("\n" + "=" * 60)
    print("Example 2: Quick Property Research")
    print("=" * 60)

    address = "12345 Airline Highway, Baton Rouge, LA"

    result = await quick_research(address, "mobile_home_park")

    print(f"Research completed for: {address}")
    print(f"Agent: {result['agent']}")
    print(f"Output preview: {str(result['output'])[:500]}...")

    return result


async def example_3_quick_underwrite():
    """Example: Quick underwriting"""
    print("\n" + "=" * 60)
    print("Example 3: Quick Underwriting")
    print("=" * 60)

    result = await quick_underwrite(
        address="12345 Airline Highway, Baton Rouge, LA",
        property_type="mobile_home_park",
        units=80,
        lot_rent=450,
        asking_price=1200000,
    )

    print(f"Underwriting completed")
    print(f"Agent: {result['agent']}")
    print(f"Output preview: {str(result['output'])[:500]}...")

    return result


async def example_4_run_single_agent():
    """Example: Run a single agent directly"""
    print("\n" + "=" * 60)
    print("Example 4: Run Single Agent (Finance)")
    print("=" * 60)

    query = """
    Analyze the financing options for a $1.2M mobile home park acquisition
    with 80 lots at $450/month lot rent. Assume 75% LTV at 6.5% interest.
    Calculate IRR, equity multiple, and recommend capital structure.
    """

    result = await workflow_runner.run_single_agent("finance", query)

    print(f"Finance Agent Analysis:")
    print(f"Turns used: {result['turns_used']}")
    print(f"Output preview: {str(result['output'])[:500]}...")

    return result


async def example_5_coordinated_workflow():
    """Example: Run coordinated workflow"""
    print("\n" + "=" * 60)
    print("Example 5: Coordinated Workflow")
    print("=" * 60)

    request = """
    I found a 10-acre parcel on Airline Highway in Baton Rouge that might
    work for a mobile home park. The asking price is $1.2M. Can you:
    1. Research the parcel and surrounding area
    2. Check zoning and flood zone
    3. Run preliminary financials assuming 80 pads at $450/month lot rent
    4. Identify any major risks
    5. Give me a go/no-go recommendation
    """

    result = await run_development_workflow(request)

    print(f"Coordinated workflow completed")
    print(f"Output preview: {str(result)[:1000]}...")

    return result


async def example_6_full_evaluation(project_id: str):
    """Example: Run full project evaluation"""
    print("\n" + "=" * 60)
    print("Example 6: Full Project Evaluation")
    print("=" * 60)

    result = await evaluate_project(project_id)

    print(f"Full evaluation completed for project: {result['project_name']}")
    print(f"Evaluation date: {result['evaluation_date']}")
    print(f"Analyses completed: {result['analyses_completed']}")
    print(f"Synthesis preview: {str(result['synthesis'])[:500]}...")

    return result


async def example_7_parallel_analysis(project_id: str):
    """Example: Run parallel analysis"""
    print("\n" + "=" * 60)
    print("Example 7: Parallel Analysis")
    print("=" * 60)

    analyses = ["research", "risk", "finance"]

    result = await workflow_runner.run_parallel_analysis(project_id, analyses)

    print(f"Parallel analysis completed")
    print(f"Analyses run: {result['analyses_completed']}")
    print(f"Results keys: {list(result['results'].keys())}")

    return result


async def example_8_list_projects():
    """Example: List all projects"""
    print("\n" + "=" * 60)
    print("Example 8: List Projects")
    print("=" * 60)

    projects = await db.list_projects()

    print(f"Found {len(projects)} projects:")
    for p in projects[:5]:  # Show first 5
        print(f"  - {p['name']} ({p['status']})")

    return projects


async def main():
    """Run all examples"""
    print("\n" + "=" * 60)
    print("Gallagher Property Company - AI Agent System")
    print("Basic Usage Examples")
    print("=" * 60)

    try:
        # Example 1: Create project
        project_id = await example_1_create_project()

        # Example 2: Quick research
        await example_2_quick_research()

        # Example 3: Quick underwriting
        await example_3_quick_underwrite()

        # Example 4: Single agent
        await example_4_run_single_agent()

        # Example 5: Coordinated workflow
        await example_5_coordinated_workflow()

        # Example 6: Full evaluation (requires valid project_id)
        # await example_6_full_evaluation(project_id)

        # Example 7: Parallel analysis (requires valid project_id)
        # await example_7_parallel_analysis(project_id)

        # Example 8: List projects
        await example_8_list_projects()

    except Exception as e:
        print(f"\nError: {e}")
        print("Note: Some examples require valid API keys to be configured.")

    print("\n" + "=" * 60)
    print("Examples completed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
