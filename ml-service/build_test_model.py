"""
Build a small LogisticRegression artifact set so POST /recommend can run when no trained model exists
(a fresh clone without artifacts, a CI job).

It NEVER replaces an existing model: the artifacts committed in the repository come from retrain.py.
The fixture is random data and is recorded as not validated.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUM_FEATURES = ["OnTimeRate", "ClosedCount", "OpenClaims", "AllocDays"]
CAT_FEATURES = ["DefectType", "Severity"]


def build(artifacts_dir: Path | None = None, overwrite: bool = False) -> Path:
    artifacts = Path(artifacts_dir or Path(__file__).resolve().parent / "artifacts")
    artifacts.mkdir(parents=True, exist_ok=True)
    if (artifacts / "model.pkl").exists() and not overwrite:
        return artifacts / "model.pkl"

    rng = np.random.default_rng(7)
    n = 120
    defects = ["Soudure", "Connecteur desserré", "Coupure fil", "Soudure défectueuse"]
    severities = ["HIGH", "LOW", "MEDIUM", "CRITICAL"]

    frame = pd.DataFrame(
        {
            "DefectType": rng.choice(defects, n),
            "Severity": rng.choice(severities, n),
            "OnTimeRate": rng.uniform(0.3, 1.0, n),
            "ClosedCount": rng.integers(0, 60, n),
            "OpenClaims": rng.integers(0, 8, n),
            "AllocDays": rng.uniform(3, 40, n),
        }
    )
    # Reliable employee with few open claims → more often on time. Force both classes.
    y = ((frame["OnTimeRate"] - 0.08 * frame["OpenClaims"]) > 0.6).astype(int)
    y.iloc[0] = 0
    y.iloc[1] = 1

    num_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    cat_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", num_pipe, NUM_FEATURES),
            ("cat", cat_pipe, CAT_FEATURES),
        ],
        remainder="drop",
    )

    matrix = preprocessor.fit_transform(frame[CAT_FEATURES + NUM_FEATURES])
    model = LogisticRegression(max_iter=300)
    model.fit(matrix, y)

    joblib.dump(model, artifacts / "model.pkl")
    joblib.dump(preprocessor, artifacts / "preprocessor.pkl")
    joblib.dump(cat_pipe.named_steps["onehot"], artifacts / "encoder.pkl")
    joblib.dump(num_pipe.named_steps["scaler"], artifacts / "scaler.pkl")
    joblib.dump(num_pipe.named_steps["imputer"], artifacts / "num_imputer.pkl")
    joblib.dump(cat_pipe.named_steps["imputer"], artifacts / "cat_imputer.pkl")

    meta_path = artifacts / "feature_meta.json"
    if overwrite or not meta_path.exists():
        meta_path.write_text(
            json.dumps(
                {
                    "best_model": "LogisticRegression",
                    "target": "IsOnTime",
                    "numeric_features": NUM_FEATURES,
                    "categorical_features": CAT_FEATURES,
                    "trained_on": "ci_test_fixture",
                    "ci_test_model": True,
                    "validated": False,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    return artifacts / "model.pkl"


if __name__ == "__main__":
    path = build()
    print(f"Wrote test artifacts including {path}")
