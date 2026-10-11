"""Generate a CI/test LogisticRegression before collection so /recommend is not skipped."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def pytest_configure(config):  # noqa: ARG001
    from build_test_model import build

    build(ROOT / "artifacts")
