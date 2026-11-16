"""Resolution-delay model: quantile gradient boosting (P50 / P80) compared with the empirical-percentile baseline.

The application's current estimate is descriptive statistics: P50 / P80 of closed claims of the same defect and severity (cascade
type+severity -> severity -> all, at least 5 cases). This module trains a model on the claim's creation-time features and measures, on the
most recent claims the model never saw, whether it does better than that baseline. The model is only used when it passes the gate
(see `fit_and_validate`); otherwise the application keeps the percentiles.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

CAT_FEATURES = ["defect", "severity", "client", "line", "shift", "assignee"]
NUM_FEATURES = ["internal", "month", "produced", "defective", "rate"]
REQUIRED_COLUMNS = ["defect", "severity", "created", "completed"]
MIN_BASELINE_SAMPLE = 5          # same rule as ClaimResolutionEstimateLogic.cs
MIN_ROWS = 300                   # below this, no model is trained at all
COVERAGE_RANGE = (0.74, 0.86)    # the P80 must really cover about 80 % of unseen claims
DATA_NOTE = ("Les données d'entraînement sont en grande partie des données de référence : ces chiffres montrent la méthode, "
             "pas la performance réelle chez Coficab.")


def pinball(y: np.ndarray, q: np.ndarray, alpha: float) -> float:
    d = np.asarray(y, dtype=float) - np.asarray(q, dtype=float)
    return float(np.mean(np.maximum(alpha * d, (alpha - 1) * d)))


def make_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Clean copy with the model's columns; days = created -> completed, oldest claims first."""
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"missing columns: {missing}")
    out = pd.DataFrame(index=df.index)
    out["created"] = pd.to_datetime(df["created"])
    out["completed"] = pd.to_datetime(df["completed"])
    out["days"] = (out["completed"] - out["created"]).dt.total_seconds() / 86400
    for c in ("defect", "severity", "client", "line", "shift", "assignee"):
        out[c] = df[c].fillna("").astype(str).str.strip() if c in df.columns else ""
    out["severity"] = out["severity"].str.upper()
    out["internal"] = pd.to_numeric(df["internal"], errors="coerce").fillna(0).astype(int) if "internal" in df.columns else 0
    out["month"] = out["created"].dt.month
    out["produced"] = pd.to_numeric(df["produced"], errors="coerce").fillna(0) if "produced" in df.columns else 0.0
    out["defective"] = pd.to_numeric(df["defective"], errors="coerce").fillna(0) if "defective" in df.columns else 0.0
    out["rate"] = (out["defective"] / out["produced"].replace(0, np.nan)).fillna(0.0)
    out = out[out["days"] >= 0].sort_values("created").reset_index(drop=True)
    return out


def centile_baseline(train: pd.DataFrame, test: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """The application's current method, computed on the training claims only."""
    by_ts = {k: v["days"].to_numpy() for k, v in train.groupby(["defect", "severity"])}
    by_s = {k: v["days"].to_numpy() for k, v in train.groupby("severity")}
    everything = train["days"].to_numpy()
    p50, p80 = [], []
    for defect, sev in zip(test["defect"], test["severity"]):
        x = by_ts.get((defect, sev), np.array([]))
        if len(x) < MIN_BASELINE_SAMPLE:
            x = by_s.get(sev, np.array([]))
        if len(x) < MIN_BASELINE_SAMPLE:
            x = everything
        p50.append(np.percentile(x, 50))
        p80.append(np.percentile(x, 80))
    return np.array(p50), np.array(p80)


def build_pipeline(alpha: float) -> Pipeline:
    prep = ColumnTransformer(
        [("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CAT_FEATURES),
         ("num", "passthrough", NUM_FEATURES)])
    gb = HistGradientBoostingRegressor(loss="quantile", quantile=alpha, max_iter=300, learning_rate=0.05, max_depth=4, random_state=7)
    return Pipeline([("prep", prep), ("gb", gb)])


ASSIGNEE_MASK_RATE = 0.3   # the person in charge is often not known yet when the estimate is asked: the model learns to cope without


def mask_assignee(frame: pd.DataFrame, rate: float = ASSIGNEE_MASK_RATE, seed: int = 7) -> pd.DataFrame:
    out = frame.copy()
    hide = np.random.default_rng(seed).random(len(out)) < rate
    out.loc[hide, "assignee"] = ""
    return out


def _fit_pair(frame: pd.DataFrame) -> tuple[Pipeline, Pipeline]:
    frame = mask_assignee(frame)
    x = frame[CAT_FEATURES + NUM_FEATURES]
    m50 = build_pipeline(0.5).fit(x, frame["days"].to_numpy())
    m80 = build_pipeline(0.8).fit(x, frame["days"].to_numpy())
    return m50, m80


def _predict_arrays(m50: Pipeline, m80: Pipeline, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    x = frame[CAT_FEATURES + NUM_FEATURES]
    p50 = np.maximum(m50.predict(x), 0.0)
    p80 = np.maximum(m80.predict(x), p50)       # quantiles never cross
    return p50, p80


def fit_and_validate(raw: pd.DataFrame, test_fraction: float = 0.2, n_boot: int = 500, seed: int = 7) -> dict[str, Any]:
    """Temporal hold-out: train on the oldest claims, test on the newest. Returns {"bundle", "report"} or {"bundle": None, "report"}.

    The gate (every condition must hold, in both situations: person in charge known, and not known yet):
      1. the P80 pinball loss beats the percentile baseline, with a 95 % bootstrap interval of the gain entirely above 0;
      2. the P50 pinball loss also beats the baseline;
      3. the P80 really covers between 74 % and 86 % of the unseen claims.
    """
    frame = make_frame(raw)
    n = len(frame)
    if n < MIN_ROWS:
        return {"bundle": None, "report": {"validated": False, "label": "Indicatif", "reason": f"trop peu de dossiers clos ({n} < {MIN_ROWS})", "trainRows": n}}

    cut = int(n * (1 - test_fraction))
    train, test = frame.iloc[:cut], frame.iloc[cut:]
    y = test["days"].to_numpy()

    b50, b80 = centile_baseline(train, test)
    m50, m80 = _fit_pair(train)
    base = {"pinball50": pinball(y, b50, 0.5), "pinball80": pinball(y, b80, 0.8), "coverage80": float(np.mean(y <= b80))}

    def evaluate(frame_eval: pd.DataFrame) -> tuple[dict[str, float], float, float, float, float]:
        p50, p80 = _predict_arrays(m50, m80, frame_eval)
        res = {"pinball50": pinball(y, p50, 0.5), "pinball80": pinball(y, p80, 0.8), "coverage80": float(np.mean(y <= p80))}
        rng = np.random.default_rng(seed)
        gains = []
        for _ in range(n_boot):
            i = rng.integers(0, len(y), len(y))
            gains.append(pinball(y[i], b80[i], 0.8) - pinball(y[i], p80[i], 0.8))
        lo, hi = (float(v) for v in np.percentile(gains, [2.5, 97.5]))
        g50 = 100 * (base["pinball50"] - res["pinball50"]) / base["pinball50"]
        g80 = 100 * (base["pinball80"] - res["pinball80"]) / base["pinball80"]
        return res, lo, hi, g50, g80

    known, lo_k, hi_k, g50_k, g80_k = evaluate(test)                                   # the person in charge is known
    blind, lo_b, hi_b, g50_b, g80_b = evaluate(test.assign(assignee=""))               # the person in charge is not known yet
    checks = {
        "p80GainCiAboveZero_assigneeKnown": lo_k > 0,
        "p80GainCiAboveZero_assigneeUnknown": lo_b > 0,
        "p50BeatsBaseline_both": known["pinball50"] < base["pinball50"] and blind["pinball50"] < base["pinball50"],
        "p80CoverageCalibrated_both": all(COVERAGE_RANGE[0] <= m["coverage80"] <= COVERAGE_RANGE[1] for m in (known, blind)),
    }
    validated = all(checks.values())

    report = {
        "validated": validated,
        "label": "Modèle validé" if validated else "Indicatif",
        "trainRows": int(len(train)), "testRows": int(len(test)),
        "trainPeriod": [str(train["created"].min().date()), str(train["created"].max().date())],
        "testPeriod": [str(test["created"].min().date()), str(test["created"].max().date())],
        "baseline": {k: round(v, 3) for k, v in base.items()},
        "modelAssigneeKnown": {k: round(v, 3) for k, v in known.items()},
        "modelAssigneeUnknown": {k: round(v, 3) for k, v in blind.items()},
        "gainPct": {"assigneeKnown": {"pinball50": round(g50_k, 1), "pinball80": round(g80_k, 1)},
                    "assigneeUnknown": {"pinball50": round(g50_b, 1), "pinball80": round(g80_b, 1)}},
        "p80GainCi95": {"assigneeKnown": [round(lo_k, 3), round(hi_k, 3)], "assigneeUnknown": [round(lo_b, 3), round(hi_b, 3)]},
        "checks": checks,
        "features": CAT_FEATURES + NUM_FEATURES,
        "note": DATA_NOTE,
    }
    # the model that is shipped learns from every closed claim, the report above is the honest hold-out measure
    final50, final80 = _fit_pair(frame)
    report["finalTrainRows"] = int(n)
    return {"bundle": {"m50": final50, "m80": final80, "report": report, "version": 1}, "report": report}


def predict_one(bundle: dict[str, Any], row: dict[str, Any]) -> tuple[float, float]:
    """P50 / P80 in days for one claim described by creation-time fields (same names as the training frame)."""
    produced = float(row.get("produced") or 0)
    defective = float(row.get("defective") or 0)
    frame = pd.DataFrame([{
        "defect": str(row.get("defect") or "").strip(),
        "severity": str(row.get("severity") or "").strip().upper(),
        "client": str(row.get("client") or "").strip(),
        "line": str(row.get("line") or "").strip(),
        "shift": str(row.get("shift") or "").strip(),
        "assignee": str(row.get("assignee") or "").strip(),
        "internal": int(bool(row.get("internal"))),
        "month": int(row.get("month") or 1),
        "produced": produced,
        "defective": defective,
        "rate": defective / produced if produced else 0.0,
    }])
    p50, p80 = _predict_arrays(bundle["m50"], bundle["m80"], frame)
    return round(float(p50[0]), 1), round(float(p80[0]), 1)
