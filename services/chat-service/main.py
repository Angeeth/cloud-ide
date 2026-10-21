from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from shared.common.logging import setup_logging
from database.session import engine
from database.base import Base
from websocket.chat_ws import router as chat_ws_router
from websocket.redis_pubsub import redis_pubsub_manager
from api.chat import router as chat_router

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

# Resilient database table initialization
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.warning(f"Database connection deferred: {e}")

app = FastAPI(
    title=f"{settings.PROJECT_NAME} - Chat Service",
    description="Microservice responsible for project collaborative chat WebSocket communication and chat history.",
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

app.include_router(chat_ws_router)
app.include_router(chat_router)

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
