from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, loaded from environment variables or the .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    app_name: str = "JobFit AI API"

    supabase_url: str = ""
    supabase_service_key: str = ""
    supabase_jwt_secret: str = ""  # legacy HS256 projects only

    cors_origins: str = "http://localhost:8100,http://localhost:5173"

    anthropic_api_key: str = ""  # reserved for Phase 3

    # Free-tier AI providers used by resume import. Empty key = provider not set up.
    groq_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""
    # Models the user may choose (comma-separated). Model IDs change over time, so
    # they live in env, not in code. Only these are ever sent to a provider.
    groq_models: str = "openai/gpt-oss-120b,openai/gpt-oss-20b"
    gemini_models: str = "gemini-3.8-flash,gemini-3.5-flash-lite"
    openai_models: str = "gpt-4o-mini"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
