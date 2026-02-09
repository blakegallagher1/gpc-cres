"""
Pytest configuration for the Gallagher Property Company agent system.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Provide dummy credentials for settings validation during tests.
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("PERPLEXITY_API_KEY", "test-perplexity-key")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-supabase-service-key")
