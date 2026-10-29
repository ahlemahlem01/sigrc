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
    on_time_rate: float | None = None,
    closed_count: int | None = None,
    open_claims: int | None = None,
    alloc_days: float | None = None,
    dossier_extra: dict[str, Any] | None = None,
    employee_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "DefectType": defect_type,
        "Severity": severity,
        "DepartmentId": employee_department_id or dossier_department_id,
        "EmployeeSkill": employee_skill,
        "Workload": workload,
        "OnTimeRate": on_time_rate,
        "ClosedCount": closed_count,
        "OpenClaims": open_claims,
        "AllocDays": alloc_days,
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


# Decision thresholds on the probability of being on time. They are decision thresholds, not calibrated
# probabilities: the model is indicative (see "validated" in the /recommend answer).
LOW_RISK_ABOVE = 0.80
HIGH_RISK_BELOW = 0.50


def risk_level(score: float) -> str:
    """low: above 80 %, moderate: 50 to 80 % (both included), high: below 50 %."""
    if score > LOW_RISK_ABOVE:
        return "low"
    if score >= HIGH_RISK_BELOW:
        return "moderate"
    return "high"


_ACTION = {"low": "standard", "moderate": "adjust", "high": "alert"}


def action_for(level: str) -> str:
    """standard: usual assignment, adjust: assign with a margin (or take a less loaded candidate), alert: preventive alert,
    reallocate resources or review the priority. A number of extra days is deliberately not given: the model predicts a
    probability of being on time, not a duration."""
    return _ACTION[level]
