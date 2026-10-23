import httpx
from fastapi import FastAPI, Request, Response, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from shared.common.logging import setup_logging
from proxy import forward_http_request, forward_websocket

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

app = FastAPI(
    title=f"{settings.PROJECT_NAME} - API Gateway",
    description="Unified API Gateway routing HTTP and WebSocket traffic to independent backend microservices.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Apply CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== AUTH SERVICE ROUTES ====================
@app.api_route("/api/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def route_auth(path: str, request: Request):
    return await forward_http_request(f"{settings.AUTH_SERVICE_URL}/auth/{path}", request)

@app.api_route("/api/users/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def route_users(path: str, request: Request):
    return await forward_http_request(f"{settings.AUTH_SERVICE_URL}/users/{path}", request)

# ==================== FILE SERVICE ROUTES ====================
@app.api_route("/api/projects/{project_id}/files", methods=["GET", "POST", "OPTIONS"])
async def route_project_files_root(project_id: str, request: Request):
    return await forward_http_request(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/files", request)

@app.api_route("/api/projects/{project_id}/files/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def route_project_files_sub(project_id: str, path: str, request: Request):
    return await forward_http_request(f"{settings.FILE_SERVICE_URL}/projects/{project_id}/files/{path}", request)

@app.api_route("/api/files/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def route_files(path: str, request: Request):
    return await forward_http_request(f"{settings.FILE_SERVICE_URL}/files/{path}", request)

# ==================== IMPORT SERVICE ROUTES ====================
@app.api_route("/api/projects/{project_id}/upload", methods=["POST", "OPTIONS"])
async def route_upload(project_id: str, request: Request):
    return await forward_http_request(f"{settings.IMPORT_SERVICE_URL}/projects/{project_id}/upload", request, timeout=120.0)

@app.api_route("/api/projects/{project_id}/upload/zip", methods=["POST", "OPTIONS"])
async def route_upload_zip(project_id: str, request: Request):
    return await forward_http_request(f"{settings.IMPORT_SERVICE_URL}/projects/{project_id}/upload/zip", request, timeout=120.0)

# ==================== CODE EXECUTION SERVICE ROUTES ====================
@app.api_route("/api/execute", methods=["POST", "OPTIONS"])
async def route_execute(request: Request):
    return await forward_http_request(f"{settings.EXECUTION_SERVICE_URL}/execute", request, timeout=30.0)

@app.api_route("/api/projects/{project_id}/executions", methods=["GET", "OPTIONS"])
async def route_executions(project_id: str, request: Request):
    return await forward_http_request(f"{settings.EXECUTION_SERVICE_URL}/projects/{project_id}/executions", request)

# ==================== TERMINAL SERVICE ROUTES ====================
@app.api_route("/api/projects/{project_id}/terminal", methods=["POST", "OPTIONS"])
async def route_terminal(project_id: str, request: Request):
    return await forward_http_request(f"{settings.TERMINAL_SERVICE_URL}/projects/{project_id}/terminal", request, timeout=20.0)

# ==================== HISTORY SERVICE ROUTES ====================
@app.api_route("/api/projects/{project_id}/history", methods=["GET", "POST", "OPTIONS"])
async def route_history_root(project_id: str, request: Request):
    return await forward_http_request(f"{settings.HISTORY_SERVICE_URL}/projects/{project_id}/history", request)

@app.api_route("/api/projects/{project_id}/history/{path:path}", methods=["GET", "POST", "OPTIONS"])
async def route_history_sub(project_id: str, path: str, request: Request):
    return await forward_http_request(f"{settings.HISTORY_SERVICE_URL}/projects/{project_id}/history/{path}", request)

# ==================== CHAT SERVICE ROUTES ====================
@app.api_route("/api/projects/{project_id}/messages", methods=["GET", "OPTIONS"])
async def route_chat_messages(project_id: str, request: Request):
    return await forward_http_request(f"{settings.CHAT_SERVICE_URL}/projects/{project_id}/messages", request)

# ==================== PROJECT MANAGEMENT SERVICE ROUTES ====================
@app.api_route("/api/projects/{project_id}/members", methods=["POST", "OPTIONS"])
async def route_members_root(project_id: str, request: Request):
    return await forward_http_request(f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/members", request)

@app.api_route("/api/projects/{project_id}/members/{path:path}", methods=["PUT", "DELETE", "OPTIONS"])
async def route_members_sub(project_id: str, path: str, request: Request):
    return await forward_http_request(f"{settings.PROJECT_SERVICE_URL}/projects/{project_id}/members/{path}", request)

@app.api_route("/api/projects/clone-github", methods=["POST", "OPTIONS"])
async def route_clone_github(request: Request):
    return await forward_http_request(f"{settings.PROJECT_SERVICE_URL}/projects/clone-github", request, timeout=300.0)

@app.api_route("/api/projects", methods=["GET", "POST", "OPTIONS"])
async def route_projects_root(request: Request):
    return await forward_http_request(f"{settings.PROJECT_SERVICE_URL}/projects", request)

@app.api_route("/api/projects/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def route_projects_sub(path: str, request: Request):
    return await forward_http_request(f"{settings.PROJECT_SERVICE_URL}/projects/{path}", request)

# ==================== WEBSOCKET ROUTES ====================
@app.websocket("/ws/projects/{project_id}/collaboration")
async def ws_collaboration(websocket: WebSocket, project_id: str, token: str = Query(...)):
    target_ws = f"{settings.COLLABORATION_SERVICE_WS_URL}/ws/projects/{project_id}/collaboration?token={token}"
    await forward_websocket(websocket, target_ws)

@app.websocket("/ws/projects/{project_id}/chat")
async def ws_chat(websocket: WebSocket, project_id: str, token: str = Query(...)):
    target_ws = f"{settings.CHAT_SERVICE_WS_URL}/ws/projects/{project_id}/chat?token={token}"
    await forward_websocket(websocket, target_ws)

# ==================== STATUS & HEALTH ====================
@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "role": "API Gateway",
        "version": "1.0.0",
        "docs": "/api/docs"
    }

@app.get("/api/health")
async def health_check():
    """Aggregate health check checking downstream microservices."""
    services_to_check = {
        "auth": f"{settings.AUTH_SERVICE_URL}/health",
        "project": f"{settings.PROJECT_SERVICE_URL}/health",
        "file": f"{settings.FILE_SERVICE_URL}/health",
        "import": f"{settings.IMPORT_SERVICE_URL}/health",
        "execution": f"{settings.EXECUTION_SERVICE_URL}/health",
        "terminal": f"{settings.TERMINAL_SERVICE_URL}/health",
        "collaboration": f"{settings.COLLABORATION_SERVICE_URL}/health",
        "chat": f"{settings.CHAT_SERVICE_URL}/health",
        "history": f"{settings.HISTORY_SERVICE_URL}/health"
    }

    results = {}
    async with httpx.AsyncClient(timeout=2.0) as client:
        for name, url in services_to_check.items():
            try:
                r = await client.get(url)
                results[name] = "healthy" if r.status_code == 200 else f"unhealthy ({r.status_code})"
            except Exception:
                results[name] = "offline / unreachable"

    all_healthy = all(v == "healthy" for v in results.values())
    return {
        "gateway": "healthy",
        "status": "operational" if all_healthy else "degraded",
        "services": results
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
