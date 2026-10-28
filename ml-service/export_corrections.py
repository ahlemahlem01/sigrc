"""Exports the photos corrected in the field to a YOLOv8 training folder: ml-service/dataset_auto/.

    COFICAB_DATASET_KEY=<key> COFICAB_API_URL=http://localhost:5129/api python export_corrections.py [--weak-boxes] [--min-new 20]
    python export_corrections.py --csv corrections.csv          # offline: columns file,code[,id]  (tests and demonstrations)

Source: the claims whose image proposal was corrected by the operator (CvCorrectionLogged) or was not confident enough (confidence < 0.70),
that still hold a photo and whose operator-kept code is a defect visible on a photo (GET api/ml-features/cv-corrections, same key as the
training dataset). The "table" is the column CvCorrectionLogged of the claims, read through that endpoint: this script never opens the database.

What it writes
  images/ labels/    photos with a box, to train on (the label is the code kept by the operator, never the model's guess)
  holdout/           20 % of those photos, kept aside to measure on field photos (never trained on)
  to_annotate/       photos with no box yet: a person has to draw it (Roboflow...)
  classes.json       the classes of the training folder: the model's own, then one per new code with at least --min-new photos
  manifest.json      every photo, what was done with it, and why when it was left out

Boxes. The operator names the defect, not where it is. By default the box comes from the model in service when it finds that same defect on the
photo ("model"); otherwise the photo goes to to_annotate/. With --weak-boxes a box over the centre of the photo is used instead ("weak"): a guess
that can teach the model that defects sit in the middle of the picture, so use it only when nobody can annotate.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Callable

from PIL import Image

from cv_mapping import load_catalog, load_class_map
from retrain_logic import BASE_CLASSES, build_label, is_holdout, plan_classes, yolo_line

HERE = Path(__file__).resolve().parent
OUT = HERE / "dataset_auto"
Detect = Callable[[Image.Image], list]


def export(rows: list[dict], get_photo: Callable[[dict], bytes], detect: Detect, class_map: dict[str, str], visual_codes: set[str],
           out: Path, allow_weak: bool = False, min_new: int = 20, holdout_share: float = 0.2) -> dict:
    plan = plan_classes([r["code"] for r in rows], class_map, visual_codes, BASE_CLASSES, min_new)
    for name in ("images", "labels", "holdout", "to_annotate"):
        shutil.rmtree(out / name, ignore_errors=True)
    for folder in ("images", "labels", "holdout/images", "holdout/labels", "to_annotate"):
        (out / folder).mkdir(parents=True, exist_ok=True)

    manifest = []
    for row in rows:
        entry = {"id": row["id"], "code": row["code"], "class": plan.assignment.get(row["code"])}
        if entry["class"] is None:
            entry.update(split="skipped", reason="not a defect visible on a photo" if row["code"] not in visual_codes else "too few photos for a new class")
            manifest.append(entry)
            continue
        try:
            image = Image.open(io.BytesIO(get_photo(row))).convert("RGB")
        except Exception as exc:  # unreadable photo
            entry.update(split="skipped", reason=f"unreadable photo: {exc}")
            manifest.append(entry)
            continue
        kind, boxes = build_label(detect(image), entry["class"], image.size, allow_weak=allow_weak)
        entry["annotation"] = kind
        stem = str(row["id"]).replace("-", "")[:24]
        if kind == "none":
            image.save(out / "to_annotate" / f"{stem}__{entry['class']}.jpg", quality=92)
            entry["split"] = "to_annotate"
        else:
            holdout = is_holdout(str(row["id"]), holdout_share)
            base = out / "holdout" if holdout else out
            image.save(base / "images" / f"{stem}.jpg", quality=92)
            class_id = plan.names.index(entry["class"])
            (base / "labels" / f"{stem}.txt").write_text("\n".join(yolo_line(class_id, b, *image.size) for b in boxes) + "\n")
            entry["split"] = "holdout" if holdout else "train"
        manifest.append(entry)

    (out / "classes.json").write_text(json.dumps({"names": plan.names}, indent=2), encoding="utf-8")
    summary = {
        "photos": len(rows),
        "train": sum(1 for m in manifest if m["split"] == "train"),
        "holdout": sum(1 for m in manifest if m["split"] == "holdout"),
        "to_annotate": sum(1 for m in manifest if m["split"] == "to_annotate"),
        "skipped": sum(1 for m in manifest if m["split"] == "skipped"),
        "new_classes": plan.names[len(BASE_CLASSES):],
    }
    (out / "manifest.json").write_text(json.dumps({"summary": summary, "items": manifest}, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


# ---- sources -------------------------------------------------------------------------------------------------------------------------

def rows_from_api(api: str, key: str) -> tuple[list[dict], Callable[[dict], bytes]]:
    import requests

    headers = {"X-Dataset-Key": key}
    reply = requests.get(f"{api}/ml-features/cv-corrections", headers=headers, timeout=60)
    reply.raise_for_status()
    rows = [{"id": i["claimId"], "code": i["defectType"], "predicted": i.get("predictedDefectType"), "confidence": i.get("confidence")}
            for i in reply.json()["items"]]

    def photo(row: dict) -> bytes:
        r = requests.get(f"{api}/ml-features/cv-corrections/{row['id']}/photo", headers=headers, timeout=60)
        r.raise_for_status()
        return r.content

    return rows, photo


def rows_from_csv(path: Path) -> tuple[list[dict], Callable[[dict], bytes]]:
    base = path.parent
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = [{"id": r.get("id") or Path(r["file"]).stem, "code": r["code"], "file": r["file"]} for r in csv.DictReader(f)]
    return rows, lambda row: (base / row["file"]).read_bytes()


def model_detector(weights: Path) -> Detect:
    """Boxes of the model in service, to locate the defect the operator named. Without weights nothing is pre-annotated."""
    if not weights.exists():
        return lambda image: []
    from ultralytics import YOLO

    model = YOLO(str(weights))

    def detect(image: Image.Image) -> list:
        r = model.predict(image, conf=0.10, verbose=False)[0]
        return [(r.names[int(c)], float(p), tuple(b)) for c, p, b in zip(r.boxes.cls.tolist(), r.boxes.conf.tolist(), r.boxes.xyxy.tolist())]

    return detect


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default=os.environ.get("COFICAB_API_URL", "http://localhost:5129/api"))
    ap.add_argument("--key", default=os.environ.get("COFICAB_DATASET_KEY"))
    ap.add_argument("--csv", type=Path, help="offline source: a CSV with columns file,code[,id] next to the photos")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--weights", type=Path, default=HERE / "best.pt")
    ap.add_argument("--weak-boxes", action="store_true", help="centre box when the model does not find the defect (a guess: see the module help)")
    ap.add_argument("--min-new", type=int, default=20, help="photos needed before a code with no class yet gets a class of its own")
    args = ap.parse_args()

    if args.csv:
        rows, photo = rows_from_csv(args.csv)
    else:
        if not args.key:
            sys.exit("Set COFICAB_DATASET_KEY (the ML_DATASET_KEY of the .env) or use --csv.")
        rows, photo = rows_from_api(args.api, args.key)
    catalog = load_catalog()
    visual = {d["code"] for d in catalog["defects"] if d["kind"] == "cable"}
    summary = export(rows, photo, model_detector(args.weights), load_class_map(), visual, args.out, args.weak_boxes, args.min_new)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
