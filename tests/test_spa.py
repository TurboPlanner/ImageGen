import json
import os

import pytest

pytest.importorskip("playwright")

SERVER = os.environ.get("CLEARREFINE_SERVER", "http://127.0.0.1:8765")
TOKEN = os.environ.get("CLEARREFINE_TOKEN", "clear-refine-demo-token-2026")


@pytest.fixture(scope="module")
def browser():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        yield b
        b.close()


@pytest.fixture
def page(browser):
    ctx = browser.new_context(
        extra_http_headers={"Authorization": f"Bearer {TOKEN}"}
    )
    p = ctx.new_page()
    yield p
    ctx.close()


class TestSpa:
    def test_title(self, page):
        page.goto(SERVER)
        assert "ClearRefine" in page.title()

    def test_header_visible(self, page):
        page.goto(SERVER)
        assert page.locator("h1").first.is_visible()

    def test_browse_buttons(self, page):
        page.goto(SERVER)
        btns = page.get_by_text("Browse...")
        assert btns.count() == 2
        assert btns.first.is_visible()

    def test_directory_browser_opens(self, page):
        page.goto(SERVER)
        page.get_by_text("Browse...").first.click()
        assert page.get_by_text("Select this folder").is_visible()

    def test_input_shows_files(self, page):
        page.goto(SERVER)
        page.get_by_text("Browse...").first.click()
        page.wait_for_selector(".dir-entry.dir", timeout=5000)
        dir_entries = page.locator(".dir-entry.dir")
        assert dir_entries.count() >= 1

    def test_two_prompt_textareas(self, page):
        page.goto(SERVER)
        assert page.locator("textarea").count() == 2

    def test_input_and_output_dirs(self, page):
        page.goto(SERVER)
        body = page.locator("body").text_content()
        assert "Input Directory" in body
        assert "Output Directory" in body
        assert body.index("Input Directory") < body.index("Output Directory")

    def test_start_button_visible(self, page):
        page.goto(SERVER)
        btn = page.get_by_text("Start Processing")
        assert btn.is_visible()

    def test_swagger_ui_loads(self, page):
        page.goto(f"{SERVER}/api/docs")
        assert page.locator("text=ClearRefine API").is_visible()

    def test_openapi_spec_has_expected_paths(self, page):
        page.goto(f"{SERVER}/api/openapi.json")
        text = page.locator("pre").text_content()
        spec = json.loads(text)
        paths = set(spec.get("paths", {}).keys())
        expected = {"/api/queue", "/api/status/{batch_id}",
                    "/api/cancel/{batch_id}", "/api/browse"}
        assert expected.issubset(paths), f"Missing paths: {expected - paths}"

    def test_api_browse_without_auth_rejected(self):
        import urllib.request
        try:
            urllib.request.urlopen(f"{SERVER}/api/browse", timeout=5)
        except urllib.error.HTTPError as e:
            assert e.code == 401
        else:
            pytest.fail("Expected 401")

    def test_api_browse_with_auth_works(self, page):
        resp = page.context.request.get(
            f"{SERVER}/api/browse?path=C:%5CProjects%5CAIC%5CTestInput"
        )
        assert resp.status == 200
        body = resp.json()
        assert "images" in body
        assert "base.jpg" in body["images"]


class TestSpaErrors:
    def test_start_disabled_without_dir(self, page):
        page.goto(SERVER)
        btn = page.get_by_text("Start Processing")
        assert btn.is_disabled()

    def test_invalid_batch_status_returns_404(self, page):
        resp = page.context.request.get(
            f"{SERVER}/api/status/nonexistent-batch-id"
        )
        assert resp.status == 404
