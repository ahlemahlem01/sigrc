"""Retrain the "delivered on time" model and refresh artifacts/.

Data: GET <COFICAB_API_URL>/ml-features/training-dataset (key in COFICAB_DATASET_KEY), or a CSV with --csv.
Every row carries what was known when the claim was assigned (see Coficab.ActionPlan.Application/MlFeatures):
  OnTimeRate   smoothed punctuality of the assigned employee before this claim
  ClosedCount  how many claims that rate is based on
  OpenClaims   claims of the employee still open at assignment
  AllocDays    days between assignment and deadline
  DefectType, Severity

The model is evaluated before it is saved, and the artifacts record the result:
  * repeated 5-fold cross-validation (AUC, Brier, accuracy) and a split in time,
  * the same evaluation WITHOUT the employee features, to see what the employee information really adds,
  * `validated` is true only if the model clearly beats chance and the employee features add something
    (see is_validated). The application shows an unvalidated recommendation as "indicative".
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import requests
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"

CAT = ["DefectType", "Severity"]
NUM_CLAIM = ["AllocDays"]
NUM_EMPLOYEE = ["OnTimeRate", "ClosedCount", "OpenClaims"]
NUM = NUM_EMPLOYEE + NUM_CLAIM
TARGET = "IsOnTime"

MIN_AUC = 0.60            # the model must clearly beat chance (0.5)
MIN_EMPLOYEE_GAIN = 0.01  # and the employee features must improve the AUC of the claim-only model
MIN_ROWS = 200


def is_validated(auc_full: float, auc_claim_only: float) -> bool:
    """A recommendation is "validated" only if it beats chance AND employee information adds value."""
    return auc_full >= MIN_AUC and (auc_full - auc_claim_only) >= MIN_EMPLOYEE_GAIN


def _normalize_severity(s: object) -> str:
    if s is None or (isinstance(s, float) and np.isnan(s)):
        return "MEDIUM"
    v = str(s).strip().upper()
    aliases = {"CRITIQUE": "CRITICAL", "ELEVEE": "HIGH", "ÉLEVÉE": "HIGH", "MOYENNE": "MEDIUM", "FAIBLE": "LOW"}
    return aliases.get(v, v)


def load(args: argparse.Namespace) -> pd.DataFrame:
    if args.csv:
        return pd.read_csv(args.csv)
    url = os.environ.get("COFICAB_API_URL", "http://localhost:5129/api").rstrip("/") + "/ml-features/training-dataset"
    headers = {"X-Dataset-Key": os.environ.get("COFICAB_DATASET_KEY", "")}
    r = requests.get(url, headers=headers, verify=not args.insecure, timeout=120)
    r.raise_for_status()
    payload = r.json()
    rows = payload if isinstance(payload, list) else (payload.get("items") or payload.get("data") or payload.get("rows") or [])
    print(f"[data] {len(rows)} rows from {url}")
    return pd.DataFrame(rows)


def prepare(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    names = {c.lower().replace("_", ""): c for c in df.columns}
    wanted = {"defecttype": "DefectType", "severity": "Severity", "ontimerate": "OnTimeRate", "closedcount": "ClosedCount",
              "openclaims": "OpenClaims", "allocdays": "AllocDays", "isontime": TARGET}
    work = df.rename(columns={names[k]: v for k, v in wanted.items() if k in names}).copy()
    missing = [c for c in CAT + NUM + [TARGET] if c not in work.columns]
    if missing:
        raise SystemExit(f"Missing columns {missing}: the API must provide the history features (see the module docstring).")
    work["Severity"] = work["Severity"].map(_normalize_severity)
    work["DefectType"] = work["DefectType"].astype(str).str.strip()
    y = work[TARGET].map({True: 1, False: 0, "True": 1, "False": 0, "true": 1, "false": 0, 1: 1, 0: 0, "1": 1, "0": 0})
    y = pd.to_numeric(y, errors="coerce")
    keep = y.notna()
    X = work.loc[keep, CAT + NUM].copy()
    for c in NUM:
        X[c] = pd.to_numeric(X[c], errors="coerce")
    return X.reset_index(drop=True), y.loc[keep].astype(int).reset_index(drop=True)


def make_preprocessor(cat: list[str], num: list[str]) -> ColumnTransformer:
    parts = []
    if num:
        parts.append(("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), num))
    if cat:
        parts.append(("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")),
                                       ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat))
    return ColumnTransformer(parts, remainder="drop")


MODELS = {
    "LogisticRegression": lambda: LogisticRegression(max_iter=2000, C=0.5),
    "GradientBoosting": lambda: GradientBoostingClassifier(
        n_estimators=120, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=0),
}


def cross_validate(X: pd.DataFrame, y: pd.Series, cat: list[str], num: list[str], make_model, seed: int = 1) -> dict:
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=4, random_state=seed)
    auc, brier, acc = [], [], []
    for tr, te in cv.split(X, y):
        pre = make_preprocessor(cat, num)
        model = make_model().fit(pre.fit_transform(X.iloc[tr][cat + num]), y.iloc[tr])
        p = model.predict_proba(pre.transform(X.iloc[te][cat + num]))[:, 1]
        auc.append(roc_auc_score(y.iloc[te], p))
        brier.append(brier_score_loss(y.iloc[te], p))
        acc.append(accuracy_score(y.iloc[te], p >= 0.5))
    return {"auc": float(np.mean(auc)), "auc_sd": float(np.std(auc)), "brier": float(np.mean(brier)), "accuracy": float(np.mean(acc))}


def time_split_auc(X: pd.DataFrame, y: pd.Series, cat: list[str], num: list[str], make_model) -> float | None:
    """Train on the first 70 % of rows, test on the rest (rows come ordered by time from the API)."""
    cut = int(len(X) * 0.7)
    if y.iloc[:cut].nunique() < 2 or y.iloc[cut:].nunique() < 2:
        return None
    pre = make_preprocessor(cat, num)
    model = make_model().fit(pre.fit_transform(X.iloc[:cut][cat + num]), y.iloc[:cut])
    return float(roc_auc_score(y.iloc[cut:], model.predict_proba(pre.transform(X.iloc[cut:][cat + num]))[:, 1]))


def train_and_save(X: pd.DataFrame, y: pd.Series, source: str) -> dict:
    baseline = float(max(y.mean(), 1 - y.mean()))
    claim_only = cross_validate(X, y, CAT, NUM_CLAIM, MODELS["LogisticRegression"])
    candidates = {name: cross_validate(X, y, CAT, NUM, mk) for name, mk in MODELS.items()}
    best_name = max(candidates, key=lambda k: candidates[k]["auc"])
    best = candidates[best_name]
    split_auc = time_split_auc(X, y, CAT, NUM, MODELS[best_name])
    validated = is_validated(best["auc"], claim_only["auc"])

    print(f"[eval] trivial model accuracy {baseline:.3f}")
    print(f"[eval] claim only         AUC {claim_only['auc']:.3f} +/- {claim_only['auc_sd']:.3f}")
    for name, r in candidates.items():
        print(f"[eval] + employee, {name:19s} AUC {r['auc']:.3f} +/- {r['auc_sd']:.3f}  Brier {r['brier']:.3f}  acc {r['accuracy']:.3f}")
    print(f"[eval] time split AUC {split_auc if split_auc is None else round(split_auc, 3)} | validated: {validated}")

    pre = make_preprocessor(CAT, NUM)
    matrix = pre.fit_transform(X[CAT + NUM])
    model = MODELS[best_name]().fit(matrix, y)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, ARTIFACTS / "model.pkl")
    joblib.dump(pre, ARTIFACTS / "preprocessor.pkl")
    joblib.dump(pre.named_transformers_["cat"].named_steps["onehot"], ARTIFACTS / "encoder.pkl")
    joblib.dump(pre.named_transformers_["num"].named_steps["scaler"], ARTIFACTS / "scaler.pkl")
    joblib.dump(pre.named_transformers_["num"].named_steps["imputer"], ARTIFACTS / "num_imputer.pkl")
    joblib.dump(pre.named_transformers_["cat"].named_steps["imputer"], ARTIFACTS / "cat_imputer.pkl")

    meta = {
        "best_model": best_name,
        "target": TARGET,
        "numeric_features": NUM,
        "categorical_features": CAT,
        "feature_names_out": list(pre.get_feature_names_out()),
        "n_train_rows": int(len(X)),
        "defect_types": sorted(X["DefectType"].dropna().astype(str).unique().tolist()),
        "severities": sorted(X["Severity"].dropna().astype(str).unique().tolist()),
        "trained_on": source,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "validated": bool(validated),
        "validation_rule": f"cross-validated AUC >= {MIN_AUC} and gain over claim-only model >= {MIN_EMPLOYEE_GAIN}",
        "metrics": {
            "trivial_accuracy": baseline,
            "claim_only_cv": claim_only,
            "cv": best,
            "candidates_cv_auc": {k: v["auc"] for k, v in candidates.items()},
            "time_split_auc": split_auc,
        },
    }
    (ARTIFACTS / "feature_meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[artifacts] saved -> {ARTIFACTS}")
    return meta


MIN_ROWS_PER_NEW_CODE = 30  # a defect code needs this many labelled rows before the model can learn anything from it


def readiness(X: pd.DataFrame, y: pd.Series, min_per_code: int) -> dict:
    """Is a retraining worthwhile? Compares the defect codes of the data with those the deployed model knows."""
    meta_path = Path(__file__).resolve().parent / "artifacts" / "feature_meta.json"
    known = set(json.loads(meta_path.read_text(encoding="utf-8")).get("defect_types", [])) if meta_path.exists() else set()
    counts = X["DefectType"].value_counts()
    unknown = {code: int(n) for code, n in counts.items() if code not in known}
    learnable = {code: n for code, n in unknown.items() if n >= min_per_code}
    return {
        "rows": int(len(X)),
        "both_outcomes": bool(y.nunique() >= 2),
        "enough_rows": bool(len(X) >= MIN_ROWS and y.nunique() >= 2),
        "codes_known_by_the_model": len(known),
        "codes_not_known_by_the_model": unknown,
        "codes_with_enough_rows": learnable,
        "ready": bool(len(X) >= MIN_ROWS and y.nunique() >= 2 and learnable),
        "rule": f"at least {MIN_ROWS} labelled rows in total and {min_per_code} rows for each new defect code to be learned",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="only report whether a retraining is worthwhile (no training, nothing saved)")
    ap.add_argument("--min-per-code", type=int, default=MIN_ROWS_PER_NEW_CODE, help="rows needed for a new defect code to count as learnable")
    ap.add_argument("--csv", help="read the dataset from a CSV instead of the API")
    ap.add_argument("--insecure", action="store_true", help="do not verify TLS certificates (local development)")
    ap.add_argument("--source-label", default="reference dataset modelled on the production process", help="what the data are, recorded in the artifacts")
    args = ap.parse_args()

    X, y = prepare(load(args))
    if args.check:
        report = readiness(X, y, args.min_per_code)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0 if report["ready"] else 2
    if len(X) < MIN_ROWS or y.nunique() < 2:
        print(f"ERROR: need at least {MIN_ROWS} labelled rows with both outcomes (got {len(X)}).", file=sys.stderr)
        return 1
    meta = train_and_save(X, y, args.source_label)
    print(json.dumps({k: meta[k] for k in ("best_model", "validated", "n_train_rows", "trained_on")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
