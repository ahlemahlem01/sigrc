"""
FastAPI ML recommendation service.

Loads model.pkl + encoder/scaler (and full preprocessor when available),
exposes POST /recommend to rank candidate employees by P(success / IsOnTime).
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"

# Feature contract aligned with training_model.ipynb synthetic + prep cells
DEFAULT_CAT_FEATURES = ["DefectType", "Severity", "DepartmentId"]
DEFAULT_NUM_FEATURES = ["EmployeeSkill", "Workload"]
ALL_INPUT_FEATURES = DEFAULT_CAT_FEATURES + DEFAULT_NUM_FEATURES


class DossierFeatures(BaseModel):
    """Caractéristiques du dossier / réclamation."""

    DefectType: str | None = None
    Severity: str | None = None
    DepartmentId: str | None = None
    # Champs libres supplémentaires éventuels (ignorés s'ils ne sont pas dans le modèle)
    extra: dict[str, Any] = Field(default_factory=dict)


class EmployeeCandidate(BaseModel):
    """Employé candidat avec ses features ML."""

    employeeId: str
    EmployeeSkill: float | int | str | None = None
    Workload: float | int | None = None
    # Optionnel : surcharge dossier-level si besoin
    DepartmentId: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class RecommendRequest(BaseModel):
    dossier: DossierFeatures
    employees: list[EmployeeCandidate] = Field(min_length=1)


class EmployeeRecommendation(BaseModel):
    employeeId: str
    score: float
    rank: int


class RecommendResponse(BaseModel):
    recommendations: list[EmployeeRecommendation]
    model: str | None = None
    scoredCount: int


def _load_meta() -> dict[str, Any]:
    meta_path = ARTIFACTS_DIR / "feature_meta.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    return {}


import mining
from recommend_logic import build_feature_row, rank_recommendations


def _build_row(dossier: DossierFeatures, emp: EmployeeCandidate) -> dict[str, Any]:
    """Fusionne features dossier + employé (employé prime sur les champs partagés)."""
    return build_feature_row(
        defect_type=dossier.DefectType,
        severity=dossier.Severity,
        dossier_department_id=dossier.DepartmentId,
        employee_id=emp.employeeId,
        employee_skill=emp.EmployeeSkill,
        workload=emp.Workload,
        employee_department_id=emp.DepartmentId,
        dossier_extra=dossier.extra,
        employee_extra=emp.extra,
    )


class MlRuntime:
    def __init__(self) -> None:
        self.model = None
        self.encoder = None
        self.scaler = None
        self.preprocessor: ColumnTransformer | Pipeline | None = None
        self.meta: dict[str, Any] = {}
        self.cat_features: list[str] = list(DEFAULT_CAT_FEATURES)
        self.num_features: list[str] = list(DEFAULT_NUM_FEATURES)

    def load(self) -> None:
        model_path = ARTIFACTS_DIR / "model.pkl"
        encoder_path = ARTIFACTS_DIR / "encoder.pkl"
        scaler_path = ARTIFACTS_DIR / "scaler.pkl"
        preprocessor_path = ARTIFACTS_DIR / "preprocessor.pkl"

        if not model_path.exists():
            raise FileNotFoundError(
                f"Artifact manquant: {model_path}. Entraînez et sauvegardez le modèle via training_model.ipynb."
            )

        self.model = joblib.load(model_path)
        self.meta = _load_meta()
        self.cat_features = list(self.meta.get("categorical_features") or DEFAULT_CAT_FEATURES)
        self.num_features = list(self.meta.get("numeric_features") or DEFAULT_NUM_FEATURES)

        if encoder_path.exists():
            self.encoder = joblib.load(encoder_path)
        if scaler_path.exists():
            self.scaler = joblib.load(scaler_path)

        if preprocessor_path.exists():
            self.preprocessor = joblib.load(preprocessor_path)
        else:
            # Reconstruit un preprocessing minimal encoder+scaler si le pipeline complet absente
            self.preprocessor = self._rebuild_preprocessor()

        if self.encoder is None or self.scaler is None:
            # Tente d'extraire depuis le ColumnTransformer
            if isinstance(self.preprocessor, ColumnTransformer):
                try:
                    self.scaler = self.preprocessor.named_transformers_["num"].named_steps["scaler"]
                    self.encoder = self.preprocessor.named_transformers_["cat"].named_steps["onehot"]
                except Exception:
                    pass

        if self.encoder is None or self.scaler is None:
            raise RuntimeError(
                "Impossible de charger encoder/scaler. Vérifiez artifacts/encoder.pkl et artifacts/scaler.pkl."
            )

    def _rebuild_preprocessor(self) -> ColumnTransformer:
        num_imputer_path = ARTIFACTS_DIR / "num_imputer.pkl"
        cat_imputer_path = ARTIFACTS_DIR / "cat_imputer.pkl"
        if not (encoder_path := ARTIFACTS_DIR / "encoder.pkl").exists():
            raise FileNotFoundError(encoder_path)
        if not (scaler_path := ARTIFACTS_DIR / "scaler.pkl").exists():
            raise FileNotFoundError(scaler_path)

        from sklearn.impute import SimpleImputer

        encoder = joblib.load(encoder_path)
        scaler = joblib.load(scaler_path)
        num_imputer = (
            joblib.load(num_imputer_path)
            if num_imputer_path.exists()
            else SimpleImputer(strategy="median")
        )
        cat_imputer = (
            joblib.load(cat_imputer_path)
            if cat_imputer_path.exists()
            else SimpleImputer(strategy="most_frequent")
        )

        return ColumnTransformer(
            transformers=[
                (
                    "num",
                    Pipeline([("imputer", num_imputer), ("scaler", scaler)]),
                    self.num_features,
                ),
                (
                    "cat",
                    Pipeline([("imputer", cat_imputer), ("onehot", encoder)]),
                    self.cat_features,
                ),
            ],
            remainder="drop",
        )

    def transform(self, frame: pd.DataFrame) -> np.ndarray:
        assert self.preprocessor is not None
        # Garantit la présence des colonnes attendues
        expected = list(dict.fromkeys(self.cat_features + self.num_features))
        for col in expected:
            if col not in frame.columns:
                frame[col] = np.nan
        frame = frame[expected]
        return self.preprocessor.transform(frame)

    def predict_success_proba(self, frame: pd.DataFrame) -> np.ndarray:
        assert self.model is not None
        X = self.transform(frame)
        if hasattr(self.model, "predict_proba"):
            proba = self.model.predict_proba(X)
            # Classe positive = IsOnTime=1 → dernière colonne si classes [0,1]
            classes = getattr(self.model, "classes_", None)
            if classes is not None and len(classes) == 2:
                pos_idx = int(np.where(classes == 1)[0][0]) if 1 in classes else 1
                return proba[:, pos_idx]
            return proba[:, -1]
        if hasattr(self.model, "decision_function"):
            scores = self.model.decision_function(X)
            # sigmoid pour ramener en [0,1]
            return 1.0 / (1.0 + np.exp(-scores))
        preds = self.model.predict(X)
        return np.asarray(preds, dtype=float)


runtime = MlRuntime()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        runtime.load()
    except Exception as exc:  # noqa: BLE001 — surface claire au démarrage
        # Laisse démarrer avec erreur explicite sur /recommend
        runtime.model = None
        runtime._load_error = str(exc)  # type: ignore[attr-defined]
        print(f"[ml-service] WARNING: artifacts not loaded: {exc}")
    else:
        runtime._load_error = None  # type: ignore[attr-defined]
        print("[ml-service] Model + encoder + scaler loaded.")
    yield


app = FastAPI(
    title="Coficab ML Recommendation API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Extra origins (comma separated), e.g. the hosted frontend.
        *[o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()],
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    ok = runtime.model is not None and runtime.preprocessor is not None
    return {
        "status": "ok" if ok else "degraded",
        "modelLoaded": ok,
        "bestModel": runtime.meta.get("best_model"),
        "error": getattr(runtime, "_load_error", None),
    }


@app.post("/recommend", response_model=RecommendResponse)
def recommend(payload: RecommendRequest) -> RecommendResponse:
    if runtime.model is None or runtime.preprocessor is None:
        raise HTTPException(
            status_code=503,
            detail=getattr(runtime, "_load_error", None)
            or "Modèle non chargé. Exécutez training_model.ipynb jusqu'à la sauvegarde des artifacts.",
        )

    rows = [_build_row(payload.dossier, emp) for emp in payload.employees]
    frame = pd.DataFrame(rows)
    scores = runtime.predict_success_proba(frame)

    top = rank_recommendations(
        [emp.employeeId for emp in payload.employees],
        list(scores),
        top_n=3,
    )

    top3 = [
        EmployeeRecommendation(
            employeeId=item["employeeId"],
            score=item["score"],
            rank=item["rank"],
        )
        for item in top
    ]

    return RecommendResponse(
        recommendations=top3,
        model=runtime.meta.get("best_model"),
        scoredCount=len(payload.employees),
    )


class MineRequest(BaseModel):
    """History of closed dossiers (with their causes) + the dossier being worked on."""

    history: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)
    current: dict[str, Any] | None = None
    restricted: bool = False


@app.post("/mine/insights")
def mine_insights(payload: MineRequest) -> dict[str, Any]:
    """Data mining over the history: weighted Pareto, association rules, root causes, similar cases.

    Stateless and read-only. Works without the recommendation model (no artifacts needed).
    """
    return mining.mine(payload.history, payload.current, payload.restricted)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
