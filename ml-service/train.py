"""Fine-tunes yolov8n.pt on the Roboflow cable-defect dataset (ml-service/dataset/, see download_dataset.py) and writes best.pt.

    python train.py [--epochs 60] [--imgsz 640] [--batch 16]

The dataset has 4 visual classes (foreign, hole, scratch, spot) and 239 images: the model can only propose the defect codes
those classes stand for (cv_class_map.json). It is a first model on public images, not validated on Coficab photos.
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
    ap.add_argument("--base", default="yolov8n.pt")
    args = ap.parse_args()

    from ultralytics import YOLO

    data = write_local_yaml()
    model = YOLO(args.base)
    model.train(data=str(data), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, patience=20, workers=4,
                project=str(HERE / "runs"), name="cable", exist_ok=True, seed=7, verbose=False, plots=False)

    best = HERE / "runs" / "cable" / "weights" / "best.pt"
    shutil.copyfile(best, HERE / "best.pt")

    # evaluation on the images the model never saw during training
    metrics = YOLO(str(HERE / "best.pt")).val(data=str(data), split="test", imgsz=args.imgsz, verbose=False)
    report = {
        "base": args.base, "epochs": args.epochs, "imgsz": args.imgsz,
        "train_images": len(list((DATASET / "train" / "images").glob("*"))),
        "test_images": len(list((DATASET / "test" / "images").glob("*"))),
        "test_map50": round(float(metrics.box.map50), 4), "test_map50_95": round(float(metrics.box.map), 4),
        "per_class_map50": {n: round(float(v), 4) for n, v in zip(metrics.names.values(), metrics.box.ap50)},
        "dataset": "Roboflow cable-defect v3 (CC BY 4.0)",
    }
    (HERE / "best_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
