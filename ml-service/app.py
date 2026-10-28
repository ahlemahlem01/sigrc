"""
Image service of the claim form: proposes a defect code for a photo of a damaged cable.

    uvicorn app:app --host 127.0.0.1 --port 5000

POST /predict (multipart/form-data, field "file") answers
    { "available": true, "defectType": "CUT_INSULATION", "confidence": 0.85, "lineFamilies": ["CUT", "EXT"], "lines": ["CUT-01", ...] }
or { "available": false } when the model sees no defect it knows
(with "anomalyDetected": true and a confidence when it sees a defect it cannot name). The .NET API calls it (ComputerVision:ServiceUrl).

The weights are loaded at start-up: CV_MODEL_PATH, else best.pt (written by train.py / auto_retrain.py: yolov8n fine-tuned on the Roboflow
cable datasets and on the photos corrected in the field), else the general-purpose yolov8n.pt, which knows no cable defect and so never proposes one.

When the model is not sure (best confidence under CV_SIMILAR_BELOW, 0.70 by default) or recognises nothing, the answer also carries "similar_cases":
the 4 past cases whose photo looks most like this one (embeddings.py, index built by index_reclamations.py):
    [{ "id_reclamation", "photo_url" (a small embedded image), "code_defaut", "libelle_defaut", "score_similarite" (%), "source" ("claim" | "reference"),
       "reference", "severite" }, ...]

POST /index/refresh reads the photos of the claims again (GET api/ml-features/claim-photos with COFICAB_API_URL and COFICAB_DATASET_KEY, the
key of the training dataset) and puts them in the index next to the reference examples; with CV_INDEX_REFRESH_MINUTES > 0 the service does it by itself.

POST /reload loads the weights again without stopping the service (auto_retrain.py calls it after it put a better best.pt in place). If
CV_RELOAD_TOKEN is set, the call must carry the same value in the X-Reload-Token header. A model that fails to load never replaces the one in use.
"""

from __future__ import annotations

import asyncio
import hmac
import io
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from cv_mapping import DEFAULT_MAP_PATH, line_context, load_catalog, load_class_map, pick_defect
from embeddings import SimilarIndex, similar_cases, weights_signature, yolo_embedder

_TRAINED = Path(__file__).resolve().parent / "best.pt"  # written by train.py / auto_retrain.py


def current_model_path() -> str:
    """Looked up each time: best.pt may appear or change while the service is running."""
    return os.environ.get("CV_MODEL_PATH", str(_TRAINED) if _TRAINED.exists() else "yolov8n.pt")


MODEL_PATH = current_model_path()
MAP_PATH = os.environ.get("CV_CLASS_MAP", str(DEFAULT_MAP_PATH))
MIN_CONFIDENCE = float(os.environ.get("CV_MIN_CONFIDENCE", "0.25"))
MAX_BYTES = 10 * 1024 * 1024  # same limit as the claim form
INDEX_DIR = Path(os.environ.get("CV_SIMILAR_INDEX", str(Path(__file__).resolve().parent / "index")))
SIMILAR_BELOW = float(os.environ.get("CV_SIMILAR_BELOW", "0.70"))
SIMILAR_COUNT = 4

state: dict[str, Any] = {"model": None, "class_map": {}, "known_classes": [], "catalog": None, "model_path": None, "loaded_at": None, "index": None}


def _build_model(path: str):
    from ultralytics import YOLO  # imported here: the module stays importable (tests) without PyTorch

    return YOLO(path)


def _embed(model, images: list[Image.Image]):
    """Embeddings of photos with the model in service (replaced by a fake in the tests)."""
    return yolo_embedder(model)(images)


def _load_index(model, path: str) -> SimilarIndex | None:
    """The similar-photo index; embedded again with the new weights when they are not the ones it was built with."""
    index = SimilarIndex.load(INDEX_DIR)
    if index is None or not index.items:
        return None
    signature = weights_signature(path)
    if index.model_signature != signature:
        try:
            index.reembed(lambda images: _embed(model, images), signature)
        except Exception:  # unreadable photos or a model that cannot embed: no similar cases rather than a service that does not start
            return None
    return index


def _load_state() -> None:
    """(Re)loads the weights, the class map and the catalogue. Everything is built first and swapped in at the end."""
    path = current_model_path()
    model = _build_model(path)
    class_map = load_class_map(MAP_PATH)
    catalog = load_catalog()
    names = model.names.values() if isinstance(model.names, dict) else model.names
    known = sorted({c for c in (n.strip().lower().replace(" ", "_") for n in names) if c in class_map})
    index = _load_index(model, path)
    state.update(model=model, class_map=class_map, catalog=catalog, known_classes=known, model_path=path, index=index,
                 loaded_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))


def refresh_claim_photos() -> dict[str, Any]:
    """Claim photos of the application into the similar-photo index (the reference examples stay)."""
    api, key = os.environ.get("COFICAB_API_URL"), os.environ.get("COFICAB_DATASET_KEY")
    if not api or not key:
        raise RuntimeError("COFICAB_API_URL and COFICAB_DATASET_KEY are not set")
    if state["model"] is None:
        raise RuntimeError("model not loaded")
    from index_reclamations import claim_entries

    claims = claim_entries(api, key)
    signature = weights_signature(state["model_path"])
    index = state["index"] or SimilarIndex(INDEX_DIR, signature, [], np.zeros((0, 0), dtype=np.float32))
    index.refresh_claims(claims, lambda images: _embed(state["model"], images), signature)
    state["index"] = index
    return index.counts()


async def _refresh_loop(minutes: float) -> None:
    while True:
        await asyncio.sleep(minutes * 60)
        try:
            counts = await asyncio.to_thread(refresh_claim_photos)
            logging.getLogger("uvicorn.error").info("similar-photo index refreshed: %s", counts)
        except Exception as exc:  # the next round tries again; the index in use stays as it is
            logging.getLogger("uvicorn.error").warning("similar-photo index not refreshed: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load_state()
    minutes = float(os.environ.get("CV_INDEX_REFRESH_MINUTES", "0"))
    task = asyncio.create_task(_refresh_loop(minutes)) if minutes > 0 else None
    yield
    if task:
        task.cancel()
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
        "similarIndex": state["index"].counts() if state["index"] is not None else None,
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
    return {"status": "reloaded", "model": state["model_path"], "loadedAt": state["loaded_at"], "defectClasses": state["known_classes"],
            "similarIndex": state["index"].counts() if state["index"] is not None else None}


@app.post("/index/refresh")
async def refresh_index(x_reload_token: str | None = Header(default=None)) -> dict[str, Any]:
    """Reads the photos of the claims again (after new claims with a photo). Same token as /reload."""
    expected = os.environ.get("CV_RELOAD_TOKEN")
    if expected and not hmac.compare_digest(x_reload_token or "", expected):
        raise HTTPException(status_code=403, detail="Refresh refused")
    try:
        counts = await asyncio.to_thread(refresh_claim_photos)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Index not refreshed: {exc}") from exc
    return {"status": "refreshed", "similarIndex": counts}


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
    extra: dict[str, Any] = {}
    if (picked is None or picked[1] < SIMILAR_BELOW) and state["index"] is not None:
        # not sure, or nothing recognised: show the past cases that look like this photo
        try:
            labels = {d["code"]: d["fr"] for d in state["catalog"]["defects"] if d.get("fr")}
            cases = similar_cases(state["index"], _embed(state["model"], [image])[0], labels, SIMILAR_COUNT)
            if cases:
                extra["similar_cases"] = cases
        except Exception:  # the proposal never fails because of the similar-photo search
            pass
    if picked is None:
        # a defect the model sees but cannot name (class "defect" of the harness-lead dataset): say so instead of guessing a code
        generic = max((p for n, p in detections if n.strip().lower() == "defect"), default=None)
        if generic is not None and generic >= MIN_CONFIDENCE:
            return {"available": False, "anomalyDetected": True, "confidence": round(generic, 4), **extra}
        return {"available": False, **extra}
    code, confidence = picked
    # the exact business code, plus where this defect is found (line families and lines of its process)
    return {"available": True, "defectType": code, "confidence": round(confidence, 4), **line_context(code, state["catalog"]), **extra}
