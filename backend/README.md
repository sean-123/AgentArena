# AgentArena Backend

AI Agent Benchmark Platform - FastAPI Backend

## Tech Stack

- Python 3.12
- uv package manager
- FastAPI
- SQLAlchemy (async)
- MySQL (aiomysql)
- Redis

## Quick Start

```bash
# Install uv
irm https://astral.sh/uv/install.ps1 | iex  # Windows

# Install dependencies
uv sync

# Copy env and configure
copy .env.example .env

# Run API
uv run uvicorn agentarena.main:app --reload
```

## Database

```bash
# One-click init (via API)
curl -X POST http://localhost:8000/api/system/database/init
```
