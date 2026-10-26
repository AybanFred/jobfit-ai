from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ai_models import router as ai_models_router
from app.api.applications import router as applications_router
from app.api.documents import router as documents_router
from app.api.jobs import router as jobs_router
from app.api.routes import router
from app.api.profile_import import router as profile_import_router
from app.api.resumes import router as resumes_router
from app.api.skills import router as skills_router
from app.api.tailor import router as tailor_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(skills_router, prefix="/api/v1")
app.include_router(profile_import_router, prefix="/api/v1")
app.include_router(ai_models_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(resumes_router, prefix="/api/v1")
app.include_router(tailor_router, prefix="/api/v1")
app.include_router(applications_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"name": settings.app_name, "docs": "/docs"}
