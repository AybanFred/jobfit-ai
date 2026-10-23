from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.db.supabase_client import get_admin_client, log_activity

router = APIRouter()


@router.get("/health", tags=["system"])
def health(settings: Settings = Depends(get_settings)):
    """Public check that the API is running and configured."""
    return {
        "status": "ok",
        "env": settings.app_env,
        "supabase_configured": bool(settings.supabase_url and settings.supabase_service_key),
        "ai_configured": bool(settings.anthropic_api_key),
    }


@router.get("/me", tags=["auth"])
def me(user: CurrentUser = Depends(get_current_user)):
    """Protected route: proves the app's login token is accepted by the backend."""
    profile = (
        get_admin_client().table("profiles")
        .select("*").eq("id", user.id).maybe_single().execute()
    )
    log_activity(user.id, "auth.me_checked")
    return {"user_id": user.id, "email": user.email,
            "profile": profile.data if profile else None}
