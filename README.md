# Mirage IDE — Collaborative Cloud Development Environment

## Overview

A full-stack collaborative cloud IDE developed using **React.js, FastAPI, Monaco Editor, Docker, WebSockets, and Redis**.

The platform allows developers to create software projects, clone public GitHub repositories, import local folders or zip archives, edit code with a full-featured Monaco editor, execute code inside isolated Docker sandboxes, and collaborate with team members in real time via live code sync, presence tracking, and integrated project chat.

---

# Features

## Developer & Workspace Features

* User Registration, Login, and JWT Authentication
* Role-Based Access Control (RBAC: `OWNER`, `EDITOR`, `VIEWER`)
* Project Creation (Python, JavaScript, Java, C, C++)
* **Clone from GitHub**: One-click repository cloning from any public GitHub HTTPS URL
* **Local Folder & Zip Import**: Preserves nested directory paths (`src/`, `assets/`, `README.md`) while protecting against path traversal security issues
* **Monaco Code Editor**: Multi-tab editing, line numbers, syntax highlighting, autocomplete, and `Ctrl+S` auto-save
* **VS Code Resizable Layout**: Interactive drag splitters between File Explorer, Code Editor, Integrated Terminal, and Secondary Sidebars with custom panel toggle controls and local persistence

---

## Real-Time Collaboration Features

* **Live Workspace Sync**: Instant code edit broadcasting via WebSocket channels
* **Member Presence Indicators**: Real-time tracking of active project members and focused files
* **Project Chat System**: Project-specific chat room powered by WebSockets and Redis Pub/Sub with persistent chat history
* **Sharing & Permissions**: Project owners can invite collaborators and assign custom access roles (`EDITOR` / `VIEWER`)

---

## Code Execution & Sandboxing Features

* **Docker Execution Sandbox**: Isolated Docker containers (`python:3.11-slim`, `node:20-alpine`, `openjdk:17-alpine`, `gcc:12`) with network disabled, memory limits (128 MB), and CPU limits
* **Subprocess Execution Fallback**: Automatic local fallback if Docker daemon is not running
* **Supported Languages**: Python, JavaScript, Java, C, and C++
* **Interactive Cloud Terminal**: VS Code-style integrated terminal supporting commands (`ls`, `cat`, `python`, `node`, `gcc`, `whoami`, `pwd`, `mkdir`, `touch`, `clear`, `help`) with persistent workspace directories and smart path resolution
* **Snapshot & Versioning System**: Create historic project snapshots and restore previous code checkpoints with one click

---

# Technology Stack

## Frontend

* React.js (Vite)
* Monaco Editor (`@monaco-editor/react`)
* Lucide React Icons
* Axios
* React Router DOM
* Custom Obsidian Dark & Glassmorphic CSS Theme

## Backend

* FastAPI
* Uvicorn
* SQLAlchemy ORM
* Alembic Migrations
* Pydantic v2
* Pytest & HTTPX Test Client

## Database & Cache

* PostgreSQL / SQLite
* Redis Pub/Sub & Caching

## Sandboxing & Storage

* Docker Engine (Isolated containers)
* AWS S3 (with local disk storage fallback)

---

# Database Design

### Major Entities

* `user` (User authentication, profile details, and credentials)
* `project` (Project metadata, primary language, owner, and settings)
* `project_member` (Role-based access control: OWNER, EDITOR, VIEWER)
* `file` (Nested workspace file hierarchy, path nodes, and S3 keys)
* `message` (Real-time project chat message history)
* `project_history` (Snapshot versions, checkpoint metadata, and backups)
* `execution_log` (Docker execution history, exit codes, duration, and output logs)

---

# Installation Guide

## Prerequisites

* Node.js (v18+ Recommended)
* Python (v3.11+ Recommended)
* Docker Desktop (Optional; required for Docker sandbox execution)

---

## Step 1: Configure Environment Variables

Create a `.env` file inside the `backend` folder or project root:

```env
PROJECT_NAME="Mirage IDE"
ENVIRONMENT="development"
SECRET_KEY="your_secret_key_here"

# Database Settings (SQLite default, PostgreSQL optional)
DATABASE_URL=sqlite:///./mirage_dev.db

# Redis Settings
REDIS_URL=redis://localhost:6379/0

# Storage Settings
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=./storage
```

---

# Running the Application

## Run Backend and Frontend Separately

### Backend Setup

```bash
cd backend
```

Create virtual environment:

**Windows**

```cmd
python -m venv venv
.\venv\Scripts\activate
```

**macOS/Linux**

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run FastAPI:

```cmd
set PYTHONPATH=.
uvicorn app.main:app --reload --port 8000
```

Backend URL:

```text
http://127.0.0.1:8000
http://127.0.0.1:8000/docs (Interactive Swagger Docs)
```

---

### Frontend Setup

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

