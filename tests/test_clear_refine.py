import json
import os
import shutil
import tempfile
from pathlib import Path

import pytest

import clear_refine


PROJECT_DIR = Path(__file__).resolve().parent.parent
TEST_INPUT_DIR = PROJECT_DIR / "TestInput"
WORKFLOW_PATH = PROJECT_DIR / "1Clear.json"
CONFIG_PATH = PROJECT_DIR / "clear_config.json"


@pytest.fixture(autouse=True)
def setup_logging():
    import logging
    logging.basicConfig(level=logging.DEBUG, force=True)


# ── unit tests ──────────────────────────────────────────────────


class TestLoadJson:
    def test_load_workflow_exists(self):
        wf = clear_refine.load_workflow()
        assert isinstance(wf, dict)
        assert len(wf) > 0
        assert any(
            n.get("class_type") == "CheckpointLoaderSimple"
            for n in wf.values()
        )

    def test_load_workflow_has_expected_nodes(self):
        wf = clear_refine.load_workflow()
        expected_types = {
            "CheckpointLoaderSimple", "LoraLoader", "CLIPTextEncode",
            "ControlNetLoader", "LoadImage", "ACN_AdvancedControlNetApply_v2",
            "KSampler", "VAEDecode", "FaceDetailer", "SaveImage",
            "VAEEncode", "UpscaleModelLoader", "ImageUpscaleWithModel",
            "UltralyticsDetectorProvider",
        }
        found = {n.get("class_type") for n in wf.values()}
        missing = expected_types - found
        assert not missing, f"Missing node types: {missing}"

    def test_load_config(self):
        cfg = clear_refine.load_config()
        assert "comfyui" in cfg
        assert "overrides" in cfg
        assert "processing" in cfg
        assert cfg["comfyui"]["base_url"] == "http://127.0.0.1:8188"


class TestBuildWorkflow:
    def test_sets_image_in_load_image_node(self):
        wf = clear_refine.build_workflow("test.png")
        for nid, node in wf.items():
            if node.get("class_type") == "LoadImage":
                assert node["inputs"]["image"] == "test.png"
                break
        else:
            pytest.fail("No LoadImage node found")

    def test_applies_overrides(self):
        cfg = clear_refine.load_config()
        cfg["overrides"] = {
            "8": {"inputs": {"steps": 10, "denoise": 0.5}}
        }
        wf = clear_refine.build_workflow("test.png", cfg)
        node_8 = wf.get("8", {})
        assert node_8.get("inputs", {}).get("steps") == 10
        assert node_8.get("inputs", {}).get("denoise") == 0.5

    def test_randomizes_seed_when_minus_one(self):
        cfg = clear_refine.load_config()
        cfg["overrides"] = {
            "8": {"inputs": {"seed": -1}}
        }
        wf = clear_refine.build_workflow("test.png", cfg)
        seed = wf["8"]["inputs"]["seed"]
        assert isinstance(seed, int)
        assert seed > 0

    def test_sets_output_prefix(self):
        cfg = clear_refine.load_config()
        cfg["processing"] = {"output_prefix": "mytest_"}
        wf = clear_refine.build_workflow("test.png", cfg)
        for nid, node in wf.items():
            if node.get("class_type") == "SaveImage":
                assert node["inputs"]["filename_prefix"] == "mytest_"
                break
        else:
            pytest.fail("No SaveImage node found")


class TestCollectImages:
    def test_collects_images_from_test_input(self):
        images = clear_refine.collect_images(TEST_INPUT_DIR)
        assert len(images) >= 2
        names = [p.name for p in images]
        assert "base.jpg" in names
        assert "dock1.jpg" in names

    def test_empty_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            images = clear_refine.collect_images(tmp)
            assert images == []

    def test_skips_non_images(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "readme.txt").write_text("hello")
            Path(tmp, "data.bin").write_bytes(b"\x00\x01")
            images = clear_refine.collect_images(tmp)
            assert images == []

    def test_respects_custom_extensions(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "img.tiff").write_bytes(b"fake")
            images = clear_refine.collect_images(tmp, {".tiff"})
            assert len(images) == 1
            assert images[0].name == "img.tiff"


class TestCopyToComfyInput:
    def test_copies_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp, "test.jpg")
            src.write_bytes(b"fake_image_data")
            out_dir = Path(tmp, "comfy_input")
            out_dir.mkdir()
            result = clear_refine.copy_to_comfy_input(src, out_dir)
            assert result == "test.jpg"
            assert (out_dir / "test.jpg").exists()
            assert (out_dir / "test.jpg").read_bytes() == b"fake_image_data"


class TestRandomSeed:
    def test_seed_is_positive_int(self):
        s = clear_refine.random_seed()
        assert isinstance(s, int)
        assert 0 < s < 2**64

    def test_seeds_are_unique(self):
        seeds = {clear_refine.random_seed() for _ in range(100)}
        assert len(seeds) > 90, "Too many seed collisions"


# ── integration tests (require running ComfyUI) ────────────────


def comfyui_available():
    import urllib.request
    base = clear_refine.COMFYUI_BASE_URL
    try:
        resp = urllib.request.urlopen(f"{base}/", timeout=5)
        return resp.status == 200
    except Exception:
        return False


@pytest.mark.integration
class TestComfyUI:
    @pytest.fixture(scope="class")
    def config(self):
        if not comfyui_available():
            pytest.skip("ComfyUI not reachable — start Comfy Desktop")
        return clear_refine.load_config()

    def test_server_responds(self, config):
        base = config["comfyui"]["base_url"]
        resp = urllib.request.urlopen(f"{base}/", timeout=5)
        assert resp.status == 200

    def test_process_single_image(self, config):
        test_img = TEST_INPUT_DIR / "base.jpg"
        if not test_img.exists():
            pytest.skip("Test image base.jpg not found")

        prompt_id, outputs = clear_refine.process_single_image(
            test_img, config,
        )
        assert prompt_id is not None
        assert len(prompt_id) > 0
        assert len(outputs) > 0
        for fname in outputs:
            assert len(fname) > 0

    def test_process_batch(self, config):
        results = clear_refine.process_batch(
            TEST_INPUT_DIR, config, max_images=2,
        )
        assert len(results) == 2
        for r in results:
            assert r["status"] == "ok"
            assert r["prompt_id"] is not None
            assert len(r["outputs"]) > 0

    def test_output_files_exist_after_processing(self, config):
        results = clear_refine.process_batch(
            TEST_INPUT_DIR, config, max_images=1,
        )
        assert len(results) == 1
        r = results[0]
        assert r["status"] == "ok"
        out_dir = Path(config["comfyui"]["output_dir"])
        for fname in r["outputs"]:
            file_path = out_dir / fname
            assert file_path.exists(), f"Output file not found: {file_path}"


# ── config integrity ────────────────────────────────────────────


class TestConfigIntegrity:
    def test_all_node_ids_in_config_match_workflow(self):
        wf = clear_refine.load_workflow()
        cfg = clear_refine.load_config()
        for nid in cfg.get("overrides", {}):
            assert nid in wf, f"Config references node {nid} not in workflow"

    def test_override_keys_exist_in_workflow(self):
        wf = clear_refine.load_workflow()
        cfg = clear_refine.load_config()
        for nid, over in cfg.get("overrides", {}).items():
            for key in over.get("inputs", {}):
                assert key in wf[nid]["inputs"], (
                    f"Config key '{key}' not in workflow node {nid}"
                )
