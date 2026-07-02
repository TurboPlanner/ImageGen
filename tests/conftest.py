import sys

import pytest

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def pytest_configure(config):
    config.addinivalue_line("markers", "integration: requires running ComfyUI backend")
    config.addinivalue_line("markers", "spa: requires ClearRefine server on port 8765")


def pytest_collection_modifyitems(items):
    for item in items:
        if "test_spa" in item.nodeid:
            item.add_marker(pytest.mark.spa)
