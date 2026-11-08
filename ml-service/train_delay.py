"""Trains the resolution-delay model from an export of the closed claims and writes artifacts/delay_model.joblib + delay_report.json.

    python train_delay.py closed_claims.csv

The CSV has one closed claim per row and the columns:
    defect, severity, client, line, shift, internal, produced, defective, assignee, created, completed
(`export_closed_claims.sql` in this folder produces it from the SQL Server database.)
The model is written even when it does not pass the validation gate: the report says "Indicatif" and the application then keeps the
empirical percentiles. Nothing is overwritten silently: the previous model and report are kept as *.previous.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import joblib
import pandas as pd

from delay_logic import fit_and_validate

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def main(path: str) -> int:
    raw = pd.read_csv(path, dtype=str, keep_default_na=False)
    result = fit_and_validate(raw)
    report = result["report"]
    ARTIFACTS.mkdir(exist_ok=True)
    for name in ("delay_model.joblib", "delay_report.json"):
        target = ARTIFACTS / name
        if target.exists():
            shutil.copyfile(target, target.with_name(target.stem + ".previous" + target.suffix))
    if result["bundle"] is not None:
        joblib.dump(result["bundle"], ARTIFACTS / "delay_model.joblib", compress=3)
    (ARTIFACTS / "delay_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
