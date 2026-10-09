# Mirage IDE - System Architecture Documentation

## 1. High-Level System Architecture

```text
                               ┌─────────────────────────────────────────┐
                               │             USER BROWSER                │
                               │   React SPA + Monaco Editor + WS Client │
                               └────────────────────┬────────────────────┘
                                                    │
                                         HTTPS / Secure WebSockets
                                                    │
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │           FASTAPI API GATEWAY           │
                               │        REST Routers & WS Dispatch       │
                               └──────┬─────────────┬─────────────┬──────┘
                                      │             │             │
              ┌───────────────────────┘             │             └───────────────────────┐
              ▼                                     ▼                                     ▼
  ┌───────────────────────┐             ┌───────────────────────┐             ┌───────────────────────┐
  │ PostgreSQL Database   │             │   Redis Pub/Sub       │             │ AWS S3 / Cloud Storage│
  │ Users, RBAC, Files    │             │ Presence, Live Edits  │             │ Project Code & Assets │
  └───────────────────────┘             └───────────────────────┘             └───────────────────────┘
                                                    │
                                                    ▼
                                        ┌───────────────────────┐
                                        │ Code Execution Engine │
                                        │ Isolated Docker SDK   │
                                        └───────────────────────┘
```

---

## 2. Distinction: Microservices vs Infrastructure

### Microservices (Application Logic Layer)
1. **API Gateway / Routing Service**: Main FastAPI entrypoint directing REST and WebSocket traffic.
2. **Authentication Service**: User registration, login, bcrypt password hashing, and JWT token issuance.
3. **User & Project Service**: Workspace CRUD and Role-Based Access Control (`OWNER`, `EDITOR`, `VIEWER`).
4. **File Management Service**: Directory tree builder, path traversal security validator (`../` protection), and local project import engine.
5. **Real-Time Collaboration Service**: WebSocket connection manager, live Monaco editor sync, and presence coordination.
6. **Code Execution Service**: Sandboxed Docker container runner for Python, Java, C++, and JavaScript.
7. **Chat Service**: Instant messaging WebSocket broadcast and message history store.
8. **Version & History Service**: Manual/automated project snapshot generator and point-in-time restoration.

### Infrastructure Layer (Cloud Services)
1. **AWS S3**: Object storage for private project file assets and snapshot archives.
2. **Amazon CloudFront**: CDN for global HTTPS delivery of static React frontend builds.
3. **Amazon EC2**: Virtual server hosting FastAPI uvicorn workers and Docker daemon.
4. **Amazon RDS PostgreSQL**: Managed relational database storing application metadata.
5. **Redis**: Cache & Pub/Sub message broker for WebSockets and user presence.

---

## 3. Real-Time Collaboration Sequence

```text
User 1 (Editor)                  FastAPI Backend                 Redis Pub/Sub                 User 2 (Editor)
      │                                 │                              │                              │
      │── WS: file_change (content) ───►│                              │                              │
      │                                 │── Publish to Redis Channel ─►│                              │
      │                                 │                              │── Notify connected workers ─►│
      │                                 │                              │                              │── WS: file_change event ───►
      │                                 │                              │                              │   (Monaco Editor updates)
```

---

## 4. Sandboxed Execution Security Rules
1. `--network none` (Network access disabled to prevent SSRF and outbound data exfiltration)
2. `--memory 128m` (RAM capped at 128 MB per container)
3. `--cpus 0.5` (CPU quota limited to half a core)
4. Execution Timeout: 10 seconds maximum execution duration.
5. Non-root user (`1000:1000`) inside container.
