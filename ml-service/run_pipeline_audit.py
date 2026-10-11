"""Execute training_model.ipynb code cells end-to-end and report status/metrics."""
from __future__ import annotations

import json
import traceback
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parent
NB = ROOT / "training_model.ipynb"

# Non-interactive helpers used by notebook cells
def display(obj=None, *args, **kwargs):  # noqa: A001
    if obj is not None:
        print(obj)


plt.show = lambda *a, **k: None  # type: ignore[assignment]

nb = json.loads(NB.read_text(encoding="utf-8"))
ns: dict = {"display": display, "__name__": "__main__"}

results = []
for i, cell in enumerate(nb["cells"]):
    if cell.get("cell_type") != "code":
        results.append({"cell": i, "type": "markdown", "status": "skipped"})
        continue
    src = "".join(cell.get("source", []))
    if not src.strip():
        results.append({"cell": i, "type": "code", "status": "empty"})
        continue
    title = src.strip().splitlines()[0][:80]
    print(f"\n======== CELL {i}: {title} ========")
    try:
        exec(compile(src, f"cell_{i}", "exec"), ns, ns)
        results.append({"cell": i, "type": "code", "status": "ok", "title": title})
        print(f"[OK] cell {i}")
    except Exception as exc:  # noqa: BLE001
        results.append(
            {
                "cell": i,
                "type": "code",
                "status": "error",
                "title": title,
                "error": f"{type(exc).__name__}: {exc}",
            }
        )
        print(f"[FAIL] cell {i}: {exc}")
        traceback.print_exc()
        break

summary = {
    "data_source": ns.get("data_source"),
    "n_rows_raw": int(len(ns["df"])) if "df" in ns else None,
    "n_rows_final": int(len(ns["df_final"])) if "df_final" in ns else None,
    "exception_rate": float(ns["EXCEPTION_RATE"]) if "EXCEPTION_RATE" in ns else None,
    "baseline_accuracy": float(ns["baseline_accuracy"]) if "baseline_accuracy" in ns else None,
    "cv_summary": ns["cv_summary"].to_dict(orient="records") if "cv_summary" in ns else None,
    "test_summary": ns["test_summary"].to_dict(orient="records") if "test_summary" in ns else None,
    "best_model": ns.get("best_name"),
    "best_f1": float(ns["best_f1"]) if "best_f1" in ns else None,
    "best_params": ns.get("best_params"),
    "grid_best_cv_f1": float(ns["grid_best_cv_f1"]) if "grid_best_cv_f1" in ns else None,
    "tuned_metrics": ns.get("tuned_metrics"),
    "tuning_comparison": ns["tuning_comparison"].to_dict(orient="records")
    if "tuning_comparison" in ns
    else None,
    "artifacts": sorted(p.name for p in (ROOT / "artifacts").glob("*"))
    if (ROOT / "artifacts").exists()
    else [],
    "cells": results,
}

out = ROOT / "pipeline_run_report.json"
out.write_text(json.dumps(summary, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
print("\n===== PIPELINE SUMMARY =====")
print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
