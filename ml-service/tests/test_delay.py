"""Resolution-delay model: the gate validates a model only when it really beats the empirical percentiles on unseen claims."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import delay_logic  # noqa: E402


def _claims(n: int, signal: bool, seed: int = 1) -> pd.DataFrame:
    """Closed claims, oldest first. With `signal`, the client really changes the delay (the percentiles on defect+severity cannot see it)."""
    rng = np.random.default_rng(seed)
    created = pd.Timestamp("2024-01-01") + pd.to_timedelta(np.sort(rng.integers(0, 600, n)), unit="D")
    severity = rng.choice(["LOW", "MEDIUM", "HIGH"], n)
    client = rng.choice(["A", "B", "C", "D"], n)
    base = pd.Series(severity).map({"LOW": 18.0, "MEDIUM": 12.0, "HIGH": 8.0}).to_numpy()
    effect = pd.Series(client).map({"A": 0.5, "B": 1.0, "C": 1.0, "D": 2.0}).to_numpy() if signal else 1.0
    days = np.maximum(0.5, rng.gamma(4.0, base * effect / 4.0))
    return pd.DataFrame({
        "defect": rng.choice(["SOUDURE", "RAYURE"], n), "severity": severity, "client": client, "line": "WR-01", "shift": "",
        "internal": 0, "produced": 1000, "defective": rng.integers(1, 50, n), "assignee": "",
        "created": created, "completed": created + pd.to_timedelta(days, unit="D"),
    })


def test_a_model_is_validated_when_a_feature_really_moves_the_delay():
    result = delay_logic.fit_and_validate(_claims(3000, signal=True), n_boot=200)
    report = result["report"]
    assert report["validated"] is True and report["label"] == "Modèle validé"
    assert result["bundle"] is not None
    assert report["model" + "AssigneeUnknown"]["pinball80"] < report["baseline"]["pinball80"]


def test_a_model_stays_indicative_when_it_does_not_beat_the_percentiles():
    result = delay_logic.fit_and_validate(_claims(3000, signal=False, seed=3), n_boot=200)
    assert result["report"]["validated"] is False
    assert result["report"]["label"] == "Indicatif"


def test_too_few_closed_claims_means_no_model_at_all():
    result = delay_logic.fit_and_validate(_claims(100, signal=True))
    assert result["bundle"] is None
    assert result["report"]["validated"] is False
    assert "trop peu" in result["report"]["reason"]


def test_the_report_always_carries_the_data_caveat_and_the_checks():
    report = delay_logic.fit_and_validate(_claims(1500, signal=True), n_boot=100)["report"]
    assert "pas la performance réelle" in report["note"]
    assert set(report["checks"]) == {"p80GainCiAboveZero_assigneeKnown", "p80GainCiAboveZero_assigneeUnknown", "p50BeatsBaseline_both", "p80CoverageCalibrated_both"}
    assert report["testPeriod"][0] >= report["trainPeriod"][0]     # the test claims are the newest ones


def test_predictions_never_cross_and_unknown_values_do_not_break_them():
    bundle = delay_logic.fit_and_validate(_claims(1500, signal=True), n_boot=50)["bundle"]
    p50, p80 = delay_logic.predict_one(bundle, {"defect": "NEW_DEFECT", "severity": "high", "client": "unknown-client", "month": 5})
    assert 0 <= p50 <= p80
    p50b, p80b = delay_logic.predict_one(bundle, {})
    assert 0 <= p50b <= p80b


def test_the_baseline_matches_the_application_rule_and_falls_back_when_the_sample_is_small():
    train = pd.DataFrame({"defect": ["A"] * 6 + ["B"] * 2, "severity": ["HIGH"] * 8, "days": [10, 10, 10, 10, 10, 10, 1, 1]})
    test = pd.DataFrame({"defect": ["A", "B"], "severity": ["HIGH", "HIGH"]})
    p50, p80 = delay_logic.centile_baseline(train, test)
    assert p50[0] == 10                      # 6 cases of the same defect and severity
    assert p50[1] == pytest.approx(10)       # only 2 cases of B: falls back on the severity (8 cases, median 10)


def test_masking_the_assignee_hides_about_a_third_of_the_values_and_keeps_the_rest():
    frame = _claims(1000, signal=True)
    frame["assignee"] = "x"
    out = delay_logic.mask_assignee(delay_logic.make_frame(frame))
    hidden = (out["assignee"] == "").mean()
    assert 0.2 < hidden < 0.4
