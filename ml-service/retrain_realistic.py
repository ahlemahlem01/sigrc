"""
Retrain LogisticRegression on realistic ActionPlan claims and refresh artifacts/.

Data source: GET https://localhost:7204/api/ml-features/training-dataset
(the key is read from COFICAB_DATASET_KEY, see README).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import requests
import urllib3
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

CAT = ["DefectType", "Severity", "DepartmentId"]
NUM = ["EmployeeSkill", "Workload"]
TARGET = "IsOnTime"

API_URL = "https://localhost:7204/api/ml-features/training-dataset"


def _normalize_severity(s: object) -> str:
    if s is None or (isinstance(s, float) and np.isnan(s)):
        return "MEDIUM"
    v = str(s).strip().upper()
    aliases = {
        "CRITIQUE": "CRITICAL",
        "ELEVEE": "HIGH",
        "ÉLEVÉE": "HIGH",
        "MOYENNE": "MEDIUM",
        "FAIBLE": "LOW",
    }
    return aliases.get(v, v)


def load_from_api() -> pd.DataFrame | None:
    try:
        headers = {"X-Dataset-Key": os.environ.get("COFICAB_DATASET_KEY", "")}
        r = requests.get(API_URL, headers=headers, verify=False, timeout=90)
        r.raise_for_status()
        payload = r.json()
        if isinstance(payload, list):
            rows = payload
        elif isinstance(payload, dict):
            rows = payload.get("items") or payload.get("data") or payload.get("rows") or []
        else:
            return None
        if not rows:
            return None
        df = pd.DataFrame(rows)
        print(f"[data] API OK — {len(df)} rows")
        return df
    except Exception as exc:  # noqa: BLE001
        print(f"[data] API unavailable: {exc}")
        return None


def prepare(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    work = df.copy()
    # normalize column names (API may camelCase)
    rename = {}
    for c in list(work.columns):
        low = c.lower()
        if low in {"defecttype", "defect_type"}:
            rename[c] = "DefectType"
        elif low == "severity":
            rename[c] = "Severity"
        elif low in {"departmentid", "department_id"}:
            rename[c] = "DepartmentId"
        elif low in {"employeeskill", "employee_skill", "skilllevel"}:
            rename[c] = "EmployeeSkill"
        elif low in {"workload", "charge"}:
            rename[c] = "Workload"
        elif low in {"isontime", "is_on_time"}:
            rename[c] = "IsOnTime"
    work = work.rename(columns=rename)

    work["Severity"] = work["Severity"].map(_normalize_severity)
    work["DefectType"] = work["DefectType"].astype(str).str.strip()
    if "DepartmentId" in work.columns:
        work["DepartmentId"] = work["DepartmentId"].astype(str).str.strip().str.upper()
        work.loc[work["DepartmentId"].isin(["", "NAN", "NONE", "NULL"]), "DepartmentId"] = np.nan

    y = work[TARGET].map(
        {
            True: 1,
            False: 0,
            "True": 1,
            "False": 0,
            "true": 1,
            "false": 0,
            "t": 1,
            "f": 0,
            "T": 1,
            "F": 0,
            "1": 1,
            "0": 0,
            1: 1,
            0: 0,
        }
    )
    y = pd.to_numeric(y, errors="coerce")
    mask = y.notna()
    work = work.loc[mask].copy()
    y = y.loc[mask].astype(int)

    X = work[CAT + NUM].copy()
    for col in NUM:
        X[col] = pd.to_numeric(X[col], errors="coerce")

    print(f"[prep] rows={len(X)}  on_time_rate={y.mean():.3f}")
    print(f"[prep] DefectTypes ({X['DefectType'].nunique()}): {sorted(X['DefectType'].dropna().unique().tolist())[:12]}...")
    print(f"[prep] Severities: {sorted(X['Severity'].dropna().unique().tolist())}")
    print(f"[prep] Departments: {sorted(X['DepartmentId'].dropna().unique().tolist())}")
    return X, y


def train_and_save(X: pd.DataFrame, y: pd.Series) -> dict:
    numeric_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipe, NUM),
            ("cat", categorical_pipe, CAT),
        ],
        remainder="drop",
    )

    X_mat = preprocessor.fit_transform(X)
    feature_names = list(preprocessor.get_feature_names_out())

    X_train, X_test, y_train, y_test = train_test_split(
        X_mat, y, test_size=0.20, random_state=42, stratify=y
    )

    model = LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
        solver="lbfgs",
        C=1.0,
        random_state=42,
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    f1 = float(f1_score(y_test, y_pred))
    acc = float(accuracy_score(y_test, y_pred))
    print("\n[metrics] test")
    print(classification_report(y_test, y_pred, digits=3))
    print(f"[metrics] F1={f1:.4f}  accuracy={acc:.4f}")

    # Persist same artifact contract as training_model.ipynb
    num_pipe = preprocessor.named_transformers_["num"]
    cat_pipe = preprocessor.named_transformers_["cat"]
    encoder = cat_pipe.named_steps["onehot"]
    scaler = num_pipe.named_steps["scaler"]
    num_imputer = num_pipe.named_steps["imputer"]
    cat_imputer = cat_pipe.named_steps["imputer"]

    model_path = ARTIFACTS / "model.pkl"
    encoder_path = ARTIFACTS / "encoder.pkl"
    scaler_path = ARTIFACTS / "scaler.pkl"
    preprocessor_path = ARTIFACTS / "preprocessor.pkl"
    meta_path = ARTIFACTS / "feature_meta.json"

    joblib.dump(model, model_path)
    joblib.dump(encoder, encoder_path)
    joblib.dump(scaler, scaler_path)
    joblib.dump(preprocessor, preprocessor_path)
    joblib.dump(num_imputer, ARTIFACTS / "num_imputer.pkl")
    joblib.dump(cat_imputer, ARTIFACTS / "cat_imputer.pkl")

    meta = {
        "best_model": "LogisticRegression",
        "best_f1_test": f1,
        "best_accuracy_test": acc,
        "target": TARGET,
        "numeric_features": NUM,
        "categorical_features": CAT,
        "feature_names_out": feature_names,
        "n_train_rows": int(len(X)),
        "defect_types": sorted(X["DefectType"].dropna().astype(str).unique().tolist()),
        "severities": sorted(X["Severity"].dropna().astype(str).unique().tolist()),
        "trained_on": "realistic_claims",
        "files": {
            "model": str(model_path),
            "encoder": str(encoder_path),
            "scaler": str(scaler_path),
            "preprocessor": str(preprocessor_path),
        },
    }
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n[artifacts] saved -> {ARTIFACTS}")
    for p in sorted(ARTIFACTS.glob("*")):
        print(f"  - {p.name} ({p.stat().st_size} bytes)")
    return meta


def main() -> int:
    df = load_from_api()
    if df is None or len(df) < 30:
        print("ERROR: not enough labeled rows to train.", file=sys.stderr)
        return 1
    X, y = prepare(df)
    if len(X) < 30 or y.nunique() < 2:
        print("ERROR: dataset too small or single-class.", file=sys.stderr)
        return 1
    meta = train_and_save(X, y)
    print("\n===== RETRAIN OK =====")
    print(json.dumps({k: meta[k] for k in ("best_model", "best_f1_test", "n_train_rows", "trained_on")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
