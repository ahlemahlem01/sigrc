"""Fine-tunes YOLOv8n on the Roboflow cable datasets (see download_dataset.py) and writes best.pt and best_report.json.

    python train.py [--epochs 60] [--imgsz 640] [--batch 16]          # cable-defect only (ml-service/dataset/), from yolov8n.pt
    python build_training_set.py && python train.py --merged           # both datasets (ml-service/dataset_merged/), from the current best.pt

The first dataset (insulated cable photos, 239 images) gives foreign / hole / scratch / spot; the second one (steel wire-rope photos,
2,694 images) adds break / thunderbolt. The model can only propose the defect codes those classes stand for (cv_class_map.json). It is a
model trained on public images, not validated on Coficab photos.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASET = HERE / "dataset"


def write_local_yaml() -> Path:
    """Roboflow writes paths relative to the folder it was exported from; this one is absolute, so training works from anywhere."""
    import yaml

    source = yaml.safe_load((DATASET / "data.yaml").read_text(encoding="utf-8"))
    local = {
        "path": str(DATASET),
        "train": "train/images",
        "val": "valid/images",
        "test": "test/images",
        "nc": source["nc"],
        "names": source["names"],
    }
    target = DATASET / "data_local.yaml"
    target.write_text(yaml.safe_dump(local, sort_keys=False), encoding="utf-8")
    return target


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--base", default=None, help="starting weights (default yolov8n.pt, or the current best.pt with --merged)")
    ap.add_argument("--merged", action="store_true", help="train on dataset_merged/ (build_training_set.py) instead of dataset/")
    args = ap.parse_args()
    if args.base is None:
        args.base = str(HERE / "best.pt") if args.merged else "yolov8n.pt"

    from ultralytics import YOLO

    data = (HERE / "dataset_merged" / "data.yaml") if args.merged else write_local_yaml()
    run_name = "cable_merged" if args.merged else "cable"
    model = YOLO(args.base)
    model.train(data=str(data), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, patience=20, workers=4,
                project=str(HERE / "runs"), name=run_name, exist_ok=True, seed=7, verbose=False, plots=False)

    best = HERE / "runs" / run_name / "weights" / "best.pt"
    shutil.copyfile(best, HERE / "best.pt")

    # evaluation on the images the model never saw during training
    metrics = YOLO(str(HERE / "best.pt")).val(data=str(data), split="test", imgsz=args.imgsz, verbose=False)
    report = {
        "base": args.base, "epochs": args.epochs, "imgsz": args.imgsz,
        "data": "dataset_merged (cable-defect v3 + cable-damage v1)" if args.merged else "dataset (cable-defect v3)",
        "train_images": len(list((Path(str(data)).parent / "train" / "images").glob("*"))) if args.merged else len(list((DATASET / "train" / "images").glob("*"))),
        "test_images": len(list((Path(str(data)).parent / "test" / "images").glob("*"))) if args.merged else len(list((DATASET / "test" / "images").glob("*"))),
        "test_map50": round(float(metrics.box.map50), 4), "test_map50_95": round(float(metrics.box.map), 4),
        "per_class_map50": {n: round(float(v), 4) for n, v in zip(metrics.names.values(), metrics.box.ap50)},
        "dataset": "Roboflow cable-defect v3 + cable-damage-detection v1 (both CC BY 4.0)" if args.merged else "Roboflow cable-defect v3 (CC BY 4.0)",
    }
    (HERE / "best_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
