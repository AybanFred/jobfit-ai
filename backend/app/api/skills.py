from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, StringConstraints, field_validator

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import log_activity
from app.services.skills import get_or_create_custom_skill, has_only_allowed_chars

router = APIRouter(prefix="/skills", tags=["skills"])


class CustomSkillIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
    category: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] | None = None

    @field_validator("name")
    @classmethod
    def _check_name_chars(cls, value: str) -> str:
        if not has_only_allowed_chars(value):
            raise ValueError(
                "Skill name may only contain letters, digits, spaces and . + # - / & _"
            )
        return value

    @field_validator("category")
    @classmethod
    def _empty_category_is_none(cls, value: str | None) -> str | None:
        return value or None


class CustomSkillOut(BaseModel):
    id: str
    canonical_name: str
    display_name: str
    category: str | None = None
    created: bool


@router.post("/custom", response_model=CustomSkillOut)
def add_custom_skill(body: CustomSkillIn, user: CurrentUser = Depends(get_current_user)):
    """Add a skill that is not in the global bank (or return the existing one)."""
    skill, created = get_or_create_custom_skill(body.name, body.category)
    if created:
        log_activity(user.id, "skill.created", entity="skill", entity_id=skill["id"],
                     metadata={"name": skill["display_name"]})
    return CustomSkillOut(
        id=str(skill["id"]),
        canonical_name=skill["canonical_name"],
        display_name=skill["display_name"],
        category=skill.get("category"),
        created=created,
    )
