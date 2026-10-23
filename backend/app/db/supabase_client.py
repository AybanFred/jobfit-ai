from functools import lru_cache

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache
def get_admin_client() -> Client:
    """Server-side client using the secret/service key.

    It bypasses Row Level Security, so ALWAYS filter by the current user's id
    when you read or write user data with it.
    """
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    return create_client(s.supabase_url, s.supabase_service_key)


def log_activity(user_id: str, action: str, entity: str | None = None,
                 entity_id: str | None = None, metadata: dict | None = None) -> None:
    """Write one row to activity_logs. Failures never break the request."""
    try:
        get_admin_client().table("activity_logs").insert({
            "user_id": user_id,
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "metadata": metadata or {},
        }).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"[activity_log] failed: {exc}")
