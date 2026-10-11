"""Unit tests for ML recommendation ranking / feature row merge."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from recommend_logic import build_feature_row, rank_recommendations  # noqa: E402


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
            {"employeeId": "e1", "EmployeeSkill": 0.9, "Workload": 0.2},
            {"employeeId": "e2", "EmployeeSkill": 0.4, "Workload": 0.8},
            {"employeeId": "e3", "EmployeeSkill": 0.7, "Workload": 0.4},
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
