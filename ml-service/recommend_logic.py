"""Pure recommend helpers (no sklearn / joblib) — unit-test friendly."""

from __future__ import annotations

from typing import Any


def build_feature_row(
    *,
    defect_type: str | None,
    severity: str | None,
    dossier_department_id: str | None,
    employee_id: str,
    employee_skill: float | int | str | None,
    workload: float | int | None,
    employee_department_id: str | None = None,
    dossier_extra: dict[str, Any] | None = None,
    employee_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "DefectType": defect_type,
        "Severity": severity,
        "DepartmentId": employee_department_id or dossier_department_id,
        "EmployeeSkill": employee_skill,
        "Workload": workload,
        "employeeId": employee_id,
    }
    row.update(dossier_extra or {})
    row.update(employee_extra or {})
    return row


def rank_recommendations(
    employee_ids: list[str],
    scores: list[float],
    top_n: int = 3,
) -> list[dict[str, Any]]:
    """
    Rank employees by score (desc), dedupe by employeeId (case-insensitive),
    keep best score, return top_n with 1-based ranks.
    """
    ranked = sorted(
        (
            {"employeeId": eid, "score": float(score)}
            for eid, score in zip(employee_ids, scores)
        ),
        key=lambda x: x["score"],
        reverse=True,
    )

    seen: set[str] = set()
    unique_ranked: list[dict[str, Any]] = []
    for item in ranked:
        eid = str(item["employeeId"]).strip().lower()
        if not eid or eid in seen:
            continue
        seen.add(eid)
        unique_ranked.append(item)

    return [
        {
            "employeeId": item["employeeId"],
            "score": round(float(item["score"]), 6),
            "rank": i + 1,
        }
        for i, item in enumerate(unique_ranked[:top_n])
    ]
