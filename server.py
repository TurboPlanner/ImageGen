import asyncio
import collections
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import structlog

import clear_refine

# ── in-memory log capture ─────────────────────────────────────

LOG_CAPTURE_MAX = 500
_log_capture = collections.deque(maxlen=LOG_CAPTURE_MAX)

# ── frontend log capture (от AI-агентов) ──────────────────────

_frontend_log_capture = collections.deque(maxlen=LOG_CAPTURE_MAX)


class LogCaptureHandler(logging.Handler):
    def emit(self, record):
        msg = self.format(record)
        _log_capture.append(msg)


def get_recent_logs(n=100):
    return list(_log_capture)[-n:]


def get_frontend_logs(n=100):
    return list(_frontend_log_capture)[-n:]


# ── structlog setup ──────────────────────────────────────────

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(indent=None, ensure_ascii=False),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

# ── configure root logging for LogCapture ────────────────────

fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
handler = logging.StreamHandler()
handler.setFormatter(fmt)

cap = LogCaptureHandler()
cap.setFormatter(fmt)

root_logger = logging.getLogger()
root_logger.addHandler(handler)
root_logger.addHandler(cap)
root_logger.setLevel(logging.INFO)

# ── structured logger ───────────────────────────────────────

logger = structlog.get_logger("clear_refine_server")


def get_recent_logs(n=100):
    return list(_log_capture)[-n:]


def get_frontend_logs(n=100):
    return list(_frontend_log_capture)[-n:]

API_TOKEN = "clear-refine-demo-token-2026"

# ── in-memory batch store ─────────────────────────────────────

_active_batches: dict[str, dict] = {}
_batch_cancel_events: dict[str, asyncio.Event] = {}


def verify_token(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[len("Bearer "):] != API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing token")


# ── request / response models ─────────────────────────────────


class QueueRequest(BaseModel):
    input_dir: str
    output_dir: str = ""
    output_prefix: str = "refined_"
    positive_prompt: str = ""
    negative_prompt: str = ""
    max_images: Optional[int] = None


class StatusResponse(BaseModel):
    batch_id: str
    status: str
    total: int = 0
    done: int = 0
    current: str = ""
    results: list = []


class BrowseResponse(BaseModel):
    path: str
    parent: str = ""
    dirs: list[str] = []
    images: list[str] = []


class BrowseRequest(BaseModel):
    path: str = ""


# ── batch runner ──────────────────────────────────────────────


def copy_outputs(results, output_dir):
    import shutil
    src = clear_refine.COMFYUI_OUTPUT_DIR
    dst = Path(output_dir)
    dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for r in results:
        for fname in r.get("outputs", []):
            src_file = src / fname
            if src_file.exists():
                shutil.copy2(str(src_file), str(dst / fname))
                copied += 1
    logger.info("Copied files to output dir", count=copied, dest=str(dst))


def run_batch_in_thread(
    batch_id: str,
    input_dir: str,
    config: dict,
    output_prefix: str,
    output_dir: str,
    positive_prompt: str,
    negative_prompt: str,
    max_images: Optional[int],
):
    cancel_event = _batch_cancel_events.get(batch_id)
    state = _active_batches[batch_id]
    state["status"] = "running"

    def progress_callback(done, total, current, item_status):
        state["done"] = done
        state["total"] = total
        state["current"] = current

    try:
        results = clear_refine.process_batch(
            input_dir,
            config=config,
            max_images=max_images,
            cancel_event=cancel_event,
            progress_callback=progress_callback,
            positive_prompt=positive_prompt if positive_prompt else None,
            negative_prompt=negative_prompt if negative_prompt else None,
        )
        state["results"] = results
        if output_dir:
            copy_outputs(results, output_dir)
        all_ok = all(r["status"] == "ok" for r in results)
        any_cancelled = any(r["status"] == "cancelled" for r in results)
        if any_cancelled:
            state["status"] = "cancelled"
        elif all_ok:
            state["status"] = "completed"
        else:
            state["status"] = "completed_with_errors"
        state["done"] = len(results)
        logger.info("Batch finished", batch_id=batch_id, status=state["status"])
    except Exception as e:
        state["status"] = "failed"
        state["error"] = str(e)
        logger.error("Batch failed", batch_id=batch_id, error=str(e))
    finally:
        _batch_cancel_events.pop(batch_id, None)


# ── app ───────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    clear_refine.logger.setLevel(logging.INFO)

    logger.info("Server starting", port=8765)
    yield
    for batch_id, event in _batch_cancel_events.items():
        event.set()
    _batch_cancel_events.clear()
    logger.info("Server shutting down")


app = FastAPI(
    title="ClearRefine API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

spa_dir = Path(__file__).parent / "spa"
if spa_dir.exists():
    app.mount("/spa", StaticFiles(directory=str(spa_dir)), name="spa")


# ── auth middleware ───────────────────────────────────────────


_PUBLIC_API_PATHS = {"/api/docs", "/api/openapi.json", "/api/redoc", "/api/logs", "/api/logs/frontend", "/api/health"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in _PUBLIC_API_PATHS and not path.startswith("/api/static"):
        try:
            verify_token(request)
        except HTTPException:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing token"})
    return await call_next(request)


# ── API endpoints ─────────────────────────────────────────────


@app.post("/api/queue")
async def queue_batch(req: QueueRequest):
    batch_id = str(uuid.uuid4())
    cancel_event = asyncio.Event()
    _batch_cancel_events[batch_id] = cancel_event

    input_dir = Path(req.input_dir)
    if not input_dir.exists() or not input_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"Input directory not found: {req.input_dir}")

    images = clear_refine.collect_images(input_dir)
    if not images:
        raise HTTPException(status_code=400, detail=f"No images found in {req.input_dir}")

    config = clear_refine.load_config()
    if req.output_prefix:
        config.setdefault("processing", {})["output_prefix"] = req.output_prefix

    state = {
        "batch_id": batch_id,
        "status": "queued",
        "total": len(images),
        "done": 0,
        "current": "",
        "results": [],
    }
    _active_batches[batch_id] = state

    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        clear_refine._thread_pool,
        run_batch_in_thread,
        batch_id,
        str(input_dir),
        config,
        req.output_prefix,
        req.output_dir,
        req.positive_prompt,
        req.negative_prompt,
        req.max_images,
    )

    return {"batch_id": batch_id, "status": "queued", "total": len(images)}


@app.get("/api/status/{batch_id}")
async def get_status(batch_id: str):
    state = _active_batches.get(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    return {
        "batch_id": state["batch_id"],
        "status": state["status"],
        "total": state["total"],
        "done": state["done"],
        "current": state["current"],
        "results": state["results"],
    }


@app.post("/api/cancel/{batch_id}")
async def cancel_batch(batch_id: str):
    state = _active_batches.get(batch_id)
    if not state:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id} not found")
    if state["status"] in ("completed", "failed", "cancelled"):
        return {"batch_id": batch_id, "status": state["status"]}

    event = _batch_cancel_events.get(batch_id)
    if event:
        event.set()
    state["status"] = "cancelling"
    logger.info("Cancelling batch", batch_id=batch_id)
    return {"batch_id": batch_id, "status": "cancelling"}


@app.get("/api/logs")
async def get_logs(n: int = 100):
    return {"logs": get_recent_logs(n)}


class FrontendLogEntry(BaseModel):
    timestamp: str = ""
    level: str = "INFO"
    message: str = ""
    context: Optional[dict] = None


@app.post("/api/logs/frontend")
async def post_frontend_log(entry: FrontendLogEntry):
    """Принимает лог с фронтенда (от AI-агента или debug-режима).

    Записывается в два места:
    1. _frontend_log_capture — для отдельного GET /api/logs/frontend
    2. logger.info() — в единый поток логов сервера, с источником source=frontend,
       чтобы логи фронта и бэка были в единой хронологии.
    """
    line = f"{entry.timestamp} [{entry.level}] FRONTEND: {entry.message}"
    if entry.context:
        line += f" {json.dumps(entry.context)}"
    _frontend_log_capture.append(line)
    logger.info("Frontend log",
                source="frontend",
                level=entry.level,
                message=entry.message,
                context=entry.context)
    return {"status": "ok"}


@app.get("/api/logs/frontend")
async def get_frontend_logs_api(n: int = 100):
    return {"logs": get_frontend_logs(n)}


@app.get("/api/browse")
async def browse(path: str = ""):
    if not path:
        path = str(clear_refine.COMFYUI_INPUT_DIR)
    target = Path(path)
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Path not found: {path}")

    parent = str(target.parent) if target.parent != target else ""
    dirs = sorted(
        p.name for p in target.iterdir()
        if p.is_dir() and not p.name.startswith(".")
    )
    images = sorted(
        p.name for p in target.iterdir()
        if p.is_file() and p.suffix.lower() in clear_refine.IMAGE_EXTENSIONS
    )
    return {"path": str(target), "parent": parent, "dirs": dirs, "images": images}


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok", 
        "timestamp": datetime.utcnow().isoformat()
    }


# ── serve SPA ─────────────────────────────────────────────────


@app.get("/")
async def index():
    spa_index = spa_dir / "index.html"
    if spa_index.exists():
        return FileResponse(str(spa_index))
    return {"status": "ClearRefine API running", "docs": "/api/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")
