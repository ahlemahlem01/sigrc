"""Similar-photo search for the image service: which past cases look like the photo that was just taken.

A photo becomes a vector (an "embedding"): the features the YOLOv8 model in service computes on it, taken from its last feature layer
(`YOLO.embed`, 256 numbers). The same model that recognises the defects therefore decides what "looks alike". Two photos are close when
the angle between their vectors is small (cosine similarity). The vectors are centred on the mean of the index first: raw features of one
network are all rather alike, and centring is what makes the scores tell cases apart.

The index lives in a folder (default ml-service/index/, written by index_reclamations.py):
    meta.json     {"model": <signature of the weights>, "items": [{id, source, reference, defect_code, severity, title, photo}, ...]}
    vectors.npy   one row per item
    photos/       the photos, 320 px, as they were embedded (so the index can be rebuilt for a new model without the original photos)

Items come from two sources: "claim" (a photo attached to a past claim) and "reference" (a labelled public example, shown as such).
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

EMBED_SIZE = 320
THUMB_SIZE = 160
Embedder = Callable[[list[Image.Image]], np.ndarray]


def weights_signature(path: str | Path) -> str:
    """Short fingerprint of the weights: an index built with other weights has to be embedded again."""
    p = Path(path)
    if not p.exists():
        return "unknown"
    digest = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:12]


def resize_for_index(image: Image.Image, size: int = EMBED_SIZE) -> Image.Image:
    image = image.convert("RGB")
    image.thumbnail((size, size))
    return image


def yolo_embedder(model, size: int = EMBED_SIZE) -> Embedder:
    def embed(images: list[Image.Image]) -> np.ndarray:
        try:
            vectors = model.embed([resize_for_index(i, size) for i in images], imgsz=size, verbose=False)
        finally:
            # embed() leaves the predictor in feature mode: the next predict() would return raw tensors instead of detections
            if hasattr(model, "predictor"):
                model.predictor = None
        return np.stack([np.asarray(v, dtype=np.float32).reshape(-1) for v in vectors])

    return embed


def _unit(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)


@dataclass
class SimilarIndex:
    folder: Path
    model_signature: str
    items: list[dict]
    vectors: np.ndarray            # raw embeddings, one row per item

    # ---- storage ----
    @classmethod
    def load(cls, folder: str | Path) -> "SimilarIndex | None":
        folder = Path(folder)
        meta, vectors = folder / "meta.json", folder / "vectors.npy"
        if not meta.exists() or not vectors.exists():
            return None
        data = json.loads(meta.read_text(encoding="utf-8"))
        return cls(folder, data.get("model", "unknown"), data["items"], np.load(vectors))

    def save(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        np.save(self.folder / "vectors.npy", self.vectors.astype(np.float32))
        (self.folder / "meta.json").write_text(json.dumps({"model": self.model_signature, "items": self.items}, ensure_ascii=False, indent=1), encoding="utf-8")

    def photo_path(self, item: dict) -> Path:
        return self.folder / "photos" / item["photo"]

    def counts(self) -> dict:
        sources = [i.get("source") for i in self.items]
        return {"items": len(self.items), "claims": sources.count("claim"), "references": sources.count("reference")}

    # ---- build / rebuild ----
    @classmethod
    def build(cls, folder: str | Path, entries: list[tuple[dict, Image.Image]], embed: Embedder, signature: str) -> "SimilarIndex":
        """entries: (metadata, photo). Photos are stored at EMBED_SIZE and embedded as stored."""
        folder = Path(folder)
        (folder / "photos").mkdir(parents=True, exist_ok=True)
        items, images = [], []
        for meta, photo in entries:
            small = resize_for_index(photo)
            name = f"{len(items):05d}.jpg"
            small.save(folder / "photos" / name, quality=90)
            items.append({**meta, "photo": name})
            images.append(small)
        vectors = np.zeros((0, 0), dtype=np.float32)
        for start in range(0, len(images), 32):
            batch = embed(images[start:start + 32])
            vectors = batch if start == 0 else np.vstack([vectors, batch])
        index = cls(folder, signature, items, vectors)
        index.save()
        return index

    def refresh_claims(self, claims: list[tuple[dict, Image.Image]], embed: Embedder, signature: str) -> "SimilarIndex":
        """The photos of the claims as they are now, next to the reference examples already in the index (those are kept as they are).
        Rebuilt in place (the folder may be a mount point); the photo files that no item uses any more are only copies and are removed."""
        references = [(dict(i), Image.open(self.photo_path(i)).convert("RGB")) for i in self.items if i.get("source") != "claim"]
        for meta, _ in references:
            meta.pop("photo", None)
        fresh = SimilarIndex.build(self.folder, claims + references, embed, signature)
        used = {i["photo"] for i in fresh.items}
        for stale in (self.folder / "photos").glob("*.jpg"):
            if stale.name not in used:
                stale.unlink()
        self.items, self.vectors, self.model_signature = fresh.items, fresh.vectors, fresh.model_signature
        return self

    def reembed(self, embed: Embedder, signature: str) -> None:
        """The model changed: embed the stored photos again."""
        images = [Image.open(self.photo_path(i)).convert("RGB") for i in self.items]
        vectors = None
        for start in range(0, len(images), 32):
            batch = embed(images[start:start + 32])
            vectors = batch if vectors is None else np.vstack([vectors, batch])
        self.vectors = vectors if vectors is not None else np.zeros((0, 0), dtype=np.float32)
        self.model_signature = signature
        self.save()

    # ---- search ----
    def search(self, query: np.ndarray, k: int = 4) -> list[tuple[int, float]]:
        """The k items closest to the query vector: (row, cosine similarity after centring on the mean of the index)."""
        if len(self.items) == 0:
            return []
        mean = self.vectors.mean(axis=0)
        matrix = _unit(self.vectors - mean)
        q = _unit((np.asarray(query, dtype=np.float32).reshape(-1) - mean)[None, :])[0]
        scores = matrix @ q
        order = np.argsort(-scores)[:k]
        return [(int(i), float(scores[i])) for i in order]


def thumbnail_data_uri(path: Path, size: int = THUMB_SIZE) -> str:
    image = Image.open(path).convert("RGB")
    image.thumbnail((size, size))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def similar_cases(index: SimilarIndex, vector: np.ndarray, labels: dict[str, str], k: int = 4) -> list[dict]:
    """The contract of the service: the k most similar past cases with the photo as a small embedded image (no URL to reach, nothing to authenticate)."""
    cases = []
    for row, score in index.search(vector, k):
        item = index.items[row]
        code = item.get("defect_code")
        cases.append({
            "id_reclamation": item.get("id"),
            "photo_url": thumbnail_data_uri(index.photo_path(item)),
            "code_defaut": code,
            "libelle_defaut": labels.get(code or "", code),
            "score_similarite": round(max(0.0, score) * 100, 1),
            "source": item.get("source"),
            "reference": item.get("reference"),
            "severite": item.get("severity"),
        })
    return cases
