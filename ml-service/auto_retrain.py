"""Retrains the image model on the photos corrected in the field, and puts the result in service only if it is proven better.

    COFICAB_DATASET_KEY=<key> python auto_retrain.py [--epochs 15] [--dry-run]

1. export_corrections.py     photos corrected by the operators -> dataset_auto/   (skipped with --no-export)
2. merge                     dataset_merged/ (the three Roboflow datasets) + the field photos -> dataset_candidate/
3. fine-tune                 from the model in service; candidate: runs/detect/train/weights/best_candidate.pt
4. measure                   candidate and model in service, both, on
                               - the 38 held-out reference photos (dataset/test): the deciding figure, mAP@50
                               - the held-out test set of the merged datasets (dataset_merged/test): no class may lose more than 0.10 AP@50
                               - the field photos kept aside (dataset_auto/holdout), reported when there are at least 5
5. decide                    candidate mAP@50 on the reference photos > current: best.pt is replaced (the old one is kept in backups/),
                             POST /reload is called, and if the service cannot load the new weights the old ones are put back.
                             Otherwise best.pt is not touched.
Every run is written to logs/retrain_history.log. --dry-run does everything except replacing best.pt and reloading.

The reference photos are a fixed, small set (38 images): a gain of a few points is within the noise. The extra guards (no class that collapses)
and the log are there so that a decision can be read back; the figure to trust grows with the number of field photos in dataset_auto/holdout.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import yaml

from retrain_logic import BASE_CLASSES, decide

HERE = Path(__file__).resolve().parent
MERGED = HERE / "dataset_merged"
AUTO = HERE / "dataset_auto"
CANDIDATE = HERE / "dataset_candidate"
REFERENCE = HERE / "dataset" / "test"        # the 38 held-out photos of the first Roboflow dataset
WEIGHTS = HERE / "best.pt"
CANDIDATE_WEIGHTS = HERE / "runs" / "detect" / "train" / "weights" / "best_candidate.pt"
BACKUPS = HERE / "backups"
LOG = HERE / "logs" / "retrain_history.log"


def log(message: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.now().isoformat(timespec='seconds')} | {message}"
    print(line)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def build_candidate_dataset(names: list[str]) -> int:
    """The merged datasets plus the field photos (training split only: the holdout stays out). Returns the number of field photos."""
    if not MERGED.exists():
        from build_training_set import main as build_merged

        build_merged()
    shutil.rmtree(CANDIDATE, ignore_errors=True)
    shutil.copytree(MERGED, CANDIDATE)
    added = 0
    for image in sorted((AUTO / "images").glob("*")):
        label = AUTO / "labels" / (image.stem + ".txt")
        if label.exists():
            shutil.copyfile(image, CANDIDATE / "train" / "images" / f"field_{image.name}")
            shutil.copyfile(label, CANDIDATE / "train" / "labels" / f"field_{image.stem}.txt")
            added += 1
    (CANDIDATE / "data.yaml").write_text(yaml.safe_dump({
        "path": str(CANDIDATE), "train": "train/images", "val": "valid/images", "test": "test/images", "nc": len(names), "names": names,
    }, sort_keys=False), encoding="utf-8")
    return added


def evaluate(weights: Path, folder: Path, imgsz: int) -> dict:
    """mAP@50 overall and per class of a model on a folder that holds images/ and labels/."""
    from ultralytics import YOLO

    model = YOLO(str(weights))
    names = list(model.names.values()) if isinstance(model.names, dict) else list(model.names)
    spec = HERE / "runs" / "auto_eval.yaml"
    spec.parent.mkdir(parents=True, exist_ok=True)
    spec.write_text(yaml.safe_dump({"path": str(folder), "train": "images", "val": "images", "nc": len(names), "names": names}, sort_keys=False), encoding="utf-8")
    metrics = model.val(data=str(spec), imgsz=imgsz, plots=False, verbose=False)
    per_class = {names[int(i)]: round(float(v), 4) for i, v in zip(metrics.box.ap_class_index, metrics.box.ap50)}
    return {"map50": round(float(metrics.box.map50), 4), "per_class": per_class}


def reload_service(url: str) -> tuple[bool, str]:
    import requests

    headers = {"X-Reload-Token": os.environ["CV_RELOAD_TOKEN"]} if os.environ.get("CV_RELOAD_TOKEN") else {}
    try:
        reply = requests.post(url, headers=headers, timeout=120)
    except requests.RequestException as exc:
        return False, f"service not reachable ({exc.__class__.__name__})"
    return reply.ok, "" if reply.ok else f"HTTP {reply.status_code}: {reply.text[:200]}"


def deploy(reload_url: str, summary: str) -> str:
    """Replaces best.pt by the candidate, reloads the service, and puts the old weights back if the service cannot load the new ones."""
    BACKUPS.mkdir(exist_ok=True)
    backup = BACKUPS / f"best_{datetime.now():%Y%m%d_%H%M%S}.pt"
    shutil.copyfile(WEIGHTS, backup)
    staged = WEIGHTS.with_suffix(".new")
    shutil.copyfile(CANDIDATE_WEIGHTS, staged)
    os.replace(staged, WEIGHTS)
    ok, problem = reload_service(reload_url)
    if ok:
        return f"deployed (previous weights kept in {backup.name}); service reloaded"
    if problem.startswith("service not reachable"):
        return f"deployed (previous weights kept in {backup.name}); {problem}: restart or reload the service to use the new model"
    shutil.copyfile(backup, WEIGHTS)
    reload_service(reload_url)
    return f"ROLLED BACK: the service could not load the new weights ({problem})"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--imgsz", type=int, default=512)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--min-photos", type=int, default=10, help="field photos with a box needed to start a retraining")
    ap.add_argument("--min-gain", type=float, default=0.0, help="mAP@50 the candidate must gain on the reference photos (strictly more than)")
    ap.add_argument("--max-class-drop", type=float, default=0.10)
    ap.add_argument("--no-export", action="store_true", help="reuse dataset_auto/ as it is")
    ap.add_argument("--csv", type=Path, help="offline source for the export (see export_corrections.py)")
    ap.add_argument("--weak-boxes", action="store_true")
    ap.add_argument("--reload-url", default=os.environ.get("CV_RELOAD_URL", "http://127.0.0.1:5000/reload"))
    ap.add_argument("--dry-run", action="store_true", help="measure and decide, but do not replace best.pt nor reload the service")
    args = ap.parse_args()

    if not args.no_export:
        command = [sys.executable, str(HERE / "export_corrections.py")] + (["--csv", str(args.csv)] if args.csv else []) + (["--weak-boxes"] if args.weak_boxes else [])
        done = subprocess.run(command, cwd=HERE, capture_output=True, text=True)
        if done.returncode != 0:
            log(f"EXPORT FAILED | {done.stderr.strip()[-300:] or done.stdout.strip()[-300:]}")
            return 1
    if not (AUTO / "manifest.json").exists():
        log("NOTHING TO DO | no export in dataset_auto/")
        return 0
    names = json.loads((AUTO / "classes.json").read_text(encoding="utf-8"))["names"]
    summary = json.loads((AUTO / "manifest.json").read_text(encoding="utf-8"))["summary"]
    if summary["train"] < args.min_photos:
        log(f"NOT ENOUGH PHOTOS | {summary['train']} field photos with a box (needed {args.min_photos}); {summary['to_annotate']} wait for annotation, {summary['skipped']} cannot be learned")
        return 0
    if not WEIGHTS.exists():
        log("NO MODEL IN SERVICE | best.pt is missing, run train.py first")
        return 1

    added = build_candidate_dataset(names)
    from ultralytics import YOLO

    run = f"auto_{datetime.now():%Y%m%d_%H%M%S}"
    YOLO(str(WEIGHTS)).train(data=str(CANDIDATE / "data.yaml"), epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, patience=10, workers=4,
                             project=str(HERE / "runs" / "auto"), name=run, exist_ok=True, seed=7, plots=False, verbose=False)
    CANDIDATE_WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / "runs" / "auto" / run / "weights" / "best.pt", CANDIDATE_WEIGHTS)

    current = {"reference_map50": evaluate(WEIGHTS, REFERENCE, args.imgsz)["map50"], "per_class": evaluate(WEIGHTS, MERGED / "test", args.imgsz)["per_class"]}
    candidate = {"reference_map50": evaluate(CANDIDATE_WEIGHTS, REFERENCE, args.imgsz)["map50"], "per_class": evaluate(CANDIDATE_WEIGHTS, MERGED / "test", args.imgsz)["per_class"]}
    field = ""
    if len(list((AUTO / "holdout" / "images").glob("*"))) >= 5:
        f_cur, f_cand = evaluate(WEIGHTS, AUTO / "holdout", args.imgsz)["map50"], evaluate(CANDIDATE_WEIGHTS, AUTO / "holdout", args.imgsz)["map50"]
        field = f" | field photos kept aside: {f_cur:.4f} -> {f_cand:.4f}"
    decision = decide(current, candidate, args.min_gain, args.max_class_drop)
    facts = f"{added} field photos, new classes {names[len(BASE_CLASSES):] or 'none'}, {args.epochs} epochs{field}"

    if not decision.accept:
        log(f"REJECTED | best.pt unchanged | {decision.reason} | {facts}")
        return 0
    if args.dry_run:
        log(f"ACCEPTED (dry run, not deployed) | {decision.reason} | {facts}")
        return 0
    outcome = deploy(args.reload_url, decision.reason)
    log(f"ACCEPTED | {outcome} | {decision.reason} | {facts}")
    report = HERE / "best_report.json"
    if report.exists() and not outcome.startswith("ROLLED BACK"):
        data = json.loads(report.read_text(encoding="utf-8"))
        data["autoRetrain"] = {"date": datetime.now().isoformat(timespec="seconds"), "reference_map50": candidate["reference_map50"], "previous_reference_map50": current["reference_map50"], "field_photos": added}
        report.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
