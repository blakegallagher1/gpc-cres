"""
Gallagher Property Company - Database Tools (Supabase)
"""

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, cast

from supabase import Client, create_client

from config.settings import settings


class JSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for datetime and Decimal types"""

    def default(self, o):
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, date):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


class DatabaseManager:
    """Supabase database manager for agent system"""

    def __init__(self):
        self.client: Client = create_client(settings.supabase.url, settings.supabase.service_key)

    # ============================================
    # Project Operations
    # ============================================

    async def create_project(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new project"""
        response = self.client.table("projects").insert(project_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Get project by ID"""
        response = self.client.table("projects").select("*").eq("id", project_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def update_project(self, project_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update project"""
        response = self.client.table("projects").update(updates).eq("id", project_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_projects(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List projects, optionally filtered by status"""
        query = self.client.table("projects").select("*")
        if status:
            query = query.eq("status", status)
        response = query.order("created_at", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Agent Output Operations
    # ============================================

    async def save_agent_output(self, output_data: Dict[str, Any]) -> Dict[str, Any]:
        """Save agent analysis output"""
        # Serialize complex types
        if "output_data" in output_data:
            output_data["output_data"] = json.loads(
                json.dumps(output_data["output_data"], cls=JSONEncoder)
            )
        if "input_data" in output_data:
            output_data["input_data"] = json.loads(
                json.dumps(output_data["input_data"], cls=JSONEncoder)
            )

        response = self.client.table("agent_outputs").insert(output_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_agent_outputs(
        self, project_id: str, agent_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get agent outputs for a project"""
        query = self.client.table("agent_outputs").select("*").eq("project_id", project_id)
        if agent_name:
            query = query.eq("agent_name", agent_name)
        response = query.order("created_at", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def get_latest_agent_output(
        self, project_id: str, agent_name: str, task_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Get most recent agent output"""
        query = (
            self.client.table("agent_outputs")
            .select("*")
            .eq("project_id", project_id)
            .eq("agent_name", agent_name)
        )
        if task_type:
            query = query.eq("task_type", task_type)
        response = query.order("created_at", desc=True).limit(1).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    # ============================================
    # Task Operations
    # ============================================

    async def create_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new task"""
        response = self.client.table("tasks").insert(task_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def update_task_status(
        self, task_id: str, status: str, completed_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Update task status"""
        updates = {"status": status}
        if completed_at:
            updates["completed_at"] = completed_at.isoformat()
        response = self.client.table("tasks").update(updates).eq("id", task_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_project_tasks(self, project_id: str) -> List[Dict[str, Any]]:
        """Get all tasks for a project"""
        response = self.client.table("tasks").select("*").eq("project_id", project_id).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def get_pending_tasks(self, assigned_agent: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get pending tasks, optionally filtered by agent"""
        query = self.client.table("tasks").select("*").eq("status", "pending")
        if assigned_agent:
            query = query.eq("assigned_agent", assigned_agent)
        response = query.order("due_date").execute()
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Document Operations
    # ============================================

    async def save_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        """Save document record"""
        response = self.client.table("documents").insert(document_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_project_documents(self, project_id: str) -> List[Dict[str, Any]]:
        """Get all documents for a project"""
        response = self.client.table("documents").select("*").eq("project_id", project_id).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def get_document_by_type(
        self, project_id: str, document_type: str
    ) -> Optional[Dict[str, Any]]:
        """Get document by type"""
        response = (
            self.client.table("documents")
            .select("*")
            .eq("project_id", project_id)
            .eq("document_type", document_type)
            .execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None


# Global database manager instance
db = DatabaseManager()
