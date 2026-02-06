"""
Gallagher Property Company - File Storage Tools (Backblaze B2)
"""

import io
import mimetypes
from pathlib import Path
from typing import BinaryIO, Optional

from b2sdk.v2 import B2Api, InMemoryAccountInfo  # pylint: disable=import-error

from config.settings import settings


class StorageManager:
    """Backblaze B2 storage manager"""

    def __init__(self):
        self.key_id = settings.backblaze.application_key_id
        self.application_key = settings.backblaze.application_key
        self.bucket_name = settings.backblaze.bucket_name
        self._b2_api: Optional[B2Api] = None
        self._bucket = None

    def _get_b2_api(self) -> B2Api:
        """Get or create B2 API client"""
        if self._b2_api is None:
            info = InMemoryAccountInfo()
            self._b2_api = B2Api(info)
            self._b2_api.authorize_account("production", self.key_id, self.application_key)
        return self._b2_api

    def _get_bucket(self):
        """Get or retrieve bucket"""
        if self._bucket is None:
            b2_api = self._get_b2_api()
            self._bucket = b2_api.get_bucket_by_name(self.bucket_name)
        return self._bucket

    async def upload_file(
        self,
        file_data: BinaryIO,
        file_name: str,
        project_id: str,
        content_type: Optional[str] = None,
    ) -> dict:
        """
        Upload a file to B2

        Args:
            file_data: File data as bytes or file-like object
            file_name: Name of the file
            project_id: Project ID for organization
            content_type: MIME type (auto-detected if not provided)

        Returns:
            Upload result with file URL and metadata
        """
        if not content_type:
            content_type, _ = mimetypes.guess_type(file_name)
            if not content_type:
                content_type = "application/octet-stream"

        # Organize files by project
        b2_file_name = f"projects/{project_id}/{file_name}"

        bucket = self._get_bucket()

        # Upload file
        result = bucket.upload_bytes(
            file_data.read() if hasattr(file_data, "read") else file_data,
            file_name=b2_file_name,
            content_type=content_type,
        )

        return {
            "file_id": result.id_,
            "file_name": result.file_name,
            "content_type": content_type,
            "size": result.size,
            "upload_timestamp": result.upload_timestamp,
            "url": f"https://f000.backblazeb2.com/file/{self.bucket_name}/{b2_file_name}",
        }

    async def upload_document(
        self, file_path: str, project_id: str, document_type: str, custom_name: Optional[str] = None
    ) -> dict:
        """
        Upload a document file

        Args:
            file_path: Path to local file
            project_id: Project ID
            document_type: Type of document (e.g., 'psa', 'lease', 'om')
            custom_name: Optional custom file name

        Returns:
            Upload result
        """
        path = Path(file_path)
        file_name = custom_name or path.name

        # Add document type prefix
        file_name = f"{document_type}/{file_name}"

        with open(file_path, "rb") as f:
            return await self.upload_file(f, file_name, project_id)

    async def download_file(self, file_name: str) -> bytes:
        """Download a file from B2"""
        bucket = self._get_bucket()

        # Download file to memory
        download = bucket.download_file_by_name(file_name)
        io_buffer = io.BytesIO()
        download.save(io_buffer)
        return io_buffer.getvalue()

    async def delete_file(self, file_name: str) -> bool:
        """Delete a file from B2"""
        try:
            bucket = self._get_bucket()
            file_version = bucket.get_file_info_by_name(file_name)
            bucket.delete_file_version(file_version.id_, file_name)
            return True
        except Exception as e:  # pylint: disable=broad-exception-caught
            print(f"Error deleting file: {e}")
            return False

    async def list_project_files(self, project_id: str) -> list:
        """List all files for a project"""
        bucket = self._get_bucket()
        prefix = f"projects/{project_id}/"

        files = []
        for file_version, _ in bucket.ls(folder_to_list=prefix, recursive=True):
            if file_version:
                files.append(
                    {
                        "file_id": file_version.id_,
                        "file_name": file_version.file_name,
                        "size": file_version.size,
                        "upload_timestamp": file_version.upload_timestamp,
                        "url": f"https://f000.backblazeb2.com/file/{self.bucket_name}/{file_version.file_name}",
                    }
                )

        return files

    async def generate_download_url(self, file_name: str, valid_duration: int = 3600) -> str:
        """Generate a presigned download URL"""
        _ = valid_duration
        b2_api = self._get_b2_api()
        download_url = b2_api.get_download_url_for_file_name(
            bucket_name=self.bucket_name, file_name=file_name
        )
        return str(download_url)


# Global storage manager instance
storage = StorageManager()
