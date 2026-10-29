"""Unit tests for ML recommendation ranking / feature row merge."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from recommend_logic import action_for, build_feature_row, rank_recommendations, risk_level  # noqa: E402


def test_build_row_employee_department_overrides_dossier():
    row = build_feature_row(
        defect_type="Soudure",
        severity="HIGH",
        dossier_department_id="dept-a",
        employee_id="e1",
        employee_skill=0.8,
        workload=0.3,
        employee_department_id="dept-b",
    )
    assert row["DepartmentId"] == "dept-b"
    assert row["DefectType"] == "Soudure"
    assert row["EmployeeSkill"] == 0.8


def test_rank_recommendations_orders_by_score_desc():
    result = rank_recommendations(
        ["a", "b", "c", "d"],
        [0.2, 0.9, 0.5, 0.1],
        top_n=3,
    )
    assert [r["employeeId"] for r in result] == ["b", "c", "a"]
    assert [r["rank"] for r in result] == [1, 2, 3]
    assert result[0]["score"] == pytest.approx(0.9)


def test_rank_recommendations_dedupes_case_insensitive_keeps_best():
    result = rank_recommendations(
        ["Alice", "alice", "Bob"],
        [0.4, 0.8, 0.7],
        top_n=3,
    )
    assert len(result) == 2
    assert result[0]["employeeId"] == "alice"
    assert result[0]["score"] == pytest.approx(0.8)
    assert result[1]["employeeId"] == "Bob"


def test_recommend_endpoint_with_artifacts():
    pytest.importorskip("fastapi")
    pytest.importorskip("joblib")
    assert (ROOT / "artifacts" / "model.pkl").exists(), "model.pkl manquant (build_test_model.py)"
    from fastapi.testclient import TestClient
    from api import app

    payload = {
        "dossier": {"DefectType": "Soudure", "Severity": "HIGH", "DepartmentId": "d1"},
        "employees": [
            {"employeeId": "e1", "OnTimeRate": 0.95, "ClosedCount": 40, "OpenClaims": 1},
            {"employeeId": "e2", "OnTimeRate": 0.40, "ClosedCount": 30, "OpenClaims": 6},
            {"employeeId": "e3", "OnTimeRate": 0.75, "ClosedCount": 2, "OpenClaims": 3},
        ],
    }
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["modelLoaded"] is True

        resp = client.post("/recommend", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "recommendations" in data
    assert 1 <= len(data["recommendations"]) <= 3
    assert data["recommendations"][0]["rank"] == 1
    scores = [item["score"] for item in data["recommendations"]]
    assert scores == sorted(scores, reverse=True)
    assert "validated" in data and "trainedOn" in data


def test_recommend_still_answers_when_history_is_missing():
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from api import app

    payload = {
        "dossier": {"DefectType": "Soudure", "Severity": "HIGH"},
        "employees": [{"employeeId": "new-hire"}, {"employeeId": "old-timer", "OnTimeRate": 0.9, "ClosedCount": 50}],
    }
    with TestClient(app) as client:
        resp = client.post("/recommend", json=payload)
    assert resp.status_code == 200
    assert resp.json()["scoredCount"] == 2


def test_build_row_carries_the_history_features():
    row = build_feature_row(
        defect_type="Soudure", severity="HIGH", dossier_department_id=None, employee_id="e1",
        employee_skill=None, workload=None, on_time_rate=0.8, closed_count=12, open_claims=2, alloc_days=14.0,
    )
    assert (row["OnTimeRate"], row["ClosedCount"], row["OpenClaims"], row["AllocDays"]) == (0.8, 12, 2, 14.0)


def test_validation_gate_needs_both_a_good_auc_and_a_gain_from_employee_information():
    from retrain import is_validated

    assert is_validated(0.74, 0.715)          # clearly above chance, employee features help
    assert not is_validated(0.58, 0.50)       # too close to chance
    assert not is_validated(0.70, 0.70)       # employee features add nothing
    assert not is_validated(0.52, 0.53)


@pytest.mark.parametrize(
    "score, level, action",
    [(0.95, "low", "standard"), (0.81, "low", "standard"), (0.80, "moderate", "adjust"), (0.65, "moderate", "adjust"),
     (0.50, "moderate", "adjust"), (0.49, "high", "alert"), (0.05, "high", "alert")],
)
def test_risk_tiers(score, level, action):
    assert risk_level(score) == level
    assert action_for(level) == action
