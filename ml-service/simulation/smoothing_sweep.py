"""Why a smoothing weight of 6? Compare several weights with the same cross-validation as evaluate.py.

The weight is the number of "virtual" claims at the team average added to each employee's history:
rate = (on_time + team_average * W) / (closed + W). Small W trusts a few claims; large W erases real differences.
Selection uses repeated cross-validation only (never the time split used to report the final figure).

Usage: python smoothing_sweep.py --claims simulated_claims.csv [--report smoothing.md]
"""
from __future__ import annotations

import argparse

import pandas as pd
from sklearn.linear_model import LogisticRegression

from evaluate import build_features, cross_validate, time_split

WEIGHTS = [0, 1, 2, 4, 6, 10, 20, 40, 80]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--claims", required=True)
    ap.add_argument("--report")
    a = ap.parse_args()
    raw = pd.read_csv(a.claims, dtype={"assigned_to_id": str})
    cat, num = ["severity", "defect_type"], ["alloc_days", "user_rate", "user_n", "workload_at"]
    rows = []
    for w in WEIGHTS:
        d = build_features(raw, smoothing=w)
        cv, _ = cross_validate(d, cat, num, lambda: LogisticRegression(max_iter=2000, C=0.5))
        ts = time_split(d, cat, num, lambda: LogisticRegression(max_iter=2000, C=0.5))
        rows.append((w, cv["auc"], cv["auc_sd"], cv["brier"], ts["auc"]))
    best = max(rows, key=lambda r: r[1])[1]
    lines = ["| Poids W | AUC (validation croisée) | Écart-type | Brier | AUC découpage temps |", "|---|---|---|---|---|"]
    for w, auc, sd, br, tsa in rows:
        mark = " **(retenu)**" if w == 6 else ""
        lines.append(f"| {w}{mark} | {auc:.3f} | {sd:.3f} | {br:.3f} | {tsa:.3f} |")
    lines += ["", f"Meilleure AUC : {best:.3f}. Les écarts plus petits que l'écart-type d'un pli ne sont pas significatifs."]
    out = "\n".join(lines)
    print(out)
    if a.report:
        open(a.report, "w", encoding="utf-8").write(out + "\n")


if __name__ == "__main__":
    main()
