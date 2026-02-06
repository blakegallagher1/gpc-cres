"""
Gallagher Property Company - Database Tools (Supabase)
"""

import json
import logging
import os
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional, cast

from postgrest.exceptions import APIError
from supabase import Client, create_client

from config.settings import settings

logger = logging.getLogger(__name__)
_MISSING_TABLE_WARNED: set[str] = set()


def _warn_missing_table_once(table: str, operation: str) -> None:
    if table in _MISSING_TABLE_WARNED:
        return
    _MISSING_TABLE_WARNED.add(table)
    logger.warning(
        "Supabase table '%s' is missing (PGRST205). Returning empty result for %s until "
        "migrations are applied.",
        table,
        operation,
    )


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

    def _serialize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return cast(Dict[str, Any], json.loads(json.dumps(payload, cls=JSONEncoder)))

    def _is_missing_table_error(self, exc: Exception) -> bool:
        if not isinstance(exc, APIError):
            return False
        if getattr(exc, "code", None) == "PGRST205":
            return True
        raw_error = getattr(exc, "_raw_error", None)
        if isinstance(raw_error, dict):
            return raw_error.get("code") == "PGRST205"
        return False

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

    async def update_document(self, document_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update document record"""
        response = self.client.table("documents").update(updates).eq("id", document_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get document by ID"""
        response = self.client.table("documents").select("*").eq("id", document_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

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

    # ============================================
    # Deal Room Operations
    # ============================================

    async def create_deal_room(self, room_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a deal room"""
        response = self.client.table("deal_rooms").insert(room_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_deal_room(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Get a deal room"""
        response = self.client.table("deal_rooms").select("*").eq("id", room_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def list_deal_rooms(self, project_id: str) -> List[Dict[str, Any]]:
        """List deal rooms for a project"""
        response = (
            self.client.table("deal_rooms")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def add_deal_room_member(self, member_data: Dict[str, Any]) -> Dict[str, Any]:
        """Add member to deal room"""
        response = self.client.table("deal_room_members").insert(member_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_deal_room_members(self, room_id: str) -> List[Dict[str, Any]]:
        """List deal room members"""
        response = self.client.table("deal_room_members").select("*").eq("room_id", room_id).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def add_deal_room_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Add deal room message"""
        if "attachments" in message_data:
            message_data["attachments"] = self._serialize_payload(
                cast(Dict[str, Any], {"attachments": message_data["attachments"]})
            ).get("attachments", [])
        response = self.client.table("deal_room_messages").insert(message_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_deal_room_messages(self, room_id: str) -> List[Dict[str, Any]]:
        """List deal room messages"""
        response = (
            self.client.table("deal_room_messages")
            .select("*")
            .eq("room_id", room_id)
            .order("created_at", desc=False)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_deal_room_artifact(self, artifact_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create artifact"""
        response = self.client.table("deal_room_artifacts").insert(artifact_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def add_deal_room_artifact_version(self, version_data: Dict[str, Any]) -> Dict[str, Any]:
        """Add artifact version"""
        if "content_json" in version_data:
            version_data["content_json"] = self._serialize_payload(
                cast(Dict[str, Any], version_data["content_json"])
            )
        response = self.client.table("deal_room_artifact_versions").insert(version_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def update_deal_room_artifact(
        self, artifact_id: str, updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update artifact"""
        response = (
            self.client.table("deal_room_artifacts").update(updates).eq("id", artifact_id).execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_deal_room_artifacts(self, room_id: str) -> List[Dict[str, Any]]:
        """List artifacts"""
        response = (
            self.client.table("deal_room_artifacts")
            .select("*")
            .eq("room_id", room_id)
            .order("created_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def add_deal_room_event(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """Add deal room event"""
        if "payload" in event_data:
            event_data["payload"] = self._serialize_payload(cast(Dict[str, Any], event_data["payload"]))
        response = self.client.table("deal_room_events").insert(event_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_deal_room_events(self, room_id: str) -> List[Dict[str, Any]]:
        """List deal room events"""
        response = (
            self.client.table("deal_room_events")
            .select("*")
            .eq("room_id", room_id)
            .order("created_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Citations & Claims
    # ============================================

    async def create_citation(self, citation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create citation"""
        if "metadata" in citation_data:
            citation_data["metadata"] = self._serialize_payload(
                cast(Dict[str, Any], citation_data["metadata"])
            )
        response = self.client.table("citations").insert(citation_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def create_claim_link(self, claim_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create claim link"""
        response = self.client.table("claim_links").insert(claim_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_citations(self, project_id: str) -> List[Dict[str, Any]]:
        """List citations"""
        response = (
            self.client.table("citations")
            .select("*")
            .eq("project_id", project_id)
            .order("accessed_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Scenario Operations
    # ============================================

    async def create_scenario(self, scenario_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create scenario"""
        if "base_assumptions" in scenario_data:
            scenario_data["base_assumptions"] = self._serialize_payload(
                cast(Dict[str, Any], scenario_data["base_assumptions"])
            )
        response = self.client.table("scenarios").insert(scenario_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def create_scenario_run(self, run_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create scenario run"""
        if "delta_assumptions" in run_data:
            run_data["delta_assumptions"] = self._serialize_payload(
                cast(Dict[str, Any], run_data["delta_assumptions"])
            )
        if "results" in run_data:
            run_data["results"] = self._serialize_payload(cast(Dict[str, Any], run_data["results"]))
        response = self.client.table("scenario_runs").insert(run_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_scenario_runs(self, scenario_id: str) -> List[Dict[str, Any]]:
        """List scenario runs"""
        response = (
            self.client.table("scenario_runs")
            .select("*")
            .eq("scenario_id", scenario_id)
            .order("created_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Export Jobs
    # ============================================

    async def create_export_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create export job"""
        if "payload" in job_data:
            job_data["payload"] = self._serialize_payload(
                cast(Dict[str, Any], job_data["payload"])
            )
        if "output_files" in job_data:
            job_data["output_files"] = self._serialize_payload(
                cast(Dict[str, Any], {"output_files": job_data["output_files"]})
            ).get("output_files", [])
        response = self.client.table("export_jobs").insert(job_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def update_export_job(self, job_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update export job"""
        if "payload" in updates:
            updates["payload"] = self._serialize_payload(cast(Dict[str, Any], updates["payload"]))
        if "output_files" in updates:
            updates["output_files"] = self._serialize_payload(
                cast(Dict[str, Any], {"output_files": updates["output_files"]})
            ).get("output_files", [])
        response = self.client.table("export_jobs").update(updates).eq("id", job_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_export_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get export job"""
        response = self.client.table("export_jobs").select("*").eq("id", job_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def list_export_jobs(self, statuses: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """List export jobs, optionally filtered by status list"""
        query = self.client.table("export_jobs").select("*")
        if statuses:
            if len(statuses) == 1:
                query = query.eq("status", statuses[0])
            else:
                query = query.in_("status", statuses)
        try:
            response = query.order("created_at", desc=True).execute()
        except APIError as exc:
            if self._is_missing_table_error(exc):
                _warn_missing_table_once("export_jobs", "DatabaseManager.list_export_jobs")
                return []
            raise
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Ingestion Jobs
    # ============================================

    async def create_ingestion_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create ingestion job"""
        if "extracted_data" in job_data:
            job_data["extracted_data"] = self._serialize_payload(
                cast(Dict[str, Any], job_data["extracted_data"])
            )
        response = self.client.table("ingestion_jobs").insert(job_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def update_ingestion_job(self, job_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update ingestion job"""
        if "extracted_data" in updates:
            updates["extracted_data"] = self._serialize_payload(
                cast(Dict[str, Any], updates["extracted_data"])
            )
        response = self.client.table("ingestion_jobs").update(updates).eq("id", job_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_ingestion_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get ingestion job"""
        response = self.client.table("ingestion_jobs").select("*").eq("id", job_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def list_ingestion_jobs(self, statuses: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """List ingestion jobs, optionally filtered by status list"""
        query = self.client.table("ingestion_jobs").select("*")
        if statuses:
            if len(statuses) == 1:
                query = query.eq("status", statuses[0])
            else:
                query = query.in_("status", statuses)
        try:
            response = query.order("created_at", desc=True).execute()
        except APIError as exc:
            if self._is_missing_table_error(exc):
                _warn_missing_table_once("ingestion_jobs", "DatabaseManager.list_ingestion_jobs")
                return []
            raise
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Screening Operations
    # ============================================

    async def get_active_screening_playbook(self) -> Optional[Dict[str, Any]]:
        """Get the active screening playbook"""
        response = (
            self.client.table("screening_playbooks")
            .select("*")
            .eq("is_active", True)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def list_screening_playbooks(self) -> List[Dict[str, Any]]:
        """List all screening playbooks"""
        response = (
            self.client.table("screening_playbooks")
            .select("*")
            .order("version", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_screening_playbook(
        self, settings_payload: Dict[str, Any], created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new screening playbook version (inactive by default)."""
        if settings_payload:
            settings_payload = self._serialize_payload(settings_payload)
        response = self.client.table("screening_playbooks").insert(
            {"settings": settings_payload, "created_by": created_by}
        ).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def create_screening_playbook_version(
        self,
        version: int,
        settings_payload: Dict[str, Any],
        created_by: Optional[str] = None,
        activate: bool = True,
    ) -> Dict[str, Any]:
        """Create a new playbook version and optionally activate it."""
        if settings_payload:
            settings_payload = self._serialize_payload(settings_payload)
        payload = {
            "version": version,
            "settings": settings_payload,
            "created_by": created_by,
            "is_active": activate,
        }
        if activate:
            self.client.table("screening_playbooks").update({"is_active": False}).execute()
        response = self.client.table("screening_playbooks").insert(cast(Any, payload)).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def activate_screening_playbook(self, playbook_id: str) -> Optional[Dict[str, Any]]:
        """Activate a specific playbook version."""
        self.client.table("screening_playbooks").update({"is_active": False}).execute()
        response = (
            self.client.table("screening_playbooks")
            .update({"is_active": True})
            .eq("id", playbook_id)
            .execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def create_screening_run(self, run_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a screening run"""
        if "playbook_snapshot" in run_data:
            run_data["playbook_snapshot"] = self._serialize_payload(
                cast(Dict[str, Any], run_data["playbook_snapshot"])
            )
        response = self.client.table("screening_runs").insert(run_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def update_screening_run(self, run_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update a screening run"""
        if "playbook_snapshot" in updates:
            updates["playbook_snapshot"] = self._serialize_payload(
                cast(Dict[str, Any], updates["playbook_snapshot"])
            )
        response = (
            self.client.table("screening_runs").update(updates).eq("id", run_id).execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_screening_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get screening run by ID"""
        response = self.client.table("screening_runs").select("*").eq("id", run_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def list_screening_runs(
        self, project_id: Optional[str] = None, statuses: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """List screening runs by project or status"""
        query = self.client.table("screening_runs").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
        if statuses:
            if len(statuses) == 1:
                query = query.eq("status", statuses[0])
            else:
                query = query.in_("status", statuses)
        try:
            response = query.order("created_at", desc=True).execute()
        except APIError as exc:
            if self._is_missing_table_error(exc):
                _warn_missing_table_once("screening_runs", "DatabaseManager.list_screening_runs")
                return []
            raise
        return cast(List[Dict[str, Any]], response.data or [])

    async def upsert_screening_score(self, score_data: Dict[str, Any]) -> Dict[str, Any]:
        """Upsert screening score for a run"""
        response = (
            self.client.table("screening_scores")
            .upsert(score_data, on_conflict="screening_run_id")
            .execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_screening_score(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get screening score by run"""
        response = (
            self.client.table("screening_scores")
            .select("*")
            .eq("screening_run_id", run_id)
            .limit(1)
            .execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def upsert_screening_field_values(
        self, field_values: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Upsert screening field values for a run"""
        payload: List[Dict[str, Any]] = []
        for value in field_values:
            entry = dict(value)
            if "value_json" in entry:
                entry["value_json"] = self._serialize_payload(
                    cast(Dict[str, Any], entry["value_json"])
                )
            payload.append(entry)
        response = (
            self.client.table("screening_field_values")
            .upsert(payload, on_conflict="screening_run_id,field_key")
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def list_screening_field_values(self, run_id: str) -> List[Dict[str, Any]]:
        """List screening field values for a run"""
        response = (
            self.client.table("screening_field_values")
            .select("*")
            .eq("screening_run_id", run_id)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_screening_override(self, override_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create screening override"""
        if "value_json" in override_data:
            override_data["value_json"] = self._serialize_payload(
                cast(Dict[str, Any], override_data["value_json"])
            )
        response = self.client.table("screening_overrides").insert(override_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_screening_overrides(
        self, project_id: str, scope: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List screening overrides for a project"""
        query = self.client.table("screening_overrides").select("*").eq("project_id", project_id)
        if scope:
            query = query.eq("scope", scope)
        response = query.order("created_at", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Tone Profiles & Settings
    # ============================================

    async def create_tone_profile(self, profile_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create tone profile"""
        if "style_guidelines" in profile_data:
            profile_data["style_guidelines"] = self._serialize_payload(
                cast(Dict[str, Any], profile_data["style_guidelines"])
            )
        response = self.client.table("tone_profiles").insert(profile_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_tone_profiles(self) -> List[Dict[str, Any]]:
        """List tone profiles"""
        response = self.client.table("tone_profiles").select("*").order("created_at", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def upsert_user_settings(self, settings_data: Dict[str, Any]) -> Dict[str, Any]:
        """Upsert user settings"""
        response = self.client.table("user_settings").upsert(settings_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    # ============================================
    # Deal Screener Operations
    # ============================================

    async def create_screener_listing(self, listing_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a deal screener listing"""
        if "listing_data" in listing_data:
            listing_data["listing_data"] = self._serialize_payload(
                cast(Dict[str, Any], listing_data["listing_data"])
            )
        response = self.client.table("screener_listings").insert(listing_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_screener_listing(self, listing_id: str) -> Optional[Dict[str, Any]]:
        """Get a screener listing"""
        response = (
            self.client.table("screener_listings").select("*").eq("id", listing_id).execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def update_screener_listing(
        self, listing_id: str, updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Update a screener listing"""
        if "score_detail" in updates:
            updates["score_detail"] = self._serialize_payload(
                cast(Dict[str, Any], updates["score_detail"])
            )
        response = (
            self.client.table("screener_listings").update(updates).eq("id", listing_id).execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_screener_listings(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List screener listings"""
        query = self.client.table("screener_listings").select("*")
        if status:
            query = query.eq("status", status)
        response = query.order("created_at", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_screener_criteria(self, criteria_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create screener criteria"""
        criteria_data["weights"] = self._serialize_payload(
            cast(Dict[str, Any], criteria_data.get("weights") or {})
        )
        criteria_data["thresholds"] = self._serialize_payload(
            cast(Dict[str, Any], criteria_data.get("thresholds") or {})
        )
        criteria_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], criteria_data.get("metadata") or {})
        )
        response = self.client.table("screener_criteria").insert(criteria_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_screener_criteria(self, criteria_id: str) -> Optional[Dict[str, Any]]:
        """Get screener criteria"""
        response = (
            self.client.table("screener_criteria").select("*").eq("id", criteria_id).execute()
        )
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def create_screener_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create screener alert"""
        response = self.client.table("screener_alerts").insert(alert_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_screener_alerts(
        self, listing_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List screener alerts"""
        query = self.client.table("screener_alerts").select("*")
        if listing_id:
            query = query.eq("listing_id", listing_id)
        response = query.order("created_at", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Due Diligence Operations
    # ============================================

    async def create_dd_deal(self, deal_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a due diligence deal"""
        deal_data["key_dates"] = self._serialize_payload(
            cast(Dict[str, Any], deal_data.get("key_dates") or {})
        )
        deal_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], deal_data.get("metadata") or {})
        )
        response = self.client.table("dd_deals").insert(deal_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def get_dd_deal(self, dd_deal_id: str) -> Optional[Dict[str, Any]]:
        """Get a due diligence deal"""
        response = self.client.table("dd_deals").select("*").eq("id", dd_deal_id).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else None

    async def create_dd_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create due diligence document"""
        document_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], document_data.get("metadata") or {})
        )
        response = self.client.table("dd_documents").insert(document_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def add_dd_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for creating due diligence document"""
        return await self.create_dd_document(document_data)

    async def list_dd_documents(self, dd_deal_id: str) -> List[Dict[str, Any]]:
        """List due diligence documents"""
        response = (
            self.client.table("dd_documents").select("*").eq("dd_deal_id", dd_deal_id).execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_dd_checklist_item(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create due diligence checklist item"""
        item_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], item_data.get("metadata") or {})
        )
        response = self.client.table("dd_checklist_items").insert(item_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def add_dd_checklist_items(
        self, dd_deal_id: str, items: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Insert multiple due diligence checklist items"""
        payload: List[Dict[str, Any]] = []
        for item in items:
            entry = {"dd_deal_id": dd_deal_id, **item}
            entry["metadata"] = self._serialize_payload(
                cast(Dict[str, Any], entry.get("metadata") or {})
            )
            payload.append(entry)
        response = self.client.table("dd_checklist_items").insert(payload).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def list_dd_checklist_items(self, dd_deal_id: str) -> List[Dict[str, Any]]:
        """List due diligence checklist items"""
        response = (
            self.client.table("dd_checklist_items")
            .select("*")
            .eq("dd_deal_id", dd_deal_id)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_dd_red_flag(self, red_flag_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create due diligence red flag"""
        red_flag_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], red_flag_data.get("metadata") or {})
        )
        response = self.client.table("dd_red_flags").insert(red_flag_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def add_dd_red_flags(
        self, dd_deal_id: str, flags: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Insert multiple due diligence red flags"""
        payload: List[Dict[str, Any]] = []
        for flag in flags:
            entry = {"dd_deal_id": dd_deal_id, **flag}
            entry["metadata"] = self._serialize_payload(
                cast(Dict[str, Any], entry.get("metadata") or {})
            )
            payload.append(entry)
        response = self.client.table("dd_red_flags").insert(payload).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def list_dd_red_flags(self, dd_deal_id: str) -> List[Dict[str, Any]]:
        """List due diligence red flags"""
        response = (
            self.client.table("dd_red_flags").select("*").eq("dd_deal_id", dd_deal_id).execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Entitlements Operations
    # ============================================

    async def create_permit_record(self, permit_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create permit record"""
        response = self.client.table("permits").insert(permit_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_permits(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List permits"""
        query = self.client.table("permits").select("*")
        if project_id:
            query = query.eq("project_id", project_id)
        response = query.order("created_at", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_zoning_analysis(self, analysis_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create zoning analysis"""
        analysis_data["analysis"] = self._serialize_payload(
            cast(Dict[str, Any], analysis_data.get("analysis") or {})
        )
        response = self.client.table("zoning_analysis").insert(analysis_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def create_agenda_item(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create agenda item"""
        item_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], item_data.get("metadata") or {})
        )
        response = self.client.table("agenda_items").insert(item_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_agenda_items(self) -> List[Dict[str, Any]]:
        """List agenda items"""
        response = self.client.table("agenda_items").select("*").order("date", desc=True).execute()
        return cast(List[Dict[str, Any]], response.data or [])

    async def create_policy_change(self, policy_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create policy change"""
        policy_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], policy_data.get("metadata") or {})
        )
        response = self.client.table("policy_changes").insert(policy_data).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_policy_changes(self) -> List[Dict[str, Any]]:
        """List policy changes"""
        response = (
            self.client.table("policy_changes").select("*").order("effective_date", desc=True).execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    # ============================================
    # Market Intelligence Operations
    # ============================================

    async def create_competitor_transaction(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create competitor transaction"""
        payload["metadata"] = self._serialize_payload(cast(Dict[str, Any], payload.get("metadata") or {}))
        response = self.client.table("competitor_transactions").insert(payload).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def create_economic_indicator(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create economic indicator"""
        payload["metadata"] = self._serialize_payload(cast(Dict[str, Any], payload.get("metadata") or {}))
        response = self.client.table("economic_indicators").insert(payload).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def create_infrastructure_project(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create infrastructure project"""
        payload["metadata"] = self._serialize_payload(cast(Dict[str, Any], payload.get("metadata") or {}))
        response = self.client.table("infrastructure_projects").insert(payload).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def create_absorption_metric(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create absorption metric"""
        payload["metadata"] = self._serialize_payload(cast(Dict[str, Any], payload.get("metadata") or {}))
        response = self.client.table("absorption_data").insert(payload).execute()
        data = cast(List[Dict[str, Any]], response.data or [])
        return data[0] if data else {}

    async def list_competitor_transactions(
        self, region: str, property_type: str
    ) -> List[Dict[str, Any]]:
        """List competitor transactions for region/property type"""
        response = (
            self.client.table("competitor_transactions")
            .select("*")
            .eq("region", region)
            .eq("property_type", property_type)
            .order("transaction_date", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def list_economic_indicators(self, region: str) -> List[Dict[str, Any]]:
        """List economic indicators for region"""
        response = (
            self.client.table("economic_indicators")
            .select("*")
            .eq("region", region)
            .order("created_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def list_infrastructure_projects(self, region: str) -> List[Dict[str, Any]]:
        """List infrastructure projects for region"""
        response = (
            self.client.table("infrastructure_projects")
            .select("*")
            .eq("region", region)
            .order("created_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def list_absorption_metrics(
        self, region: str, property_type: str
    ) -> List[Dict[str, Any]]:
        """List absorption data for region/property type"""
        response = (
            self.client.table("absorption_data")
            .select("*")
            .eq("region", region)
            .eq("property_type", property_type)
            .order("created_at", desc=True)
            .execute()
        )
        return cast(List[Dict[str, Any]], response.data or [])

    async def get_market_snapshot(self, region: str, property_type: str) -> Dict[str, Any]:
        """Get market snapshot for region/property type"""
        transactions = (
            self.client.table("competitor_transactions")
            .select("*")
            .eq("region", region)
            .eq("property_type", property_type)
            .order("transaction_date", desc=True)
            .limit(10)
            .execute()
        )
        indicators = (
            self.client.table("economic_indicators")
            .select("*")
            .eq("region", region)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        infrastructure = (
            self.client.table("infrastructure_projects")
            .select("*")
            .eq("region", region)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        absorption = (
            self.client.table("absorption_data")
            .select("*")
            .eq("region", region)
            .eq("property_type", property_type)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        return {
            "competitor_transactions": cast(List[Dict[str, Any]], transactions.data or []),
            "economic_indicators": cast(List[Dict[str, Any]], indicators.data or []),
            "infrastructure_projects": cast(List[Dict[str, Any]], infrastructure.data or []),
            "absorption_data": cast(List[Dict[str, Any]], absorption.data or []),
        }


class InMemoryDatabaseManager:
    """In-memory database manager for local development and testing."""

    def __init__(self):
        self._store: Dict[str, List[Dict[str, Any]]] = {
            "projects": [],
            "agent_outputs": [],
            "tasks": [],
            "documents": [],
            "deal_rooms": [],
            "deal_room_members": [],
            "deal_room_messages": [],
            "deal_room_artifacts": [],
            "deal_room_artifact_versions": [],
            "deal_room_events": [],
            "citations": [],
            "claim_links": [],
            "scenarios": [],
            "scenario_runs": [],
            "export_jobs": [],
            "ingestion_jobs": [],
            "screening_playbooks": [],
            "screening_runs": [],
            "screening_scores": [],
            "screening_field_values": [],
            "screening_overrides": [],
            "tone_profiles": [],
            "user_settings": [],
            "screener_listings": [],
            "screener_criteria": [],
            "screener_alerts": [],
            "dd_deals": [],
            "dd_documents": [],
            "dd_checklist_items": [],
            "dd_red_flags": [],
            "permits": [],
            "zoning_analysis": [],
            "agenda_items": [],
            "policy_changes": [],
            "competitor_transactions": [],
            "economic_indicators": [],
            "infrastructure_projects": [],
            "absorption_data": [],
        }

    def _now(self) -> str:
        return datetime.utcnow().isoformat()

    def _serialize_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return cast(Dict[str, Any], json.loads(json.dumps(payload, cls=JSONEncoder)))

    def _insert(self, table: str, data: Dict[str, Any]) -> Dict[str, Any]:
        record = dict(data)
        record.setdefault("id", str(uuid.uuid4()))
        record.setdefault("created_at", self._now())
        self._store[table].append(record)
        return record

    def _update(self, table: str, record_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        for record in self._store[table]:
            if record.get("id") == record_id:
                record.update(updates)
                record["updated_at"] = self._now()
                return record
        return {}

    def _filter(self, table: str, **filters: Any) -> List[Dict[str, Any]]:
        records = self._store[table]
        for key, value in filters.items():
            records = [record for record in records if record.get(key) == value]
        return records

    def _sort_value(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value)

    def _sorted(self, records: List[Dict[str, Any]], key: str, desc: bool = False) -> List[Dict[str, Any]]:
        return sorted(records, key=lambda r: self._sort_value(r.get(key)), reverse=desc)

    # ============================================
    # Project Operations
    # ============================================

    async def create_project(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("projects", project_data)

    async def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("projects", id=project_id)
        return records[0] if records else None

    async def update_project(self, project_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        return self._update("projects", project_id, updates)

    async def list_projects(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        records = self._store["projects"]
        if status:
            records = [record for record in records if record.get("status") == status]
        return self._sorted(records, "created_at", desc=True)

    # ============================================
    # Agent Output Operations
    # ============================================

    async def save_agent_output(self, output_data: Dict[str, Any]) -> Dict[str, Any]:
        if "output_data" in output_data:
            output_data["output_data"] = json.loads(
                json.dumps(output_data["output_data"], cls=JSONEncoder)
            )
        if "input_data" in output_data:
            output_data["input_data"] = json.loads(
                json.dumps(output_data["input_data"], cls=JSONEncoder)
            )
        return self._insert("agent_outputs", output_data)

    async def get_agent_outputs(
        self, project_id: str, agent_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        records = self._filter("agent_outputs", project_id=project_id)
        if agent_name:
            records = [record for record in records if record.get("agent_name") == agent_name]
        return self._sorted(records, "created_at", desc=True)

    async def get_latest_agent_output(
        self, project_id: str, agent_name: str, task_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        records = self._filter("agent_outputs", project_id=project_id, agent_name=agent_name)
        if task_type:
            records = [record for record in records if record.get("task_type") == task_type]
        records = self._sorted(records, "created_at", desc=True)
        return records[0] if records else None

    # ============================================
    # Task Operations
    # ============================================

    async def create_task(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("tasks", task_data)

    async def update_task_status(
        self, task_id: str, status: str, completed_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        updates = {"status": status}
        if completed_at:
            updates["completed_at"] = completed_at.isoformat()
        return self._update("tasks", task_id, updates)

    async def get_project_tasks(self, project_id: str) -> List[Dict[str, Any]]:
        records = self._filter("tasks", project_id=project_id)
        return self._sorted(records, "due_date")

    async def get_pending_tasks(self, assigned_agent: Optional[str] = None) -> List[Dict[str, Any]]:
        records = [record for record in self._store["tasks"] if record.get("status") == "pending"]
        if assigned_agent:
            records = [record for record in records if record.get("assigned_agent") == assigned_agent]
        return self._sorted(records, "due_date")

    # ============================================
    # Document Operations
    # ============================================

    async def save_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("documents", document_data)

    async def update_document(self, document_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        return self._update("documents", document_id, updates)

    async def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("documents", id=document_id)
        return records[0] if records else None

    async def get_project_documents(self, project_id: str) -> List[Dict[str, Any]]:
        return self._filter("documents", project_id=project_id)

    async def get_document_by_type(
        self, project_id: str, document_type: str
    ) -> Optional[Dict[str, Any]]:
        records = [
            record
            for record in self._store["documents"]
            if record.get("project_id") == project_id and record.get("document_type") == document_type
        ]
        return records[0] if records else None

    # ============================================
    # Deal Room Operations
    # ============================================

    async def create_deal_room(self, room_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("deal_rooms", room_data)

    async def get_deal_room(self, room_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("deal_rooms", id=room_id)
        return records[0] if records else None

    async def list_deal_rooms(self, project_id: str) -> List[Dict[str, Any]]:
        records = self._filter("deal_rooms", project_id=project_id)
        return self._sorted(records, "created_at", desc=True)

    async def add_deal_room_member(self, member_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("deal_room_members", member_data)

    async def get_deal_room_members(self, room_id: str) -> List[Dict[str, Any]]:
        return self._filter("deal_room_members", room_id=room_id)

    async def add_deal_room_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        if "attachments" in message_data:
            message_data["attachments"] = self._serialize_payload(
                cast(Dict[str, Any], {"attachments": message_data["attachments"]})
            ).get("attachments", [])
        return self._insert("deal_room_messages", message_data)

    async def list_deal_room_messages(self, room_id: str) -> List[Dict[str, Any]]:
        records = self._filter("deal_room_messages", room_id=room_id)
        return self._sorted(records, "created_at", desc=False)

    async def create_deal_room_artifact(self, artifact_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("deal_room_artifacts", artifact_data)

    async def add_deal_room_artifact_version(self, version_data: Dict[str, Any]) -> Dict[str, Any]:
        if "content_json" in version_data:
            version_data["content_json"] = self._serialize_payload(
                cast(Dict[str, Any], version_data["content_json"])
            )
        return self._insert("deal_room_artifact_versions", version_data)

    async def update_deal_room_artifact(
        self, artifact_id: str, updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        return self._update("deal_room_artifacts", artifact_id, updates)

    async def list_deal_room_artifacts(self, room_id: str) -> List[Dict[str, Any]]:
        records = self._filter("deal_room_artifacts", room_id=room_id)
        return self._sorted(records, "created_at", desc=True)

    async def add_deal_room_event(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
        if "payload" in event_data:
            event_data["payload"] = self._serialize_payload(
                cast(Dict[str, Any], event_data["payload"])
            )
        return self._insert("deal_room_events", event_data)

    async def list_deal_room_events(self, room_id: str) -> List[Dict[str, Any]]:
        records = self._filter("deal_room_events", room_id=room_id)
        return self._sorted(records, "created_at", desc=True)

    # ============================================
    # Citations & Claims
    # ============================================

    async def create_citation(self, citation_data: Dict[str, Any]) -> Dict[str, Any]:
        if "metadata" in citation_data:
            citation_data["metadata"] = self._serialize_payload(
                cast(Dict[str, Any], citation_data["metadata"])
            )
        return self._insert("citations", citation_data)

    async def create_claim_link(self, claim_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("claim_links", claim_data)

    async def list_citations(self, project_id: str) -> List[Dict[str, Any]]:
        records = self._filter("citations", project_id=project_id)
        return self._sorted(records, "accessed_at", desc=True)

    # ============================================
    # Scenario Operations
    # ============================================

    async def create_scenario(self, scenario_data: Dict[str, Any]) -> Dict[str, Any]:
        if "base_assumptions" in scenario_data:
            scenario_data["base_assumptions"] = self._serialize_payload(
                cast(Dict[str, Any], scenario_data["base_assumptions"])
            )
        return self._insert("scenarios", scenario_data)

    async def create_scenario_run(self, run_data: Dict[str, Any]) -> Dict[str, Any]:
        if "delta_assumptions" in run_data:
            run_data["delta_assumptions"] = self._serialize_payload(
                cast(Dict[str, Any], run_data["delta_assumptions"])
            )
        if "results" in run_data:
            run_data["results"] = self._serialize_payload(cast(Dict[str, Any], run_data["results"]))
        return self._insert("scenario_runs", run_data)

    async def list_scenario_runs(self, scenario_id: str) -> List[Dict[str, Any]]:
        records = self._filter("scenario_runs", scenario_id=scenario_id)
        return self._sorted(records, "created_at", desc=True)

    # ============================================
    # Export Jobs
    # ============================================

    async def create_export_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        if "payload" in job_data:
            job_data["payload"] = self._serialize_payload(cast(Dict[str, Any], job_data["payload"]))
        if "output_files" in job_data:
            job_data["output_files"] = self._serialize_payload(
                cast(Dict[str, Any], {"output_files": job_data["output_files"]})
            ).get("output_files", [])
        return self._insert("export_jobs", job_data)

    async def update_export_job(self, job_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if "payload" in updates:
            updates["payload"] = self._serialize_payload(cast(Dict[str, Any], updates["payload"]))
        if "output_files" in updates:
            updates["output_files"] = self._serialize_payload(
                cast(Dict[str, Any], {"output_files": updates["output_files"]})
            ).get("output_files", [])
        return self._update("export_jobs", job_id, updates)

    async def get_export_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("export_jobs", id=job_id)
        return records[0] if records else None

    async def list_export_jobs(self, statuses: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        records = self._store["export_jobs"]
        if statuses:
            records = [record for record in records if record.get("status") in statuses]
        return self._sorted(records, "created_at", desc=True)

    # ============================================
    # Ingestion Jobs
    # ============================================

    async def create_ingestion_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        if "extracted_data" in job_data:
            job_data["extracted_data"] = self._serialize_payload(
                cast(Dict[str, Any], job_data["extracted_data"])
            )
        return self._insert("ingestion_jobs", job_data)

    async def update_ingestion_job(self, job_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if "extracted_data" in updates:
            updates["extracted_data"] = self._serialize_payload(
                cast(Dict[str, Any], updates["extracted_data"])
            )
        return self._update("ingestion_jobs", job_id, updates)

    async def get_ingestion_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("ingestion_jobs", id=job_id)
        return records[0] if records else None

    async def list_ingestion_jobs(self, statuses: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        records = self._store["ingestion_jobs"]
        if statuses:
            records = [record for record in records if record.get("status") in statuses]
        return self._sorted(records, "created_at", desc=True)

    # ============================================
    # Screening Operations
    # ============================================

    async def get_active_screening_playbook(self) -> Optional[Dict[str, Any]]:
        records = [record for record in self._store["screening_playbooks"] if record.get("is_active")]
        records = self._sorted(records, "version", desc=True)
        return records[0] if records else None

    async def list_screening_playbooks(self) -> List[Dict[str, Any]]:
        return self._sorted(self._store["screening_playbooks"], "version", desc=True)

    async def create_screening_playbook(
        self, settings_payload: Dict[str, Any], created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        if settings_payload:
            settings_payload = self._serialize_payload(settings_payload)
        return self._insert(
            "screening_playbooks",
            {
                "settings": settings_payload,
                "created_by": created_by,
                "is_active": False,
            },
        )

    async def create_screening_playbook_version(
        self,
        version: int,
        settings_payload: Dict[str, Any],
        created_by: Optional[str] = None,
        activate: bool = True,
    ) -> Dict[str, Any]:
        if settings_payload:
            settings_payload = self._serialize_payload(settings_payload)
        if activate:
            for record in self._store["screening_playbooks"]:
                record["is_active"] = False
        return self._insert(
            "screening_playbooks",
            {
                "version": version,
                "settings": settings_payload,
                "created_by": created_by,
                "is_active": activate,
            },
        )

    async def activate_screening_playbook(self, playbook_id: str) -> Optional[Dict[str, Any]]:
        for record in self._store["screening_playbooks"]:
            record["is_active"] = record.get("id") == playbook_id
        return await self.get_active_screening_playbook()

    async def create_screening_run(self, run_data: Dict[str, Any]) -> Dict[str, Any]:
        if "playbook_snapshot" in run_data:
            run_data["playbook_snapshot"] = self._serialize_payload(
                cast(Dict[str, Any], run_data["playbook_snapshot"])
            )
        return self._insert("screening_runs", run_data)

    async def update_screening_run(self, run_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if "playbook_snapshot" in updates:
            updates["playbook_snapshot"] = self._serialize_payload(
                cast(Dict[str, Any], updates["playbook_snapshot"])
            )
        return self._update("screening_runs", run_id, updates)

    async def get_screening_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("screening_runs", id=run_id)
        return records[0] if records else None

    async def list_screening_runs(
        self, project_id: Optional[str] = None, statuses: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        records = self._store["screening_runs"]
        if project_id:
            records = [record for record in records if record.get("project_id") == project_id]
        if statuses:
            records = [record for record in records if record.get("status") in statuses]
        return self._sorted(records, "created_at", desc=True)

    async def upsert_screening_score(self, score_data: Dict[str, Any]) -> Dict[str, Any]:
        run_id = score_data.get("screening_run_id")
        if run_id:
            existing = self._filter("screening_scores", screening_run_id=run_id)
            if existing:
                record = existing[0]
                record.update(score_data)
                record["updated_at"] = self._now()
                return record
        return self._insert("screening_scores", score_data)

    async def get_screening_score(self, run_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("screening_scores", screening_run_id=run_id)
        return records[0] if records else None

    async def upsert_screening_field_values(
        self, field_values: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for value in field_values:
            entry = dict(value)
            if "value_json" in entry:
                entry["value_json"] = self._serialize_payload(
                    cast(Dict[str, Any], entry["value_json"])
                )
            run_id = entry.get("screening_run_id")
            field_key = entry.get("field_key")
            if run_id and field_key:
                existing = [
                    record
                    for record in self._store["screening_field_values"]
                    if record.get("screening_run_id") == run_id
                    and record.get("field_key") == field_key
                ]
                if existing:
                    record = existing[0]
                    record.update(entry)
                    record["updated_at"] = self._now()
                    results.append(record)
                    continue
            results.append(self._insert("screening_field_values", entry))
        return results

    async def list_screening_field_values(self, run_id: str) -> List[Dict[str, Any]]:
        return self._filter("screening_field_values", screening_run_id=run_id)

    async def create_screening_override(self, override_data: Dict[str, Any]) -> Dict[str, Any]:
        if "value_json" in override_data:
            override_data["value_json"] = self._serialize_payload(
                cast(Dict[str, Any], override_data["value_json"])
            )
        return self._insert("screening_overrides", override_data)

    async def list_screening_overrides(
        self, project_id: str, scope: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        records = self._store["screening_overrides"]
        records = [record for record in records if record.get("project_id") == project_id]
        if scope:
            records = [record for record in records if record.get("scope") == scope]
        return self._sorted(records, "created_at", desc=True)

    # ============================================
    # Tone Profiles & Settings
    # ============================================

    async def create_tone_profile(self, profile_data: Dict[str, Any]) -> Dict[str, Any]:
        if "style_guidelines" in profile_data:
            profile_data["style_guidelines"] = self._serialize_payload(
                cast(Dict[str, Any], profile_data["style_guidelines"])
            )
        return self._insert("tone_profiles", profile_data)

    async def list_tone_profiles(self) -> List[Dict[str, Any]]:
        return self._sorted(self._store["tone_profiles"], "created_at", desc=True)

    async def upsert_user_settings(self, settings_data: Dict[str, Any]) -> Dict[str, Any]:
        user_id = cast(str, settings_data.get("user_id"))
        if not user_id:
            return {}
        existing = self._filter("user_settings", user_id=user_id)
        if existing:
            record = existing[0]
            record.update(settings_data)
            record["updated_at"] = self._now()
            return record
        return self._insert("user_settings", settings_data)

    # ============================================
    # Deal Screener Operations
    # ============================================

    async def create_screener_listing(self, listing_data: Dict[str, Any]) -> Dict[str, Any]:
        if "listing_data" in listing_data:
            listing_data["listing_data"] = self._serialize_payload(
                cast(Dict[str, Any], listing_data["listing_data"])
            )
        return self._insert("screener_listings", listing_data)

    async def get_screener_listing(self, listing_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("screener_listings", id=listing_id)
        return records[0] if records else None

    async def update_screener_listing(
        self, listing_id: str, updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        if "score_detail" in updates:
            updates["score_detail"] = self._serialize_payload(
                cast(Dict[str, Any], updates["score_detail"])
            )
        return self._update("screener_listings", listing_id, updates)

    async def list_screener_listings(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        records = self._store["screener_listings"]
        if status:
            records = [record for record in records if record.get("status") == status]
        return self._sorted(records, "created_at", desc=True)

    async def create_screener_criteria(self, criteria_data: Dict[str, Any]) -> Dict[str, Any]:
        criteria_data["weights"] = self._serialize_payload(
            cast(Dict[str, Any], criteria_data.get("weights") or {})
        )
        criteria_data["thresholds"] = self._serialize_payload(
            cast(Dict[str, Any], criteria_data.get("thresholds") or {})
        )
        criteria_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], criteria_data.get("metadata") or {})
        )
        return self._insert("screener_criteria", criteria_data)

    async def get_screener_criteria(self, criteria_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("screener_criteria", id=criteria_id)
        return records[0] if records else None

    async def create_screener_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("screener_alerts", alert_data)

    async def list_screener_alerts(
        self, listing_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        records = self._store["screener_alerts"]
        if listing_id:
            records = [record for record in records if record.get("listing_id") == listing_id]
        return self._sorted(records, "created_at", desc=True)

    # ============================================
    # Due Diligence Operations
    # ============================================

    async def create_dd_deal(self, deal_data: Dict[str, Any]) -> Dict[str, Any]:
        deal_data["key_dates"] = self._serialize_payload(
            cast(Dict[str, Any], deal_data.get("key_dates") or {})
        )
        deal_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], deal_data.get("metadata") or {})
        )
        return self._insert("dd_deals", deal_data)

    async def get_dd_deal(self, dd_deal_id: str) -> Optional[Dict[str, Any]]:
        records = self._filter("dd_deals", id=dd_deal_id)
        return records[0] if records else None

    async def create_dd_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        document_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], document_data.get("metadata") or {})
        )
        return self._insert("dd_documents", document_data)

    async def add_dd_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        return await self.create_dd_document(document_data)

    async def list_dd_documents(self, dd_deal_id: str) -> List[Dict[str, Any]]:
        return self._filter("dd_documents", dd_deal_id=dd_deal_id)

    async def create_dd_checklist_item(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        item_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], item_data.get("metadata") or {})
        )
        return self._insert("dd_checklist_items", item_data)

    async def add_dd_checklist_items(
        self, dd_deal_id: str, items: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        created: List[Dict[str, Any]] = []
        for item in items:
            entry = {"dd_deal_id": dd_deal_id, **item}
            entry["metadata"] = self._serialize_payload(
                cast(Dict[str, Any], entry.get("metadata") or {})
            )
            created.append(self._insert("dd_checklist_items", entry))
        return created

    async def list_dd_checklist_items(self, dd_deal_id: str) -> List[Dict[str, Any]]:
        return self._filter("dd_checklist_items", dd_deal_id=dd_deal_id)

    async def create_dd_red_flag(self, red_flag_data: Dict[str, Any]) -> Dict[str, Any]:
        red_flag_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], red_flag_data.get("metadata") or {})
        )
        return self._insert("dd_red_flags", red_flag_data)

    async def add_dd_red_flags(
        self, dd_deal_id: str, flags: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        created: List[Dict[str, Any]] = []
        for flag in flags:
            entry = {"dd_deal_id": dd_deal_id, **flag}
            entry["metadata"] = self._serialize_payload(
                cast(Dict[str, Any], entry.get("metadata") or {})
            )
            created.append(self._insert("dd_red_flags", entry))
        return created

    async def list_dd_red_flags(self, dd_deal_id: str) -> List[Dict[str, Any]]:
        return self._filter("dd_red_flags", dd_deal_id=dd_deal_id)

    # ============================================
    # Entitlements Operations
    # ============================================

    async def create_permit_record(self, permit_data: Dict[str, Any]) -> Dict[str, Any]:
        return self._insert("permits", permit_data)

    async def list_permits(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        records = self._store["permits"]
        if project_id:
            records = [record for record in records if record.get("project_id") == project_id]
        return self._sorted(records, "created_at", desc=True)

    async def create_zoning_analysis(self, analysis_data: Dict[str, Any]) -> Dict[str, Any]:
        analysis_data["analysis"] = self._serialize_payload(
            cast(Dict[str, Any], analysis_data.get("analysis") or {})
        )
        return self._insert("zoning_analysis", analysis_data)

    async def create_agenda_item(self, item_data: Dict[str, Any]) -> Dict[str, Any]:
        item_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], item_data.get("metadata") or {})
        )
        return self._insert("agenda_items", item_data)

    async def list_agenda_items(self) -> List[Dict[str, Any]]:
        return self._sorted(self._store["agenda_items"], "date", desc=True)

    async def create_policy_change(self, policy_data: Dict[str, Any]) -> Dict[str, Any]:
        policy_data["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], policy_data.get("metadata") or {})
        )
        return self._insert("policy_changes", policy_data)

    async def list_policy_changes(self) -> List[Dict[str, Any]]:
        return self._sorted(self._store["policy_changes"], "effective_date", desc=True)

    # ============================================
    # Market Intelligence Operations
    # ============================================

    async def create_competitor_transaction(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        payload["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], payload.get("metadata") or {})
        )
        return self._insert("competitor_transactions", payload)

    async def create_economic_indicator(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        payload["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], payload.get("metadata") or {})
        )
        return self._insert("economic_indicators", payload)

    async def create_infrastructure_project(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        payload["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], payload.get("metadata") or {})
        )
        return self._insert("infrastructure_projects", payload)

    async def create_absorption_metric(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        payload["metadata"] = self._serialize_payload(
            cast(Dict[str, Any], payload.get("metadata") or {})
        )
        return self._insert("absorption_data", payload)

    async def list_competitor_transactions(
        self, region: str, property_type: str
    ) -> List[Dict[str, Any]]:
        records = [
            record
            for record in self._store["competitor_transactions"]
            if record.get("region") == region and record.get("property_type") == property_type
        ]
        return self._sorted(records, "transaction_date", desc=True)

    async def list_economic_indicators(self, region: str) -> List[Dict[str, Any]]:
        records = [
            record for record in self._store["economic_indicators"] if record.get("region") == region
        ]
        return self._sorted(records, "created_at", desc=True)

    async def list_infrastructure_projects(self, region: str) -> List[Dict[str, Any]]:
        records = [
            record
            for record in self._store["infrastructure_projects"]
            if record.get("region") == region
        ]
        return self._sorted(records, "created_at", desc=True)

    async def list_absorption_metrics(
        self, region: str, property_type: str
    ) -> List[Dict[str, Any]]:
        records = [
            record
            for record in self._store["absorption_data"]
            if record.get("region") == region and record.get("property_type") == property_type
        ]
        return self._sorted(records, "created_at", desc=True)

    async def get_market_snapshot(self, region: str, property_type: str) -> Dict[str, Any]:
        return {
            "competitor_transactions": (await self.list_competitor_transactions(region, property_type))[
                :10
            ],
            "economic_indicators": (await self.list_economic_indicators(region))[:10],
            "infrastructure_projects": (await self.list_infrastructure_projects(region))[:10],
            "absorption_data": (await self.list_absorption_metrics(region, property_type))[:10],
        }


# Global database manager instance
USE_IN_MEMORY_DB = os.getenv("USE_IN_MEMORY_DB", "").lower() in {"1", "true", "yes"}
db = InMemoryDatabaseManager() if USE_IN_MEMORY_DB else DatabaseManager()
