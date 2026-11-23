"""Starts the retraining of the image model by itself when enough new photos were validated. Meant to be run by a scheduler (every night or
every week): most runs end after one cheap check and do nothing.

    python retrain_if_due.py [--dry-run] [--force] [--min-new 20] [--min-days 7]

1. counts the photos the quality engineer validated (GET api/ml-features/cv-corrections?status=validated, same key as the training dataset:
   COFICAB_DATASET_KEY, or ML_DATASET_KEY of the .env at the root of the project)
2. decides with retrain_logic.retrain_due (enough new photos, enough time since the last run)
3. if due, runs auto_retrain.py, which exports, trains a candidate, measures it against the model in service and puts it in service
   only if it is proven better (nothing else changes: the guards of auto_retrain.py are the ones that protect the model)

Everything is written to logs/retrain_history.log. State: logs/retrain_state.json. A lock file stops two runs at the same time.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from auto_retrain import HERE, LOG, log
from retrain_logic import retrain_due

STATE = HERE / "logs" / "retrain_state.json"
LOCK = HERE / "logs" / "retrain.lock"
MIN_FREE_GB = 3.0
LOCK_MAX_AGE_HOURS = 12


def dataset_key() -> str | None:
    key = os.environ.get("COFICAB_DATASET_KEY") or os.environ.get("ML_DATASET_KEY")
    if key:
        return key
    env = HERE.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("ML_DATASET_KEY="):
                return line.split("=", 1)[1].strip().strip('"') or None
    return None


def count_validated(api: str, key: str) -> int:
    import requests

    reply = requests.get(f"{api}/ml-features/cv-corrections", params={"status": "validated"}, headers={"X-Dataset-Key": key}, timeout=60)
    reply.raise_for_status()
    return len(reply.json()["items"])


def load_state() -> dict:
    return json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default=os.environ.get("COFICAB_API_URL", "http://localhost:5129/api"))
    ap.add_argument("--min-new", type=int, default=20)
    ap.add_argument("--min-days", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true", help="check and say what would happen, start nothing")
    ap.add_argument("--force", action="store_true", help="start even if the rules say it is too early")
    args = ap.parse_args()

    key = dataset_key()
    if not key:
        log("AUTO CHECK FAILED | no dataset key (COFICAB_DATASET_KEY or ML_DATASET_KEY)")
        return 1
    try:
        validated = count_validated(args.api, key)
    except Exception as exc:  # the API is down or the key is wrong: try again at the next run
        log(f"AUTO CHECK FAILED | validated photos unreachable ({exc.__class__.__name__})")
        return 1

    state = load_state()
    decision = retrain_due(validated, state, datetime.now(), args.min_new, args.min_days)
    if not decision.due and not args.force:
        log(f"AUTO CHECK | not due | {decision.reason}")
        return 0
    if args.dry_run:
        log(f"AUTO CHECK (dry run) | would start | {decision.reason}")
        return 0

    free_gb = shutil.disk_usage(HERE).free / 1e9
    if free_gb < MIN_FREE_GB:
        log(f"AUTO RETRAIN SKIPPED | {free_gb:.1f} GB free, {MIN_FREE_GB:.0f} GB needed for a training")
        return 0
    if LOCK.exists() and (time.time() - LOCK.stat().st_mtime) < LOCK_MAX_AGE_HOURS * 3600:
        log("AUTO RETRAIN SKIPPED | a retraining is already running")
        return 0

    LOCK.parent.mkdir(parents=True, exist_ok=True)
    LOCK.write_text(datetime.now().isoformat(timespec="seconds"), encoding="utf-8")
    try:
        log(f"AUTO RETRAIN STARTED | {decision.reason}")
        env = {**os.environ, "COFICAB_DATASET_KEY": key, "COFICAB_API_URL": args.api}
        done = subprocess.run([sys.executable, str(HERE / "auto_retrain.py")], cwd=HERE, env=env)
        if done.returncode == 0:
            # the run was carried out (accepted or rejected: auto_retrain.py logs which); the same photos do not trigger another one
            STATE.write_text(json.dumps({"last_run": datetime.now().isoformat(timespec="seconds"), "last_count": validated}), encoding="utf-8")
        else:
            log(f"AUTO RETRAIN FAILED | auto_retrain.py exited with {done.returncode}")
        return done.returncode
    finally:
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
