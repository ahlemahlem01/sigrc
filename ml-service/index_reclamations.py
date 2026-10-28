"""Builds the index of similar photos used by the image service: ml-service/index/.

    COFICAB_DATASET_KEY=<key> python index_reclamations.py [--no-claims] [--no-reference] [--per-class 40]

Two kinds of items go in:
  claim      the photo attached to a past claim (read through GET api/ml-features/claim-photos with the key of the training dataset, never
             from the database directly). This is the point of the feature: with time the index fills up with the plant's own cases.
  reference  labelled public examples (the Roboflow datasets the model was trained on, CC BY 4.0), so that the search already has something to
             show while few claims hold a photo. They are shown as "reference example" in the application, never as a past claim.

Run it again when claims with photos have been added. The service re-embeds the stored photos by itself when its model changes (POST /reload).
"""
from __future__ import annotations

import argparse
import io
import os
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

from cv_mapping import load_class_map
from embeddings import SimilarIndex, weights_signature, yolo_embedder

HERE = Path(__file__).resolve().parent
NAMES_DS1 = ["foreign", "hole", "scratch", "spot"]
NAMES_DS2 = ["break", "thunderbolt"]


def reference_entries(class_map: dict[str, str], per_class: int, with_steel: bool = False) -> list[tuple[dict, Image.Image]]:
    """Single-defect photos of the insulated-cable training set, a few per class. The steel wire-rope photos (a different material: they look
    alike any twisted strands and would be offered for insulated wires) only come with --with-steel."""
    entries, taken = [], Counter()
    sources = [(HERE / "dataset" / "train", NAMES_DS1, "ds1", "Roboflow cable-defect v3")]
    if with_steel:
        sources.append((HERE / "dataset2" / "train", NAMES_DS2, "ds2", "Roboflow cable-damage-detection v1 (steel wire rope)"))
    for folder, names, tag, text in sources:
        if not folder.exists():
            continue
        for label in sorted((folder / "labels").glob("*.txt")):
            classes = {names[int(line.split()[0])] for line in label.read_text().splitlines() if line.strip()}
            if len(classes) != 1:
                continue
            name = classes.pop()
            code = class_map.get(name)
            if not code or taken[(tag, name)] >= per_class:
                continue
            image = next(iter((folder / "images").glob(label.stem + ".*")), None)
            if image is None:
                continue
            taken[(tag, name)] += 1
            entries.append(({"id": f"ref-{tag}-{label.stem[:32]}", "source": "reference", "reference": text, "defect_code": code,
                             "severity": None, "title": f"{name} ({tag})"}, Image.open(image)))
    return entries


def claim_entries(api: str, key: str) -> list[tuple[dict, Image.Image]]:
    import requests

    headers = {"X-Dataset-Key": key}
    reply = requests.get(f"{api}/ml-features/claim-photos", headers=headers, timeout=60)
    reply.raise_for_status()
    entries = []
    for row in reply.json()["items"]:
        photo = requests.get(f"{api}/ml-features/claim-photos/{row['claimId']}/photo", headers=headers, timeout=60)
        if not photo.ok:
            continue
        try:
            image = Image.open(io.BytesIO(photo.content))
            image.load()
        except Exception:  # an attachment that looks like an image but is not readable
            continue
        entries.append(({"id": row["claimId"], "source": "claim", "reference": row.get("reference"), "defect_code": row["defectType"],
                         "severity": row.get("severity"), "title": row.get("title")}, image))
    return entries


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=HERE / "index")
    ap.add_argument("--weights", type=Path, default=HERE / "best.pt")
    ap.add_argument("--api", default=os.environ.get("COFICAB_API_URL", "http://localhost:5129/api"))
    ap.add_argument("--key", default=os.environ.get("COFICAB_DATASET_KEY"))
    ap.add_argument("--no-claims", action="store_true")
    ap.add_argument("--no-reference", action="store_true")
    ap.add_argument("--per-class", type=int, default=40, help="reference photos per class and dataset")
    ap.add_argument("--with-steel", action="store_true", help="also index the steel wire-rope photos (not recommended for insulated cables)")
    args = ap.parse_args()
    if not args.weights.exists():
        sys.exit("best.pt is missing: train the image model first (train.py).")

    entries: list[tuple[dict, Image.Image]] = []
    if not args.no_claims:
        if not args.key:
            print("No COFICAB_DATASET_KEY: the photos of past claims are not read.")
        else:
            try:
                claims = claim_entries(args.api, args.key)
                print(f"{len(claims)} claim photos")
                entries += claims
            except Exception as exc:
                print(f"Claim photos not read ({exc.__class__.__name__}): {exc}")
    if not args.no_reference:
        refs = reference_entries(load_class_map(), args.per_class, args.with_steel)
        print(f"{len(refs)} reference photos")
        entries += refs
    if not entries:
        sys.exit("Nothing to index.")

    from ultralytics import YOLO

    index = SimilarIndex.build(args.out, entries, yolo_embedder(YOLO(str(args.weights))), weights_signature(args.weights))
    print("index written:", args.out, index.counts(), "vectors", index.vectors.shape)
    return 0


if __name__ == "__main__":
    sys.exit(main())
