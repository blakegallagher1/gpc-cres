"""
Async job queue with retries for background processing.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class QueueJob:
    job_type: str
    payload: Dict[str, Any]
    attempt: int = 0


Handler = Callable[[Dict[str, Any]], Awaitable[None]]
FailureHandler = Callable[[QueueJob, Exception], Awaitable[None]]
RetryHandler = Callable[[QueueJob, Exception, float], Awaitable[None]]


class JobQueue:
    """Simple asyncio-backed job queue with retry/backoff."""

    def __init__(
        self,
        handlers: Dict[str, Handler],
        *,
        worker_count: int = 2,
        max_retries: int = 3,
        base_delay: float = 2.0,
        max_delay: float = 30.0,
        on_fail: Optional[FailureHandler] = None,
        on_retry: Optional[RetryHandler] = None,
    ) -> None:
        self._queue: asyncio.Queue[QueueJob] = asyncio.Queue()
        self._handlers = handlers
        self._worker_count = worker_count
        self._max_retries = max_retries
        self._base_delay = base_delay
        self._max_delay = max_delay
        self._on_fail = on_fail
        self._on_retry = on_retry
        self._workers: list[asyncio.Task[None]] = []
        self._shutdown = asyncio.Event()

    async def start(self) -> None:
        self._shutdown.clear()
        self._workers = [
            asyncio.create_task(self._worker_loop(idx), name=f"job-queue-worker-{idx}")
            for idx in range(self._worker_count)
        ]

    async def stop(self) -> None:
        self._shutdown.set()
        for task in self._workers:
            task.cancel()
        for task in self._workers:
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def enqueue(self, job_type: str, payload: Dict[str, Any], attempt: int = 0) -> None:
        await self._queue.put(QueueJob(job_type=job_type, payload=payload, attempt=attempt))

    async def _worker_loop(self, _worker_id: int) -> None:
        while not self._shutdown.is_set():
            try:
                job = await self._queue.get()
            except asyncio.CancelledError:
                break

            try:
                handler = self._handlers.get(job.job_type)
                if not handler:
                    raise RuntimeError(f"No handler registered for job type: {job.job_type}")
                await handler(job.payload)
            except Exception as exc:  # pylint: disable=broad-exception-caught
                if job.attempt < self._max_retries:
                    delay = min(self._max_delay, self._base_delay * (2**job.attempt))
                    if self._on_retry:
                        await self._on_retry(job, exc, delay)
                    logger.warning(
                        "Job %s failed (attempt %s/%s). Retrying in %.1fs.",
                        job.job_type,
                        job.attempt + 1,
                        self._max_retries,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    await self.enqueue(job.job_type, job.payload, attempt=job.attempt + 1)
                else:
                    logger.error("Job %s failed after retries: %s", job.job_type, exc)
                    if self._on_fail:
                        await self._on_fail(job, exc)
            finally:
                self._queue.task_done()
