"""ClearRefine — Core engine for batch image processing via ComfyUI.

Builds workflows from 1Clear.json, queues prompts to ComfyUI,
polls /history for progress, and supports cancellation via /interrupt.
"""

import asyncio
import concurrent.futures
import json
import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from urllib import request as url_req
from urllib.error import URLError

import structlog

logger = structlog.get_logger("clear_refine")

COMFYUI_INPUT_DIR = Path(
    "C:\\Users\\LENOVO\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\input"
)
COMFYUI_OUTPUT_DIR = Path(
    "C:\\Users\\LENOVO\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\output"
)
COMFYUI_BASE_URL = "http://127.0.0.1:8188"
PROJECT_DIR = Path(__file__).parent
WORKFLOW_PATH = PROJECT_DIR / "1Clear.json"
CONFIG_PATH = PROJECT_DIR / "clear_config.json"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_config():
    return load_json(CONFIG_PATH)


def load_workflow():
    return load_json(WORKFLOW_PATH)


def build_workflow(image_filename, config=None, positive_prompt=None, negative_prompt=None):
    """Build a ComfyUI workflow for the given image.

    Loads 1Clear.json, applies overrides from config (LoRA, ControlNet,
    KSampler, FaceDetailer), injects prompts, sets the image filename,
    and randomises seeds.

    Args:
        image_filename: Name of the image file in ComfyUI input dir.
        config: Override dict (from clear_config.json). If None, loaded.
        positive_prompt: Override for positive CLIP text encode.
        negative_prompt: Override for negative CLIP text encode.

    Returns:
        dict: The complete workflow ready for POST /prompt.
    """
    wf = load_workflow()
    if config is None:
        config = load_config()

    overrides = config.get("overrides", {})
    for node_id, node_overrides in overrides.items():
        if node_id not in wf:
            logger.warning("Node %s not found in workflow, skipping override", node_id)
            continue
        for key, value in node_overrides.get("inputs", {}).items():
            wf[node_id]["inputs"][key] = value

    if positive_prompt is not None or negative_prompt is not None:
        for node_id, node_data in wf.items():
            if node_data.get("class_type") != "CLIPTextEncode":
                continue
            inp = node_data["inputs"]
            text = inp["text"]
            if "[positive]" in text or text.startswith("hyper realism") or "HDR" in text:
                if positive_prompt is not None:
                    wf[node_id]["inputs"]["text"] = positive_prompt
            else:
                if negative_prompt is not None:
                    wf[node_id]["inputs"]["text"] = negative_prompt

    for node_id, node_data in wf.items():
        if node_data.get("class_type") == "LoadImage":
            wf[node_id]["inputs"]["image"] = image_filename
            logger.debug("Set image for node %s: %s", node_id, image_filename)
            break

    output_prefix = config.get("processing", {}).get("output_prefix", "refined_")
    for node_id, node_data in wf.items():
        if node_data.get("class_type") == "SaveImage":
            wf[node_id]["inputs"]["filename_prefix"] = output_prefix
            break

    for node_id, node_data in wf.items():
        for key, value in node_data.get("inputs", {}).items():
            if "seed" in key and value == -1:
                wf[node_id]["inputs"][key] = random_seed()
                logger.debug("Randomized seed for node %s: %s", node_id, wf[node_id]["inputs"][key])

    return wf


def random_seed():
    return int(uuid.uuid4().int & (2**64 - 1))


def copy_to_comfy_input(src_path, comfy_input_dir=None):
    if comfy_input_dir is None:
        comfy_input_dir = COMFYUI_INPUT_DIR
    comfy_input_dir = Path(comfy_input_dir)
    comfy_input_dir.mkdir(parents=True, exist_ok=True)
    dest = comfy_input_dir / src_path.name
    shutil.copy2(src_path, dest)
    logger.info("Copied %s -> %s", src_path, dest)
    return dest.name


def queue_prompt(workflow, base_url=None):
    if base_url is None:
        base_url = COMFYUI_BASE_URL
    body = json.dumps({"prompt": workflow}).encode("utf-8")
    req = url_req.Request(
        f"{base_url}/prompt",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with url_req.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            prompt_id = result.get("prompt_id")
            if not prompt_id:
                raise RuntimeError(f"No prompt_id in response: {result}")
            logger.info("Queued prompt %s", prompt_id)
            return prompt_id
    except URLError as e:
        raise RuntimeError(f"Failed to queue prompt: {e}") from e


def poll_prompt(prompt_id, base_url=None, poll_interval=2.0, timeout=300, cancel_event=None):
    if base_url is None:
        base_url = COMFYUI_BASE_URL
    start = time.monotonic()
    while True:
        if cancel_event and cancel_event.is_set():
            raise CancelledError("Cancelled by user")

        elapsed = time.monotonic() - start
        if elapsed > timeout:
            raise TimeoutError(f"Prompt {prompt_id} did not complete within {timeout}s")
        try:
            req = url_req.Request(f"{base_url}/history/{prompt_id}")
            with url_req.urlopen(req, timeout=10) as resp:
                history = json.loads(resp.read())
        except URLError:
            logger.debug("Poll %s: not ready yet", prompt_id)
            time.sleep(poll_interval)
            continue

        if prompt_id not in history:
            logger.debug("Poll %s: not in history yet", prompt_id)
            time.sleep(poll_interval)
            continue

        entry = history[prompt_id]
        status = entry.get("status", {})
        completed = status.get("completed")
        if completed:
            outputs = entry.get("outputs", {})
            filenames = []
            for node_out in outputs.values():
                for img in node_out.get("images", []):
                    filenames.append(img.get("filename", ""))
            logger.info(
                "Prompt %s completed in %.1fs, outputs: %s",
                prompt_id, elapsed, filenames,
            )
            return filenames
        errors = status.get("messages", [])
        if errors:
            error_msgs = [m for m in errors if m[0] == "error"]
            if error_msgs:
                raise RuntimeError(
                    f"Prompt {prompt_id} failed: {error_msgs}"
                )
        time.sleep(poll_interval)


class CancelledError(Exception):
    pass


def process_single_image(
    image_path,
    config=None,
    base_url=None,
    comfy_input_dir=None,
    copy_method="copy_to_comfy_input",
    cancel_event=None,
    positive_prompt=None,
    negative_prompt=None,
):
    if config is None:
        config = load_config()
    if base_url is None:
        base_url = config.get("comfyui", {}).get("base_url", COMFYUI_BASE_URL)
    if comfy_input_dir is None:
        comfy_input_dir = Path(
            config.get("comfyui", {}).get("input_dir", COMFYUI_INPUT_DIR)
        )

    image_path = Path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    if cancel_event and cancel_event.is_set():
        raise CancelledError()

    if copy_method == "copy_to_comfy_input":
        filename = copy_to_comfy_input(image_path, comfy_input_dir)
    else:
        filename = image_path.name

    processing_cfg = config.get("processing", {})
    poll_interval = processing_cfg.get("poll_interval", 2.0)
    poll_timeout = processing_cfg.get("poll_timeout", 300)

    workflow = build_workflow(filename, config, positive_prompt, negative_prompt)

    if cancel_event and cancel_event.is_set():
        raise CancelledError()

    prompt_id = queue_prompt(workflow, base_url)
    output_filenames = poll_prompt(
        prompt_id, base_url, poll_interval, poll_timeout, cancel_event
    )
    return prompt_id, output_filenames


def collect_images(source_dir, extensions=None):
    if extensions is None:
        extensions = IMAGE_EXTENSIONS
    source_dir = Path(source_dir)
    if not source_dir.exists():
        return []
    images = sorted(
        p for p in source_dir.iterdir()
        if p.suffix.lower() in extensions and not p.name.startswith(".")
    )
    return images


def process_batch(
    source_dir,
    config=None,
    base_url=None,
    comfy_input_dir=None,
    copy_method="copy_to_comfy_input",
    max_images=None,
    cancel_event=None,
    progress_callback=None,
    positive_prompt=None,
    negative_prompt=None,
):
    if config is None:
        config = load_config()

    images = collect_images(source_dir)
    if not images:
        logger.warning("No images found in %s", source_dir)
        return []

    if max_images is not None and len(images) > max_images:
        images = images[:max_images]
        logger.info("Limited to %d images", max_images)

    total = len(images)
    results = []
    for idx, img_path in enumerate(images):
        if cancel_event and cancel_event.is_set():
            logger.info("Batch cancelled after %d/%d images", idx, total)
            break

        try:
            logger.info("Processing: %s (%d/%d)", img_path.name, idx + 1, total)
            if progress_callback:
                progress_callback(idx, total, img_path.name, "processing")

            prompt_id, outputs = process_single_image(
                img_path, config, base_url, comfy_input_dir, copy_method,
                cancel_event, positive_prompt, negative_prompt,
            )
            elapsed = 0
            results.append({
                "image": img_path.name,
                "prompt_id": prompt_id,
                "outputs": outputs,
                "status": "ok",
            })
            logger.info("Done: %s -> %s", img_path.name, outputs)
            if progress_callback:
                progress_callback(idx + 1, total, img_path.name, "completed")
        except CancelledError:
            logger.info("Skipped %s due to cancellation", img_path.name)
            results.append({
                "image": img_path.name,
                "prompt_id": None,
                "outputs": [],
                "status": "cancelled",
            })
            break
        except Exception as e:
            logger.error("Failed %s: %s", img_path.name, e)
            results.append({
                "image": img_path.name,
                "prompt_id": None,
                "outputs": [],
                "status": f"error: {e}",
            })
            if progress_callback:
                progress_callback(idx + 1, total, img_path.name, "failed")
    return results


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    import argparse

    parser = argparse.ArgumentParser(description="Batch refine images via ComfyUI")
    parser.add_argument("source", nargs="?", default=str(PROJECT_DIR / "TestInput"),
                        help="Source directory with images")
    parser.add_argument("--config", default=str(CONFIG_PATH),
                        help="Config file path")
    parser.add_argument("--max", type=int, default=None,
                        help="Max images to process")
    parser.add_argument("--single", type=str, default=None,
                        help="Process a single image file")
    args = parser.parse_args()

    config = load_json(args.config) if args.config else None

    if args.single:
        prompt_id, outputs = process_single_image(Path(args.single), config)
        print(json.dumps({"prompt_id": prompt_id, "outputs": outputs}, indent=2))
    else:
        results = process_batch(Path(args.source), config, max_images=args.max)
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
