from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.services.ai_providers import default_model_id, list_models

router = APIRouter(prefix="/ai", tags=["ai"])


class AiModelOut(BaseModel):
    id: str  # "<provider>:<model>", send this back as `model_id`
    provider: Literal["groq", "gemini", "openai"]
    provider_label: str
    model: str
    label: str
    available: bool  # true when the server has a key for this provider


class AiModelsOut(BaseModel):
    default: str | None
    models: list[AiModelOut]


@router.get("/models", response_model=AiModelsOut)
def get_ai_models(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """List the AI models a user can pick. Never calls a provider and never returns keys."""
    return AiModelsOut(default=default_model_id(settings), models=list_models(settings))
