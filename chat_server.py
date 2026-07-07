"""
# Chat Server — Generative UI Prototype

FastAPI server for dynamic artifact generation via DeepSeek API + Tool Calling.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/chat/stream | SSE streaming chat with tool calling |
| GET | /api/artifacts/{name} | Get artifact code + metadata |
| POST | /api/proxy | Universal proxy for iframe API calls |
| GET  | /api/context | Get current conversation context |
| POST | /api/context/clear | Clear conversation context |

## Flow

1. User sends message → SSE stream starts
2. Full context (history + system prompt) sent to DeepSeek
3. Text chunks streamed to client as SSE events
4. Tool calls buffered, executed, result sent back to model
5. Model's final text response streamed to client
6. Full exchange saved to context.json
"""

import asyncio
import json
import os
import re
import sqlite3
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI
from pydantic import BaseModel

# ── paths ────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "chat_config.json"
SPA_DIR = BASE_DIR / "spa" / "chat"
ARTIFACTS_DIR = BASE_DIR / "spa" / "artifacts"
CONTEXT_FILE = SPA_DIR / "context.json"
DB_PATH = BASE_DIR / "artifacts.db"

# ── load config ──────────────────────────────────────────────

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    CONFIG = json.load(f)

DEEPSEEK_API_KEY = CONFIG["api_key"]
DEEPSEEK_MODEL = CONFIG.get("model", "deepseek-chat")
DEEPSEEK_API_BASE = CONFIG.get("api_base", "https://api.deepseek.com")
MAX_CORRECTION_RETRIES = CONFIG.get("max_correction_retries", 3)
SYSTEM_PROMPT_FILE = BASE_DIR / CONFIG.get("system_prompt_file", "spa/chat/agent_prompt.md")
HOST = CONFIG.get("host", "127.0.0.1")
PORT = CONFIG.get("port", 8766)

# ── load system prompt ───────────────────────────────────────

with open(SYSTEM_PROMPT_FILE, "r", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()

# ── init context file ────────────────────────────────────────

if not CONTEXT_FILE.exists():
    with open(CONTEXT_FILE, "w", encoding="utf-8") as f:
        json.dump([], f, ensure_ascii=False, indent=2)

# ── init SQLite ──────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS artifacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            file_path TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            product TEXT NOT NULL,
            amount REAL NOT NULL,
            sale_date TEXT NOT NULL
        )
    """)
    # Seed test data if table is empty
    row = conn.execute("SELECT COUNT(*) FROM sales").fetchone()
    if row[0] == 0:
        test_data = [
            ("Electronics", "Smartphone", 45000, "2026-01-15"),
            ("Electronics", "Laptop", 89000, "2026-02-10"),
            ("Electronics", "Tablet", 32000, "2026-03-05"),
            ("Clothing",   "Jacket",   15000, "2026-01-20"),
            ("Clothing",   "Sneakers", 12000, "2026-02-18"),
            ("Clothing",   "T-Shirt",   5500, "2026-03-12"),
            ("Food",      "Coffee",    8000, "2026-01-25"),
            ("Food",      "Pizza",     9500, "2026-02-22"),
            ("Food",      "Burger",    7200, "2026-03-08"),
            ("Books",     "Novel",     4500, "2026-01-30"),
            ("Books",     "Textbook",  7800, "2026-02-28"),
            ("Books",     "Comics",    3200, "2026-03-15"),
        ]
        conn.executemany(
            "INSERT INTO sales (category, product, amount, sale_date) VALUES (?, ?, ?, ?)",
            test_data
        )
    conn.commit()
    conn.close()

init_db()

# ── init DeepSeek client ─────────────────────────────────────

client = AsyncOpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_API_BASE,
)

# ── tool schemas (OpenAI/DeepSeek format) ────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "Create_Artefact",
            "description": "Create a new JSX component artifact. Saves to ./spa/artifacts/{name}.jsx and registers in SQLite.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Unique Latin name, e.g. config_card"
                    },
                    "code": {
                        "type": "string",
                        "description": "Full valid React/JSX code. Main component MUST be named 'App' and exported as default."
                    }
                },
                "required": ["name", "code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "Edit_Artefact",
            "description": "Edit an existing artifact. Sends complete updated code that overwrites the old file and SQLite record.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of existing artifact"
                    },
                    "code": {
                        "type": "string",
                        "description": "Complete updated JSX code"
                    }
                },
                "required": ["name", "code"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "Query_Sales",
            "description": "Execute a read-only SQL SELECT query on the 'sales' table. Columns: id, category, text, product, amount (real), sale_date (text). Returns results as JSON array.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "SQL SELECT query (read-only). Example: SELECT category, SUM(amount) as total FROM sales GROUP BY category ORDER BY total DESC"
                    }
                },
                "required": ["query"]
            }
        }
    }
]

# ── tool implementations ─────────────────────────────────────

async def tool_create_artefact(name: str, code: str) -> dict:
    """Create a new artifact: save JSX file + SQLite record."""
    # Validate name
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', name):
        return {"success": False, "error": f"Invalid artifact name: {name}. Use Latin letters, numbers, underscore."}

    file_path = ARTIFACTS_DIR / f"{name}.jsx"

    # Check uniqueness
    conn = sqlite3.connect(str(DB_PATH))
    existing = conn.execute("SELECT id FROM artifacts WHERE name = ?", (name,)).fetchone()
    if existing:
        conn.close()
        return {"success": False, "error": f"Artifact '{name}' already exists. Use Edit_Artefact to modify it."}

    # Write file
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)
    except Exception as e:
        conn.close()
        return {"success": False, "error": f"Failed to write file: {e}"}

    # SQLite record
    conn.execute(
        "INSERT INTO artifacts (name, file_path, code) VALUES (?, ?, ?)",
        (name, str(file_path), code)
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "artifact": {
            "name": name,
            "file_path": str(file_path),
            "code": code
        }
    }


async def tool_edit_artefact(name: str, code: str) -> dict:
    """Edit an existing artifact: overwrite file + SQLite record."""
    file_path = ARTIFACTS_DIR / f"{name}.jsx"

    conn = sqlite3.connect(str(DB_PATH))
    existing = conn.execute("SELECT id, file_path FROM artifacts WHERE name = ?", (name,)).fetchone()
    if not existing:
        conn.close()
        return {"success": False, "error": f"Artifact '{name}' not found. Use Create_Artefact first."}

    # Use stored path if available, else default
    if existing[1]:
        file_path = Path(existing[1])

    # Write file
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code)
    except Exception as e:
        conn.close()
        return {"success": False, "error": f"Failed to write file: {e}"}

    # Update SQLite
    conn.execute(
        "UPDATE artifacts SET code = ?, updated_at = datetime('now') WHERE name = ?",
        (code, name)
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "artifact": {
            "name": name,
            "file_path": str(file_path),
            "code": code
        }
    }


async def tool_query_sales(query: str) -> dict:
    """Execute a read-only SELECT on the sales table."""
    # Safety: only allow SELECT
    q = query.strip().upper()
    if not q.startswith("SELECT"):
        return {"success": False, "error": "Only SELECT queries are allowed"}

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(query).fetchall()
        result = [dict(r) for r in rows]
        return {"success": True, "data": result, "row_count": len(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()


TOOL_MAP = {
    "Create_Artefact": tool_create_artefact,
    "Edit_Artefact": tool_edit_artefact,
    "Query_Sales": tool_query_sales,
}

# ── context management ───────────────────────────────────────

def load_context() -> list:
    """Load conversation context from JSON file."""
    try:
        with open(CONTEXT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def save_context(messages: list):
    """Save conversation context to JSON file."""
    with open(CONTEXT_FILE, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)


def append_context(entry: dict):
    """Append a single message to context file."""
    ctx = load_context()
    ctx.append(entry)
    save_context(ctx)


# ── SSE helpers ──────────────────────────────────────────────

def sse_event(event: str, data: dict) -> str:
    """Format an SSE event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── chat stream logic ────────────────────────────────────────

async def chat_stream(messages: list):
    """
    Core streaming logic:
    1. Send full context to DeepSeek API
    2. Stream text chunks as 'text' SSE events
    3. Buffer tool calls, execute on completion, send back to model
    4. Stream final text, emit 'done' event
    """
    retry_count = 0
    current_messages = messages[:]
    final_text = ""

    while True:
        try:
            stream = await client.chat.completions.create(
                model=DEEPSEEK_MODEL,
                messages=current_messages,
                tools=TOOLS,
                stream=True,
                stream_options={"include_usage": False},
            )
        except Exception as e:
            yield sse_event("error", {"message": f"DeepSeek API call failed: {e}"})
            yield sse_event("done", {})
            return

        # ── buffer for current response ──
        tool_calls_buf = {}  # index → {id, name, args_buffer}
        delta_text = ""

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue

            # ── text delta ──
            if delta.content:
                delta_text += delta.content
                yield sse_event("text", {"content": delta.content})

            # ── tool call delta ──
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_buf:
                        tool_calls_buf[idx] = {
                            "id": tc.id or f"call_{uuid.uuid4().hex[:8]}",
                            "name": tc.function.name or "",
                            "args_buffer": tc.function.arguments or "",
                        }
                    else:
                        if tc.id:
                            tool_calls_buf[idx]["id"] = tc.id
                        if tc.function.name:
                            tool_calls_buf[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_buf[idx]["args_buffer"] += tc.function.arguments

        # ── if no tool calls, this is a normal text response ──
        if not tool_calls_buf:
            if delta_text:
                final_text += delta_text
                # Append assistant message to context
                append_context({"role": "assistant", "content": delta_text})
            yield sse_event("done", {})
            return

        # ── save any pre-tool-call text to context ──
        if delta_text:
            final_text += delta_text
            append_context({"role": "assistant", "content": delta_text})

        # ── execute tool calls ──
        for idx, tcb in tool_calls_buf.items():
            tool_name = tcb["name"]
            tool_id = tcb["id"]

            # Notify client about tool call
            yield sse_event("tool_start", {
                "tool": tool_name,
                "tool_call_id": tool_id,
            })

            # Parse arguments
            try:
                args = json.loads(tcb["args_buffer"]) if tcb["args_buffer"] else {}
            except json.JSONDecodeError as e:
                yield sse_event("tool_error", {
                    "tool": tool_name,
                    "error": f"Failed to parse arguments: {e}",
                    "raw_args": tcb["args_buffer"],
                })
                yield sse_event("done", {})
                return

            # Execute tool
            tool_fn = TOOL_MAP.get(tool_name)
            if not tool_fn:
                yield sse_event("tool_error", {
                    "tool": tool_name,
                    "error": f"Unknown tool: {tool_name}",
                })
                yield sse_event("done", {})
                return

            try:
                tool_result = await tool_fn(**args)
            except Exception as e:
                tool_result = {"success": False, "error": str(e)}

            yield sse_event("tool_result", {
                "tool": tool_name,
                "tool_call_id": tool_id,
                "result": tool_result,
            })

            # Append tool call to context
            append_context({
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": tool_id,
                    "type": "function",
                    "function": {"name": tool_name, "arguments": tcb["args_buffer"]}
                }]
            })

            # Append tool result to context
            append_context({
                "role": "tool",
                "tool_call_id": tool_id,
                "content": json.dumps(tool_result, ensure_ascii=False)
            })

        # ── reload context and continue loop ──
        # The model needs to see the tool results to generate final text
        current_messages = load_context()
        # Prepend system prompt
        current_messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

        # Check for self-correction retry limit
        if tool_calls_buf and any(
            tcb["name"] in ("Create_Artefact", "Edit_Artefact")
            for tcb in tool_calls_buf.values()
        ):
            retry_count += 1
            if retry_count > MAX_CORRECTION_RETRIES:
                yield sse_event("max_retries", {"message": f"Max correction retries ({MAX_CORRECTION_RETRIES}) reached."})
                yield sse_event("done", {})
                return


# ── FastAPI app ──────────────────────────────────────────────

app = FastAPI(
    title="Generative UI Chat API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API models ───────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str


class ProxyRequest(BaseModel):
    endpoint: str
    method: str = "GET"
    params: dict = {}


# ── API endpoints ────────────────────────────────────────────


@app.post("/api/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    """
    SSE streaming chat endpoint.
    Accepts a user message, appends to context, streams DeepSeek response.
    """
    # Load context and append user message
    ctx = load_context()
    ctx.append({"role": "user", "content": req.message})
    save_context(ctx)

    # Build messages with system prompt
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + ctx

    return StreamingResponse(
        chat_stream(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/api/artifacts/{name}")
async def get_artifact(name: str):
    """Get artifact code and metadata from SQLite."""
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute(
        "SELECT name, file_path, code, created_at, updated_at FROM artifacts WHERE name = ?",
        (name,)
    ).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Artifact '{name}' not found")

    return {
        "name": row[0],
        "file_path": row[1],
        "code": row[2],
        "created_at": row[3],
        "updated_at": row[4],
    }


@app.get("/api/artifacts")
async def list_artifacts():
    """List all artifacts."""
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute(
        "SELECT name, created_at, updated_at FROM artifacts ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return {
        "artifacts": [
            {"name": r[0], "created_at": r[1], "updated_at": r[2]}
            for r in rows
        ]
    }


@app.post("/api/proxy")
async def proxy(req: ProxyRequest):
    """
    Universal proxy for iframe API calls.
    Maps endpoint names to internal logic.
    """
    endpoint_map = {
        "get_artifact": lambda p: _get_artifact_proxy(p.get("name", "")),
        "list_artifacts": lambda _: _list_artifacts_proxy(),
        "query_sales": lambda p: _query_sales_proxy(p.get("query", "SELECT category, SUM(amount) as total FROM sales GROUP BY category ORDER BY total DESC")),
    }

    handler = endpoint_map.get(req.endpoint)
    if not handler:
        raise HTTPException(status_code=400, detail=f"Unknown endpoint: {req.endpoint}")

    try:
        result = handler(req.params)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _get_artifact_proxy(name: str):
    conn = sqlite3.connect(str(DB_PATH))
    row = conn.execute(
        "SELECT name, file_path, code, created_at, updated_at FROM artifacts WHERE name = ?",
        (name,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail=f"Artifact '{name}' not found")
    return {
        "name": row[0],
        "file_path": row[1],
        "code": row[2],
        "created_at": row[3],
        "updated_at": row[4],
    }


def _list_artifacts_proxy():
    conn = sqlite3.connect(str(DB_PATH))
    rows = conn.execute(
        "SELECT name, created_at, updated_at FROM artifacts ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return [{"name": r[0], "created_at": r[1], "updated_at": r[2]} for r in rows]


def _query_sales_proxy(query: str):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(query).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/context")
async def get_context():
    """Get current conversation context."""
    return {"messages": load_context()}


@app.post("/api/context/clear")
async def clear_context():
    """Clear conversation context."""
    save_context([])
    return {"status": "ok", "message": "Context cleared"}


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "model": DEEPSEEK_MODEL,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── serve SPA static files ───────────────────────────────────


# Mount static files
if SPA_DIR.exists():
    app.mount("/spa/chat", StaticFiles(directory=str(SPA_DIR)), name="chat_spa")

if ARTIFACTS_DIR.exists():
    app.mount("/artifacts", StaticFiles(directory=str(ARTIFACTS_DIR)), name="artifacts")


@app.get("/")
async def index():
    """Serve the chat SPA."""
    index_file = SPA_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"status": "Generative UI Chat API running", "docs": "/api/docs"}


# ── entry point ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print(f"Starting Generative UI Chat server on http://{HOST}:{PORT}")
    print(f"  API docs: http://{HOST}:{PORT}/api/docs")
    print(f"  Chat SPA: http://{HOST}:{PORT}/")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
