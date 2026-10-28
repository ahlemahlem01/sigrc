"""
Image service of the claim form: proposes a defect code for a photo of a damaged cable.

    uvicorn app:app --host 127.0.0.1 --port 5000

POST /predict (multipart/form-data, field "file") answers
    { "available": true, "defectType": "CUT_INSULATION", "confidence": 0.85, "lineFamilies": ["CUT", "EXT"], "lines": ["CUT-01", ...] }
or { "available": false } when the model sees no defect it knows
(with "anomalyDetected": true and a confidence when it sees a defect it cannot name). The .NET API calls it (ComputerVision:ServiceUrl).

The weights are loaded at start-up: CV_MODEL_PATH, else best.pt (written by train.py / auto_retrain.py: yolov8n fine-tuned on the Roboflow
cable datasets and on the photos corrected in the field), else the general-purpose yolov8n.pt, which knows no cable defect and so never proposes one.

POST /reload loads the weights again without stopping the service (auto_retrain.py calls it after it put a better best.pt in place). If
CV_RELOAD_TOKEN is set, the call must carry the same value in the X-Reload-Token header. A model that fails to load never replaces the one in use.
"""

from __future__ import annotations

import hmac
import io
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from cv_mapping import DEFAULT_MAP_PATH, line_context, load_catalog, load_class_map, pick_defect

_TRAINED = Path(__file__).resolve().parent / "best.pt"  # written by train.py / auto_retrain.py


def current_model_path() -> str:
    """Looked up each time: best.pt may appear or change while the service is running."""
    return os.environ.get("CV_MODEL_PATH", str(_TRAINED) if _TRAINED.exists() else "yolov8n.pt")


MODEL_PATH = current_model_path()
MAP_PATH = os.environ.get("CV_CLASS_MAP", str(DEFAULT_MAP_PATH))
MIN_CONFIDENCE = float(os.environ.get("CV_MIN_CONFIDENCE", "0.25"))
MAX_BYTES = 10 * 1024 * 1024  # same limit as the claim form

state: dict[str, Any] = {"model": None, "class_map": {}, "known_classes": [], "catalog": None, "model_path": None, "loaded_at": None}


def _build_model(path: str):
    from ultralytics import YOLO  # imported here: the module stays importable (tests) without PyTorch

    return YOLO(path)


def _load_state() -> None:
    """(Re)loads the weights, the class map and the catalogue. Everything is built first and swapped in at the end."""
    path = current_model_path()
    model = _build_model(path)
    class_map = load_class_map(MAP_PATH)
    catalog = load_catalog()
    names = model.names.values() if isinstance(model.names, dict) else model.names
    known = sorted({c for c in (n.strip().lower().replace(" ", "_") for n in names) if c in class_map})
    state.update(model=model, class_map=class_map, catalog=catalog, known_classes=known, model_path=path,
                 loaded_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load_state()
    yield
    state["model"] = None


app = FastAPI(title="SIGRC image service", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if state["model"] is not None else "loading",
        "model": state["model_path"] or MODEL_PATH,
        "loadedAt": state["loaded_at"],
        # false for the general-purpose yolov8n.pt: it cannot name a cable defect
        "knowsCableDefects": len(state["known_classes"]) > 0,
        "defectClasses": state["known_classes"],
    }


@app.post("/reload")
def reload_model(x_reload_token: str | None = Header(default=None)) -> dict[str, Any]:
    """Loads best.pt again (after a retraining) without interrupting the service."""
    expected = os.environ.get("CV_RELOAD_TOKEN")
    if expected and not hmac.compare_digest(x_reload_token or "", expected):
        raise HTTPException(status_code=403, detail="Reload refused")
    try:
        _load_state()
    except Exception as exc:  # the model in use stays in place
        raise HTTPException(status_code=500, detail=f"Model not reloaded, the previous one is still in use: {exc}") from exc
    return {"status": "reloaded", "model": state["model_path"], "loadedAt": state["loaded_at"], "defectClasses": state["known_classes"]}


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, Any]:
    if state["model"] is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    data = await file.read()
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(status_code=413 if data else 400, detail="Empty or too large image (10 MB max)")
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Not an image") from None

    result = state["model"].predict(image, conf=MIN_CONFIDENCE, verbose=False)[0]
    names = result.names
    detections = [(names[int(c)], float(p)) for c, p in zip(result.boxes.cls.tolist(), result.boxes.conf.tolist())]
    picked = pick_defect(detections, state["class_map"], MIN_CONFIDENCE)
    if picked is None:
        # a defect the model sees but cannot name (class "defect" of the harness-lead dataset): say so instead of guessing a code
        generic = max((p for n, p in detections if n.strip().lower() == "defect"), default=None)
        if generic is not None and generic >= MIN_CONFIDENCE:
            return {"available": False, "anomalyDetected": True, "confidence": round(generic, 4)}
        return {"available": False}
    code, confidence = picked
    # the exact business code, plus where this defect is found (line families and lines of its process)
    return {"available": True, "defectType": code, "confidence": round(confidence, 4), **line_context(code, state["catalog"])}
