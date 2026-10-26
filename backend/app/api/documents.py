from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.db.supabase_client import log_activity
from app.services import documents

router = APIRouter(prefix="/documents", tags=["documents"])


class ExportIn(BaseModel):
    format: Literal["docx", "pdf"]


class ExportOut(BaseModel):
    url: str  # signed download URL, valid for `expires_in` seconds
    file_name: str  # e.g. "Jane_Doe_Resume_Acme.pdf"
    expires_in: int


@router.post("/{doc_id}/export", response_model=ExportOut)
def export_document(doc_id: UUID, body: ExportIn,
                    user: CurrentUser = Depends(get_current_user)):
    """Create a Harvard-style DOCX or PDF from a saved tailored document and return
    a short-lived download link. Exporting again replaces the previous file."""
    result = documents.export_document(user.id, str(doc_id), body.format)  # 404 / 422 / 500
    log_activity(user.id, "doc.exported", entity="document", entity_id=str(doc_id),
                 metadata={"type": result["type"], "format": body.format})
    return ExportOut(url=result["url"], file_name=result["file_name"],
                     expires_in=result["expires_in"])
