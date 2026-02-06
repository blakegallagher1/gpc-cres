"""
Gallagher Property Company - AI Agent System Configuration
"""

import os
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DEFAULT_TAX_LIBRARY_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "prompts",
        "references",
        "IRC_Calculation_Logic_Library_2026.md",
    )
)


@dataclass
class OpenAIConfig:
    """OpenAI API configuration"""

    api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    org_id: Optional[str] = field(default_factory=lambda: os.getenv("OPENAI_ORG_ID"))
    flagship_model: str = field(
        default_factory=lambda: os.getenv("OPENAI_FLAGSHIP_MODEL", "gpt-5.2")
    )
    standard_model: str = field(
        default_factory=lambda: os.getenv("OPENAI_STANDARD_MODEL", "gpt-5.1")
    )
    mini_model: str = field(default_factory=lambda: os.getenv("OPENAI_MINI_MODEL", "gpt-5.2-mini"))

    def __post_init__(self):
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required")


@dataclass
class PerplexityConfig:
    """Perplexity API configuration"""

    api_key: str = field(default_factory=lambda: os.getenv("PERPLEXITY_API_KEY", ""))
    model: str = field(default_factory=lambda: os.getenv("PERPLEXITY_MODEL", "sonar-pro"))

    def __post_init__(self):
        if not self.api_key:
            raise ValueError("PERPLEXITY_API_KEY is required")


@dataclass
class SupabaseConfig:
    """Supabase configuration"""

    url: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    service_key: str = field(
        default_factory=lambda: str(
            os.getenv("SUPABASE_SERVICE_KEY")
            or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or ""
        )
    )
    anon_key: str = field(default_factory=lambda: os.getenv("SUPABASE_ANON_KEY", ""))

    def __post_init__(self):
        if not self.url or not self.service_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY are required"
            )


@dataclass
class GoogleConfig:
    """Google APIs configuration"""

    maps_api_key: str = field(default_factory=lambda: os.getenv("GOOGLE_MAPS_API_KEY", ""))
    places_api_key: str = field(default_factory=lambda: os.getenv("GOOGLE_PLACES_API_KEY", ""))
    sheets_api_key: str = field(default_factory=lambda: os.getenv("GOOGLE_SHEETS_API_KEY", ""))
    drive_api_key: str = field(default_factory=lambda: os.getenv("GOOGLE_DRIVE_API_KEY", ""))


@dataclass
class BackblazeConfig:
    """Backblaze B2 configuration"""

    application_key_id: str = field(default_factory=lambda: os.getenv("B2_APPLICATION_KEY_ID", ""))
    application_key: str = field(default_factory=lambda: os.getenv("B2_APPLICATION_KEY", ""))
    bucket_name: str = field(
        default_factory=lambda: os.getenv("B2_BUCKET_NAME", "gallagher-documents")
    )
    endpoint_url: str = field(default_factory=lambda: os.getenv("B2_ENDPOINT_URL", ""))


@dataclass
class AgentConfig:
    """Agent behavior configuration"""

    max_turns: int = field(default_factory=lambda: int(os.getenv("AGENT_MAX_TURNS", "50")))
    timeout_seconds: int = field(
        default_factory=lambda: int(os.getenv("AGENT_TIMEOUT_SECONDS", "300"))
    )
    enable_tracing: bool = field(
        default_factory=lambda: os.getenv("AGENT_ENABLE_TRACING", "true").lower() == "true"
    )


@dataclass
class MarketConfig:
    """Market-specific configuration"""

    default_region: str = field(
        default_factory=lambda: os.getenv("DEFAULT_MARKET_REGION", "East Baton Rouge Parish")
    )
    default_state: str = field(default_factory=lambda: os.getenv("DEFAULT_STATE", "Louisiana"))
    default_msa: str = field(
        default_factory=lambda: os.getenv("DEFAULT_MSA", "Greater Baton Rouge")
    )


@dataclass
class TaxConfig:
    """Tax reference configuration"""

    library_path: str = field(
        default_factory=lambda: os.getenv("TAX_LIBRARY_PATH", DEFAULT_TAX_LIBRARY_PATH)
    )


@dataclass
class FeatureFlags:
    """Feature flags"""

    enable_web_search: bool = field(
        default_factory=lambda: os.getenv("ENABLE_WEB_SEARCH", "true").lower() == "true"
    )
    enable_file_search: bool = field(
        default_factory=lambda: os.getenv("ENABLE_FILE_SEARCH", "true").lower() == "true"
    )
    enable_code_interpreter: bool = field(
        default_factory=lambda: os.getenv("ENABLE_CODE_INTERPRETER", "true").lower() == "true"
    )


@dataclass
class Settings:
    """Application settings"""

    openai: OpenAIConfig = field(default_factory=OpenAIConfig)
    perplexity: PerplexityConfig = field(default_factory=PerplexityConfig)
    supabase: SupabaseConfig = field(default_factory=SupabaseConfig)
    google: GoogleConfig = field(default_factory=GoogleConfig)
    backblaze: BackblazeConfig = field(default_factory=BackblazeConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    market: MarketConfig = field(default_factory=MarketConfig)
    tax: TaxConfig = field(default_factory=TaxConfig)
    features: FeatureFlags = field(default_factory=FeatureFlags)

    # Application settings
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    app_debug: bool = field(
        default_factory=lambda: os.getenv("APP_DEBUG", "true").lower() == "true"
    )
    app_log_level: str = field(default_factory=lambda: os.getenv("APP_LOG_LEVEL", "INFO"))

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


# Global settings instance
settings = Settings()
