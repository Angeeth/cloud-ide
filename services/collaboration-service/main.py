from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from shared.common.logging import setup_logging
from websocket.collaboration_ws import router as collaboration_ws_router
from websocket.redis_pubsub import redis_pubsub_manager

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

app = FastAPI(
    title=f"{settings.PROJECT_NAME} - Collaboration Service",
    description="Microservice responsible for real-time WebSocket collaborative code editing, cursor positions, and presence tracking.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

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
    logger.info(f"{settings.SERVICE_NAME} running on port {settings.PORT}")

app.include_router(collaboration_ws_router)

@app.get("/")
def root():
    return {
        "service": settings.SERVICE_NAME,
        "status": "online",
        "port": settings.PORT
    }

@app.get("/health")
def health():
    return {
        "service": settings.SERVICE_NAME,
        "status": "healthy"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
