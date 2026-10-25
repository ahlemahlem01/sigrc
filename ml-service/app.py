"""
Image service of the claim form: proposes a defect code for a photo of a damaged cable.

    uvicorn app:app --host 127.0.0.1 --port 5000

POST /predict (multipart/form-data, field "file") answers
    { "available": true,  "defectType": "CUT_INSULATION", "confidence": 0.85 }
or { "available": false } when the model sees no defect it knows. The .NET API calls it (ComputerVision:ServiceUrl).

The weights are loaded once at start-up: CV_MODEL_PATH, "yolov8n.pt" by default (downloaded by ultralytics on first use).
yolov8n.pt is a general-purpose model: it recognises everyday objects, not cable defects. For real defect proposals, fine-tune
YOLOv8 on labelled photos of damaged cables (classes named as in cv_class_map.json) and point CV_MODEL_PATH at the result.
"""

from __future__ import annotations

import io
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from cv_mapping import DEFAULT_MAP_PATH, load_class_map, pick_defect

MODEL_PATH = os.environ.get("CV_MODEL_PATH", "yolov8n.pt")
MAP_PATH = os.environ.get("CV_CLASS_MAP", str(DEFAULT_MAP_PATH))
MIN_CONFIDENCE = float(os.environ.get("CV_MIN_CONFIDENCE", "0.25"))
MAX_BYTES = 10 * 1024 * 1024  # same limit as the claim form

state: dict[str, Any] = {"model": None, "class_map": {}, "known_classes": []}


@asynccontextmanager
async def lifespan(_: FastAPI):
    from ultralytics import YOLO  # imported here: the module stays importable (tests) without PyTorch

    model = YOLO(MODEL_PATH)
    state["model"] = model
    state["class_map"] = load_class_map(MAP_PATH)
    names = model.names.values() if isinstance(model.names, dict) else model.names
    state["known_classes"] = sorted({c for c in (n.strip().lower().replace(" ", "_") for n in names) if c in state["class_map"]})
    yield
    state["model"] = None


app = FastAPI(title="SIGRC image service", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok" if state["model"] is not None else "loading",
        "model": MODEL_PATH,
        # false for the general-purpose yolov8n.pt: it cannot name a cable defect
        "knowsCableDefects": len(state["known_classes"]) > 0,
        "defectClasses": state["known_classes"],
    }


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
        return {"available": False}
    code, confidence = picked
    return {"available": True, "defectType": code, "confidence": round(confidence, 4)}
