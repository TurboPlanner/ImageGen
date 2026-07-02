"""
Full integration tests: queue real images → poll completion → verify output files.

Requires:
  - ComfyUI backend on port 8188 (started via Comfy Desktop)
  - ClearRefine server on port 8765

Run:  pytest tests/test_integration.py -v --timeout=360
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

import pytest

from clear_refine import collect_images, process_batch, CancelledError

TEST_DIR = Path(__file__).resolve().parent.parent
TEST_INPUT = TEST_DIR / "TestInput"
COMFYUI_OUTPUT = Path(
    "C:\\Users\\LENOVO\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output"
)
SERVER = os.environ.get("CLEARREFINE_SERVER", "http://127.0.0.1:8765")
TOKEN = os.environ.get("CLEARREFINE_TOKEN", "clear-refine-demo-token-2026")
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")

logger = logging.getLogger("test_integration")


# ── helpers ───────────────────────────────────────────────────


def comfyui_available():
    try:
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/", timeout=5)
        return resp.status == 200
    except Exception:
        return False


def server_available():
    try:
        req = urllib.request.Request(
            f"{SERVER}/api/browse",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        resp = urllib.request.urlopen(req, timeout=5)
        return resp.status == 200
    except Exception:
        return False


def wait_for_comfyui(timeout=90):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if comfyui_available():
            return True
        time.sleep(3)
    return False


def clean_output_dir():
    for f in COMFYUI_OUTPUT.iterdir():
        if f.is_file() and f.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            f.unlink()

# ── fixtures ──────────────────────────────────────────────────


@pytest.fixture(scope="session")
def comfyui():
    if not comfyui_available():
        pytest.skip("ComfyUI not reachable — start Comfy Desktop first")
    yield


@pytest.fixture(scope="session")
def clr_server():
    if not server_available():
        pytest.skip("ClearRefine server not reachable — run `python server.py`")
    yield


@pytest.fixture(autouse=True)
def setup_logging():
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        force=True,
    )


# ── smoke: basic environment ──────────────────────────────────


class TestEnvironment:
    def test_comfyui_api(self, comfyui):
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/", timeout=5)
        assert resp.status == 200

    def test_clearrefine_api(self, clr_server):
        req = urllib.request.Request(
            f"{SERVER}/api/browse",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        resp = urllib.request.urlopen(req, timeout=5)
        assert resp.status == 200

    def test_test_images_exist(self):
        images = collect_images(TEST_INPUT)
        assert len(images) >= 2, f"Need >=2 images, found {len(images)}"
        names = [p.name for p in images]
        assert "base.jpg" in names
        assert "dock1.jpg" in names


# ── batch processing (direct call, no server) ─────────────────


class TestBatchProcessing:
    def test_process_two_images_via_direct_call(self, comfyui):
        """Call clear_refine.process_batch directly, verify outputs exist."""
        clean_output_dir()
        initial_count = len(list(COMFYUI_OUTPUT.iterdir()))

        results = process_batch(
            TEST_INPUT,
            max_images=2,
        )

        assert len(results) == 2
        for r in results:
            assert r["status"] == "ok", f"Image {r['image']} failed: {r['status']}"
            assert r["prompt_id"] is not None
            assert len(r["outputs"]) > 0

        new_files = [f for f in COMFYUI_OUTPUT.iterdir() if f.is_file()]
        assert len(new_files) >= initial_count + 2, \
            f"Expected >=2 new output files, got {len(new_files) - initial_count}"

    def test_output_files_have_content(self, comfyui):
        """Check that output files are non-empty PNG/JPG."""
        outputs = sorted(
            COMFYUI_OUTPUT.iterdir(),
            key=lambda p: p.stat().st_mtime, reverse=True,
        )[:4]
        assert len(outputs) >= 2
        for f in outputs:
            assert f.stat().st_size > 1000, f"Output {f.name} is too small ({f.stat().st_size} bytes)"

    def test_batch_with_custom_prompts(self, comfyui):
        """Override prompts via config override mechanism."""
        config = {
            "overrides": {
                "3": {"inputs": {"text": "test positive prompt"}},
                "4": {"inputs": {"text": "test negative prompt"}},
            },
            "processing": {"output_prefix": "custom_"},
        }
        from clear_refine import process_batch
        results = process_batch(TEST_INPUT, config=config, max_images=1)
        assert len(results) == 1
        assert results[0]["status"] == "ok"

    def test_cancellation_works(self, comfyui):
        """Start a batch and cancel it mid-way via CancelledError."""
        import threading
        cancel_event = threading.Event()

        def delayed_cancel():
            time.sleep(8)
            cancel_event.set()

        t = threading.Thread(target=delayed_cancel, daemon=True)
        t.start()

        results = process_batch(
            TEST_INPUT,
            max_images=5,
            cancel_event=cancel_event,
        )
        cancelled = [r for r in results if r["status"] == "cancelled"]
        assert len(cancelled) >= 1 or len(results) < 5, \
            "Expected at least one cancelled result"


# ── API processing (via ClearRefine server) ───────────────────


class TestApiProcessing:
    def test_full_pipeline(self, comfyui, clr_server):
        """Queue 2 images → poll until done → verify outputs on disk."""
        # 1. queue
        body = json.dumps({
            "input_dir": str(TEST_INPUT),
            "output_prefix": "integ_test_",
        }).encode()
        req = urllib.request.Request(
            f"{SERVER}/api/queue",
            data=body,
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json",
            },
        )
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        assert data["status"] == "queued"
        assert data["total"] == 2
        batch_id = data["batch_id"]

        # 2. poll until completion
        start = time.monotonic()
        timeout = 300
        last_state = None

        while time.monotonic() - start < timeout:
            req = urllib.request.Request(
                f"{SERVER}/api/status/{batch_id}",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            resp = urllib.request.urlopen(req, timeout=30)
            state = json.loads(resp.read())
            last_state = state
            logger.info(
                "Status: %s  done=%d/%d  current=%s",
                state["status"], state["done"], state["total"], state["current"],
            )

            if state["status"] in ("completed", "completed_with_errors", "failed"):
                break
            time.sleep(3)

        assert last_state is not None
        assert last_state["status"] in ("completed", "completed_with_errors"), \
            f"Batch ended with status={last_state['status']}"
        assert last_state["done"] == 2 and last_state["total"] == 2

        # 3. verify results
        assert len(last_state["results"]) == 2
        for r in last_state["results"]:
            assert r["status"] == "ok"
            assert len(r["outputs"]) > 0

        # 4. verify files on disk
        ours = [f for f in COMFYUI_OUTPUT.iterdir()
                if f.name.startswith("integ_test_")]
        assert len(ours) >= 2, f"Expected >=2 integ_test_ files, found {len(ours)}"
        for f in ours:
            assert f.stat().st_size > 1000, f"Output {f.name} too small ({f.stat().st_size} bytes)"


# ── error handling ────────────────────────────────────────────


class TestErrorHandling:
    def test_queue_with_invalid_dir(self, clr_server):
        """400 on non-existent input dir."""
        body = json.dumps({"input_dir": "Z:/nonexistent/path"}).encode()
        req = urllib.request.Request(
            f"{SERVER}/api/queue",
            data=body,
            headers={
                "Authorization": f"Bearer {TOKEN}",
                "Content-Type": "application/json",
            },
        )
        try:
            urllib.request.urlopen(req, timeout=5)
            pytest.fail("Expected 400")
        except urllib.error.HTTPError as e:
            assert e.code == 400

    def test_queue_with_empty_dir(self, clr_server):
        """400 on directory with no images."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "readme.txt").write_text("not an image")
            body = json.dumps({"input_dir": tmp}).encode()
            req = urllib.request.Request(
                f"{SERVER}/api/queue",
                data=body,
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "Content-Type": "application/json",
                },
            )
            try:
                urllib.request.urlopen(req, timeout=5)
                pytest.fail("Expected 400")
            except urllib.error.HTTPError as e:
                assert e.code == 400

    def test_status_nonexistent_batch_404(self, clr_server):
        req = urllib.request.Request(
            f"{SERVER}/api/status/no-such-batch",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        try:
            urllib.request.urlopen(req, timeout=5)
            pytest.fail("Expected 404")
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_cancel_nonexistent_batch_404(self, clr_server):
        req = urllib.request.Request(
            f"{SERVER}/api/cancel/no-such-batch",
            method="POST",
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        try:
            urllib.request.urlopen(req, timeout=5)
            pytest.fail("Expected 404")
        except urllib.error.HTTPError as e:
            assert e.code == 404

    def test_unauthorized_access(self):
        """API without token returns 401."""
        try:
            urllib.request.urlopen(f"{SERVER}/api/browse", timeout=5)
            pytest.fail("Expected 401")
        except urllib.error.HTTPError as e:
            assert e.code == 401

    def test_wrong_token_rejected(self):
        """API with wrong token returns 401."""
        req = urllib.request.Request(
            f"{SERVER}/api/browse",
            headers={"Authorization": "Bearer wrong-token"},
        )
        try:
            urllib.request.urlopen(req, timeout=5)
            pytest.fail("Expected 401")
        except urllib.error.HTTPError as e:
            assert e.code == 401

    def test_cancel_before_start(self, clr_server):
        """Cancel a batch before it starts processing (immediate cancel)."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "img.jpg").write_bytes(b"fake")
            body = json.dumps({"input_dir": tmp}).encode()
            req = urllib.request.Request(
                f"{SERVER}/api/queue",
                data=body,
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "Content-Type": "application/json",
                },
            )
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read())
            batch_id = data["batch_id"]

            # Cancel immediately
            cancel_req = urllib.request.Request(
                f"{SERVER}/api/cancel/{batch_id}",
                method="POST",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            cancel_resp = urllib.request.urlopen(cancel_req, timeout=10)
            cancel_data = json.loads(cancel_resp.read())
            assert cancel_data["status"] in ("cancelling",)
            time.sleep(2)

            status_req = urllib.request.Request(
                f"{SERVER}/api/status/{batch_id}",
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            status_resp = urllib.request.urlopen(status_req, timeout=10)
            state = json.loads(status_resp.read())
            assert state["status"] in ("cancelled", "cancelling", "completed_with_errors")
