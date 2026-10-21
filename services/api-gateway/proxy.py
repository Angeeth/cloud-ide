import asyncio
import httpx
import websockets
from typing import Set
from fastapi import Request, Response, WebSocket, WebSocketDisconnect
from starlette.responses import StreamingResponse, JSONResponse
from config import settings
from shared.common.logging import setup_logging

logger = setup_logging(settings.SERVICE_NAME, settings.LOG_LEVEL)

HOP_BY_HOP_HEADERS: Set[str] = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host"
}

async def forward_http_request(target_url: str, request: Request, timeout: float = 60.0) -> Response:
    """Forward incoming HTTP request from API Gateway to target microservice."""
    client_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP_HEADERS
    }

    # Pass query params
    query_string = request.url.query
    full_target_url = f"{target_url}?{query_string}" if query_string else target_url

    # Read body content
    body = await request.body()

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            upstream_response = await client.request(
                method=request.method,
                url=full_target_url,
                headers=client_headers,
                content=body,
                follow_redirects=True
            )

            # Filter response headers
            response_headers = {
                k: v for k, v in upstream_response.headers.items()
                if k.lower() not in HOP_BY_HOP_HEADERS
            }

            return Response(
                content=upstream_response.content,
                status_code=upstream_response.status_code,
                headers=response_headers,
                media_type=upstream_response.headers.get("content-type")
            )

    except httpx.TimeoutException:
        logger.error(f"Gateway Timeout connecting to upstream: {target_url}")
        return JSONResponse(
            status_code=504,
            content={
                "status": "error",
                "code": 504,
                "message": f"Gateway Timeout: Upstream service at {target_url} did not respond within {timeout}s."
            }
        )
    except httpx.ConnectError as e:
        logger.error(f"Bad Gateway: Unable to connect to upstream {target_url}: {e}")
        return JSONResponse(
            status_code=502,
            content={
                "status": "error",
                "code": 502,
                "message": f"Bad Gateway: Could not reach upstream microservice at {target_url}."
            }
        )
    except Exception as e:
        logger.error(f"Internal proxy error connecting to {target_url}: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "code": 500,
                "message": f"API Gateway internal error: {str(e)}"
            }
        )


async def forward_websocket(client_ws: WebSocket, target_ws_url: str):
    """Forward real-time WebSocket connection bi-directionally between frontend and microservice."""
    await client_ws.accept()

    try:
        async with websockets.connect(target_ws_url) as upstream_ws:
            async def client_to_upstream():
                try:
                    while True:
                        msg = await client_ws.receive_text()
                        await upstream_ws.send(msg)
                except WebSocketDisconnect:
                    await upstream_ws.close()
                except Exception:
                    await upstream_ws.close()

            async def upstream_to_client():
                try:
                    async for msg in upstream_ws:
                        await client_ws.send_text(msg)
                except Exception:
                    await client_ws.close()

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(client_to_upstream()),
                    asyncio.create_task(upstream_to_client())
                ],
                return_when=asyncio.FIRST_COMPLETED
            )

            for task in pending:
                task.cancel()

    except Exception as e:
        logger.warning(f"WebSocket upstream connection to {target_ws_url} closed: {e}")
        try:
            await client_ws.close(code=1011)
        except Exception:
            pass
