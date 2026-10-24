"""Skill bank logic: add a custom skill to the shared global `skills` table.

The `skills` table has no user_id and users only have read access (RLS), so
writes go through the admin client here.
"""
import re

from fastapi import HTTPException, status

from app.db.supabase_client import get_admin_client

_SPECIAL_CHARS = set(" .+#-/&_")
_COLUMNS = "id, canonical_name, display_name, category"


def normalize_skill_name(name: str) -> str:
    """Trim, lowercase and collapse inner whitespace: '  Vue   JS ' -> 'vue js'."""
    return re.sub(r"\s+", " ", name.strip()).lower()


def has_only_allowed_chars(name: str) -> bool:
    """Letters, digits, spaces and . + # - / & _ are allowed."""
    return all(ch.isalpha() or ch.isdigit() or ch in _SPECIAL_CHARS for ch in name)


def _first(result) -> dict | None:
    rows = result.data if result is not None else None
    return rows[0] if rows else None


def _find_existing(canonical: str) -> dict | None:
    """Look for a skill by canonical name first, then by alias."""
    client = get_admin_client()
    # Start a fresh query for each lookup; query builders keep their filters.
    row = _first(client.table("skills").select(_COLUMNS)
                 .eq("canonical_name", canonical).limit(1).execute())
    if row:
        return row
    return _first(client.table("skills").select(_COLUMNS)
                  .contains("aliases", [canonical]).limit(1).execute())


def get_or_create_custom_skill(name: str, category: str | None) -> tuple[dict, bool]:
    """Return (skill_row, created). Never creates duplicates."""
    display_name = name.strip()
    canonical = normalize_skill_name(display_name)

    try:
        existing = _find_existing(canonical)
        if existing:
            return existing, False

        try:
            inserted = (
                get_admin_client().table("skills")
                .insert({
                    "canonical_name": canonical,
                    "display_name": display_name,
                    "aliases": [],
                    "category": category,
                })
                .execute()
            )
        except Exception:  # noqa: BLE001
            # Two people may add the same skill at once; the unique constraint
            # rejects the second insert. If the skill now exists, just return it.
            existing = _find_existing(canonical)
            if existing:
                return existing, False
            raise

        row = _first(inserted)
        if not row:
            raise RuntimeError("insert returned no row")
        return row, True
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"[skills] could not save custom skill: {type(exc).__name__}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save the skill"
        ) from exc
