"""Maps what an object detector sees to the defect codes of the claim form.

Kept free of any PyTorch import so it can be tested on its own.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

DEFAULT_MAP_PATH = Path(__file__).resolve().parent / "cv_class_map.json"
CATALOG_PATH = Path(__file__).resolve().parent / "defect_catalog.json"


def _key(name: str) -> str:
    """'Cut Insulation', 'cut-insulation' and 'CUT_INSULATION' are the same class name."""
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def load_catalog(path: Path | str = CATALOG_PATH) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_class_map(path: Path | str = DEFAULT_MAP_PATH, catalog_path: Path | str = CATALOG_PATH) -> dict[str, str]:
    """Detector class name -> defect code of the application. Keys starting with '_' are comments.

    A detector whose classes are named like the defect codes (CUT_INSULATION...) needs no entry in the file: every cable code of the
    catalogue is accepted as its own class name.
    """
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    mapping = {_key(d["code"]): d["code"] for d in load_catalog(catalog_path)["defects"] if d["kind"] == "cable"}
    mapping.update({_key(k): v for k, v in raw.items() if not k.startswith("_") and isinstance(v, str) and v.strip()})
    return mapping


def line_context(code: str, catalog: dict | None = None) -> dict:
    """Where a defect is found: the line families (EXT, WR, CUT, CTL...) and the production lines of its process."""
    catalog = catalog or load_catalog()
    entry = next((d for d in catalog["defects"] if d["code"] == code), None)
    if entry is None:
        return {"lineFamilies": [], "lines": []}
    families = sorted(entry["lines"], key=lambda f: -entry["lines"][f])
    return {"lineFamilies": families, "lines": [line for f in families for line in catalog["lineFamilies"][f]]}


def pick_defect(
    detections: list[tuple[str, float]],
    class_map: dict[str, str],
    min_confidence: float = 0.25,
) -> tuple[str, float] | None:
    """The most confident detection that is a known defect class, as (defect code, confidence); None when there is none.

    A class the application does not know (a person, a car... for a general-purpose model) is ignored: the service never invents a defect.
    """
    best: tuple[str, float] | None = None
    for name, confidence in detections:
        code = class_map.get(_key(name))
        if code is None or confidence < min_confidence:
            continue
        if best is None or confidence > best[1]:
            best = (code, confidence)
    return best
