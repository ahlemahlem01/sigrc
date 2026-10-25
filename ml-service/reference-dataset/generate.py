"""Generation of closed quality claims, to exercise and validate the recommendation pipeline.

THESE ARE GENERATED REFERENCE DATA. They are not Coficab data and must never be presented as such. Their purpose is to
check that the pipeline (feature building, training, evaluation) recovers relationships that are known because
they were written down here. On real history the model has to be retrained and evaluated again.

The data are produced by a process, never by a formula on the label: each claim gets an allocated time and a
work duration, and "on time" is simply "finished before the deadline". The signal in the label comes from the
causes below, and is blurred by random noise, so the strength of the relationship is not chosen by hand.

Assumptions (all of them are written here so they can be discussed):
  * Employees have a hidden ability, partly (not entirely) linked to seniority. Ability shortens the work.
  * Work takes longer when the employee already has open claims at assignment time (workload).
  * About 88 % of the claims are cable defects, the rest defects of the assembly workshop.
  * Defect types differ in difficulty; the higher the severity, the tighter the deadline compared to the work.
  * Durations are log-normal (long tail) with a small share of exceptional delays (blocked parts, absences).
  * The whole team is available during the whole period; hire dates only give a seniority proxy (the dates in the
    application are test data and too recent to describe a long history).
  * Claims still open on the "today" date are left out (right censoring), as in any real history.
  * About 7 % of claims have no deadline, so their punctuality is unknown (the label is empty).

Usage:
  python generate.py --employees employees.csv --out reference_claims.csv [--n 3200] [--seed 7]
employees.csv columns: user_id,name,hire_date (hire_date may be empty).
"""
from __future__ import annotations

import argparse
import bisect
import uuid
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
SEVERITY_P = [0.25, 0.31, 0.31, 0.13]
# Median allocated days per severity, and share of that time the median work needs (higher = tighter deadline).
ALLOCATED_MEDIAN = {"LOW": 30.0, "MEDIUM": 18.0, "HIGH": 12.0, "CRITICAL": 7.0}
TIGHTNESS = {"LOW": 0.56, "MEDIUM": 0.62, "HIGH": 0.69, "CRITICAL": 0.80}

# Mostly cable defects (the codes of the inspection reference list, stored as codes like the claim form does), plus a few
# defects of the harness-assembly workshop ("the factory"), so both kinds are present.
DEFECTS = {  # defect type -> (weight, difficulty on a log scale)
    "CUT_INSULATION": (0.28, 0.10), "COPPER_BLOOMING": (0.20, 0.20), "MARKING_DEFECT": (0.16, -0.20),
    "COLOR_MISMATCH": (0.12, -0.10), "SPOOL_DAMAGE": (0.12, -0.15),
    "Soudure défectueuse": (0.04, 0.10), "Connecteur desserré": (0.02, 0.05), "Manque de sertissage": (0.02, 0.15),
    "Étiquette manquante": (0.02, -0.25), "Non-conformité emballage": (0.02, -0.15),
}
# Where each defect is found: the cable defects on the cutting, extrusion, drawing and control lines, the others on the assembly lines.
LINES_BY_DEFECT = {
    "CUT_INSULATION": {"CUT-01": 0.30, "CUT-02": 0.30, "EXT-01": 0.20, "EXT-02": 0.20},
    "COPPER_BLOOMING": {"WR-01": 0.18, "WR-02": 0.18, "WR-03": 0.14, "WR-04": 0.20, "WR-05": 0.15, "WR-06": 0.15},
    "MARKING_DEFECT": {"EXT-01": 0.30, "EXT-02": 0.30, "CTL-01": 0.40},
    "COLOR_MISMATCH": {"EXT-01": 0.50, "EXT-02": 0.50},
    "SPOOL_DAMAGE": {"CUT-01": 0.25, "CUT-02": 0.25, "CTL-01": 0.50},
}
ASSEMBLY_LINES = {"ASM-01": 0.45, "ASM-03": 0.55}
SHIFTS = ["Matin", "Après-midi", "Nuit", "Équipe A", "Équipe B"]
CLIENTS = ["COFAT-MATEUR", "COFAT-TUNIS", "LEONI-MATEUR", "LEONI-MESSADINE", "YAZAKI-GAFSA", "APTIV-MONASTIR",
           "DRAXLMAIER-SOUSSE", "DRAXLMAIER-EL-FEJJA", "KROMBERG-BEJA"]  # direct customer sites (cablers)

START = datetime(2024, 1, 1)
END_CREATION = datetime(2026, 9, 5)
TODAY = datetime(2026, 10, 10)


def _weighted(rng: np.random.Generator, table: dict[str, float]) -> str:
    keys = list(table)
    w = np.array([table[k] if not isinstance(table[k], tuple) else table[k][0] for k in keys], dtype=float)
    return str(rng.choice(keys, p=w / w.sum()))


def generate(employees: pd.DataFrame, n_target: int, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)

    emp = employees.copy().reset_index(drop=True)
    emp["hire"] = pd.to_datetime(emp["hire_date"].replace("", np.nan)).fillna(pd.Timestamp("2023-01-01"))
    years = ((pd.Timestamp(TODAY) - emp["hire"]).dt.days / 365.25).clip(lower=0).to_numpy()
    z_years = (years - years.mean()) / (years.std() or 1.0)
    # Hidden ability: seniority explains only a part of it.
    ability = 0.30 * z_years + rng.normal(0.0, 0.45, len(emp))
    completions: list[list[float]] = [[] for _ in range(len(emp))]  # sorted completion timestamps per employee

    days = pd.date_range(START, END_CREATION, freq="D")
    weekly = np.array([1.0, 1.1, 1.1, 1.05, 0.95, 0.15, 0.05])  # fewer claims at weekends
    trend = np.linspace(0.85, 1.20, len(days))
    month_noise = rng.normal(1.0, 0.12, len(days) // 28 + 2)
    lam = weekly[days.dayofweek] * trend * np.array([month_noise[i // 28] for i in range(len(days))])
    lam *= n_target / lam.sum() * 0.92  # the claims still open today are dropped below

    rows = []
    for day, mean in zip(days, lam):
        for _ in range(rng.poisson(mean)):
            created = day.to_pydatetime() + timedelta(hours=float(rng.uniform(6, 20)))
            severity = str(rng.choice(SEVERITIES, p=SEVERITY_P))
            defect = _weighted(rng, DEFECTS)
            difficulty = DEFECTS[defect][1]
            line = _weighted(rng, LINES_BY_DEFECT.get(defect, ASSEMBLY_LINES))

            assigned = created + timedelta(hours=float(rng.exponential(10.0)))
            t_assigned = assigned.timestamp()
            eligible = np.arange(len(emp))  # the whole team is assumed available during the whole reference period
            open_load = np.array([len(completions[i]) - bisect.bisect_right(completions[i], t_assigned) for i in eligible])
            weights = np.exp(-0.45 * open_load)
            who = int(rng.choice(eligible, p=weights / weights.sum()))
            workload = int(len(completions[who]) - bisect.bisect_right(completions[who], t_assigned))

            alloc_days = ALLOCATED_MEDIAN[severity] * float(np.exp(rng.normal(0.0, 0.30)))
            work_days = (
                ALLOCATED_MEDIAN[severity] * TIGHTNESS[severity]
                * float(np.exp(-0.30 * ability[who] + 0.05 * min(workload, 12) + 0.20 * difficulty + rng.normal(0.0, 0.38)))
            )
            if rng.random() < 0.06:
                work_days *= float(rng.uniform(1.6, 2.6))  # exceptional delay
            completed = assigned + timedelta(days=work_days)
            bisect.insort(completions[who], completed.timestamp())
            if completed > TODAY:
                continue  # still open today: not part of the closed history

            has_deadline = rng.random() > 0.07
            deadline = (assigned + timedelta(days=alloc_days)).replace(hour=0, minute=0, second=0, microsecond=0)
            produced = int(np.exp(rng.normal(7.4, 0.9)))
            defective = int(max(1, produced * float(np.exp(rng.normal(-4.4 + 0.25 * SEVERITIES.index(severity), 0.5)))))
            rows.append({
                "claim_id": str(uuid.UUID(bytes=rng.bytes(16), version=4)).upper(),
                "defect_type": defect, "severity": severity, "client_id": str(rng.choice(CLIENTS)),
                "production_line": line, "shift": str(rng.choice(SHIFTS)),
                "produced_quantity": produced, "defective_quantity": min(defective, produced),
                "created_at": created, "detection_date": created - timedelta(hours=float(rng.uniform(0, 36))),
                "assigned_at": assigned, "deadline": deadline if has_deadline else pd.NaT, "completed_at": completed,
                "assigned_to_id": emp.loc[who, "user_id"], "assigned_to_name": emp.loc[who, "name"],
                "is_on_time": (completed.date() <= deadline.date()) if has_deadline else None,
            })
    df = pd.DataFrame(rows).sort_values("created_at").reset_index(drop=True)
    truth = pd.DataFrame({"user_id": emp["user_id"], "hidden_ability": ability})
    return df, truth


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--employees", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=3200)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--truth", help="optional CSV with the hidden ability of each employee (to check what the model recovers)")
    args = ap.parse_args()
    employees = pd.read_csv(args.employees, dtype=str, keep_default_na=False)
    df, truth = generate(employees, args.n, args.seed)
    df.to_csv(args.out, index=False)
    if args.truth:
        truth.to_csv(args.truth, index=False)
    labelled = df["is_on_time"].dropna()
    print(f"{len(df)} reference closed claims, {len(labelled)} with a known punctuality, "
          f"on-time rate {labelled.astype(float).mean():.3f}")


if __name__ == "__main__":
    main()
