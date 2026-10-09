from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.database.session import engine
from app.database.base import Base

from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.projects import router as projects_router
from app.api.members import router as members_router
from app.api.files import router as files_router
from app.api.upload import router as upload_router
from app.api.execution import router as execution_router
from app.api.history import router as history_router
from app.api.chat import router as chat_router
from app.api.terminal import router as terminal_router

from app.websocket.collaboration_ws import router as collaboration_ws_router
from app.websocket.chat_ws import router as chat_ws_router
from app.websocket.redis_pubsub import redis_pubsub_manager

setup_logging()

# Auto-create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Mirage IDE - Collaborative Cloud Development Environment Backend",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await redis_pubsub_manager.connect()
    logger.info(f"{settings.PROJECT_NAME} Backend Microservices Started Successfully.")

# Register API Routers
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(members_router, prefix="/api")
app.include_router(files_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(execution_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(terminal_router, prefix="/api")

# Register WebSockets
app.include_router(collaboration_ws_router)
app.include_router(chat_ws_router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": "1.0.0",
        "docs": "/api/docs"
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "database": "connected"
    }
