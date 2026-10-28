"""The rules of the retraining loop: classes taught by corrections, labels of corrected photos, the decision to deploy, and the deployment itself."""
import io
import json

import pytest
from PIL import Image

import auto_retrain
import export_corrections
from cv_mapping import load_class_map
from retrain_logic import BASE_CLASSES, build_label, centre_box, decide, is_holdout, plan_classes, yolo_line

CLASS_MAP = load_class_map()
VISUAL = {"CUT_INSULATION", "SCRATCH_INSULATION", "SPARK_TEST_FAILURE", "COPPER_OXIDATION"}


def test_a_code_already_behind_a_class_teaches_that_class_and_a_new_visual_code_needs_enough_photos():
    codes = ["CUT_INSULATION"] * 3 + ["SPARK_TEST_FAILURE"] * 25 + ["COPPER_OXIDATION"] * 4 + ["Soudure défectueuse"] * 2
    plan = plan_classes(codes, CLASS_MAP, VISUAL, BASE_CLASSES, min_new=20)
    assert plan.assignment["CUT_INSULATION"] == "hole"
    assert plan.assignment["COPPER_OXIDATION"] == "thunderbolt"
    assert plan.assignment["SPARK_TEST_FAILURE"] == "spark_test_failure" and plan.names[-1] == "spark_test_failure"
    assert plan.names[:len(BASE_CLASSES)] == BASE_CLASSES                      # ids of the existing classes never move
    assert plan.assignment["Soudure défectueuse"] is None and plan.skipped["not a defect visible on a photo"] == 2


def test_too_few_photos_do_not_create_a_class():
    plan = plan_classes(["SPARK_TEST_FAILURE"] * 5, CLASS_MAP, VISUAL, BASE_CLASSES, min_new=20)
    assert plan.assignment["SPARK_TEST_FAILURE"] is None and plan.names == BASE_CLASSES
    assert plan.skipped["too few photos for a new class"] == 5


def test_the_label_uses_the_models_box_only_when_it_found_the_defect_the_operator_named():
    found = [("hole", 0.8, (10, 10, 50, 50)), ("scratch", 0.9, (0, 0, 20, 20))]
    kind, boxes = build_label(found, "hole", (100, 100))
    assert kind == "model" and boxes == [(10, 10, 50, 50)]
    assert build_label(found, "spot", (100, 100)) == ("none", [])                 # nothing found: a person has to draw it
    assert build_label([("hole", 0.1, (1, 1, 2, 2))], "hole", (100, 100)) == ("none", [])   # too unsure
    kind, boxes = build_label([], "spot", (200, 100), allow_weak=True)
    assert kind == "weak" and boxes == [centre_box(200, 100)]


def test_yolo_line_is_normalised_and_clipped():
    assert yolo_line(3, (0, 0, 100, 50), 200, 100) == "3 0.250000 0.250000 0.500000 0.500000"
    assert yolo_line(0, (-10, -10, 300, 120), 200, 100) == "0 0.500000 0.500000 1.000000 1.000000"


def test_the_holdout_choice_is_stable_and_about_a_fifth():
    ids = [f"claim-{i}" for i in range(2000)]
    assert [is_holdout(i) for i in ids] == [is_holdout(i) for i in ids]
    assert 0.15 < sum(is_holdout(i) for i in ids) / len(ids) < 0.25


CURRENT = {"reference_map50": 0.60, "per_class": {"foreign": 0.70, "hole": 0.50, "scratch": 0.40}}


def test_a_better_candidate_without_a_collapsing_class_is_accepted():
    cand = {"reference_map50": 0.64, "per_class": {"foreign": 0.72, "hole": 0.48, "scratch": 0.45, "spark_test_failure": 0.3}}
    assert decide(CURRENT, cand).accept


@pytest.mark.parametrize("reference", [0.60, 0.55])
def test_a_candidate_that_does_not_beat_the_current_model_is_rejected(reference):
    cand = {"reference_map50": reference, "per_class": dict(CURRENT["per_class"])}
    verdict = decide(CURRENT, cand)
    assert not verdict.accept and "does not beat" in verdict.reason


def test_a_better_candidate_that_loses_a_class_is_rejected():
    cand = {"reference_map50": 0.70, "per_class": {"foreign": 0.70, "hole": 0.30, "scratch": 0.40}}
    verdict = decide(CURRENT, cand)
    assert not verdict.accept and "hole" in verdict.reason
    assert not decide(CURRENT, {"reference_map50": 0.7, "per_class": {"foreign": 0.7}}).accept     # classes lost


def test_the_minimum_gain_is_respected():
    cand = {"reference_map50": 0.62, "per_class": dict(CURRENT["per_class"])}
    assert decide(CURRENT, cand, min_gain=0.0).accept and not decide(CURRENT, cand, min_gain=0.05).accept


# ---- export of the corrected photos ---------------------------------------------------------------------------------------------------

def _photo(color=(120, 120, 120)):
    buffer = io.BytesIO()
    Image.new("RGB", (200, 100), color).save(buffer, "PNG")
    return buffer.getvalue()


def test_export_writes_labelled_photos_and_leaves_the_rest_aside(tmp_path):
    rows = [
        {"id": "a1", "code": "CUT_INSULATION"},       # the model finds it: box of the model
        {"id": "b2", "code": "SCRATCH_INSULATION"},   # the model finds nothing: a person has to draw
        {"id": "c3", "code": "Soudure défectueuse"},  # not visible on a photo
        {"id": "d4", "code": "SPARK_TEST_FAILURE"},   # new code but one photo only
    ]

    def detect(image):
        return [("hole", 0.9, (20.0, 10.0, 120.0, 60.0))]

    summary = export_corrections.export(rows, lambda row: _photo(), detect, CLASS_MAP, VISUAL, tmp_path, min_new=20, holdout_share=0.0)
    assert summary["train"] == 1 and summary["to_annotate"] == 1 and summary["skipped"] == 2 and summary["new_classes"] == []
    label = next((tmp_path / "labels").glob("*.txt")).read_text().split()
    assert label[0] == str(BASE_CLASSES.index("hole")) and len(label) == 5
    assert list((tmp_path / "to_annotate").glob("*.jpg"))
    manifest = {m["id"]: m for m in json.loads((tmp_path / "manifest.json").read_text())["items"]}
    assert manifest["a1"]["annotation"] == "model" and manifest["b2"]["split"] == "to_annotate"
    assert manifest["c3"]["reason"] == "not a defect visible on a photo" and manifest["d4"]["reason"] == "too few photos for a new class"


def test_export_with_weak_boxes_labels_everything_it_can(tmp_path):
    rows = [{"id": "b2", "code": "SCRATCH_INSULATION"}]
    summary = export_corrections.export(rows, lambda row: _photo(), lambda image: [], CLASS_MAP, VISUAL, tmp_path, allow_weak=True, holdout_share=0.0)
    assert summary["train"] == 1 and summary["to_annotate"] == 0
    assert json.loads((tmp_path / "manifest.json").read_text())["items"][0]["annotation"] == "weak"


def test_a_new_class_appears_when_enough_photos_show_the_code(tmp_path):
    rows = [{"id": f"s{i}", "code": "SPARK_TEST_FAILURE"} for i in range(20)]
    summary = export_corrections.export(rows, lambda row: _photo(), lambda image: [], CLASS_MAP, VISUAL, tmp_path, allow_weak=True, min_new=20, holdout_share=0.0)
    assert summary["new_classes"] == ["spark_test_failure"] and summary["train"] == 20
    assert json.loads((tmp_path / "classes.json").read_text())["names"][-1] == "spark_test_failure"
    assert next((tmp_path / "labels").glob("*.txt")).read_text().split()[0] == str(len(BASE_CLASSES))


# ---- deployment --------------------------------------------------------------------------------------------------------------------------

@pytest.fixture
def weights(tmp_path, monkeypatch):
    (tmp_path / "runs/detect/train/weights").mkdir(parents=True)
    monkeypatch.setattr(auto_retrain, "WEIGHTS", tmp_path / "best.pt")
    monkeypatch.setattr(auto_retrain, "CANDIDATE_WEIGHTS", tmp_path / "runs/detect/train/weights/best_candidate.pt")
    monkeypatch.setattr(auto_retrain, "BACKUPS", tmp_path / "backups")
    (tmp_path / "best.pt").write_bytes(b"old")
    (tmp_path / "runs/detect/train/weights/best_candidate.pt").write_bytes(b"new")
    return tmp_path


def test_deploy_replaces_the_weights_keeps_a_backup_and_reloads(weights, monkeypatch):
    calls = []
    monkeypatch.setattr(auto_retrain, "reload_service", lambda url: calls.append(url) or (True, ""))
    outcome = auto_retrain.deploy("http://x/reload", "better")
    assert (weights / "best.pt").read_bytes() == b"new" and outcome.startswith("deployed") and "service reloaded" in outcome
    assert [p.read_bytes() for p in (weights / "backups").glob("best_*.pt")] == [b"old"] and calls == ["http://x/reload"]


def test_deploy_puts_the_old_weights_back_when_the_service_cannot_load_the_new_ones(weights, monkeypatch):
    answers = iter([(False, "HTTP 500: corrupt"), (True, "")])
    monkeypatch.setattr(auto_retrain, "reload_service", lambda url: next(answers))
    outcome = auto_retrain.deploy("http://x/reload", "better")
    assert outcome.startswith("ROLLED BACK") and (weights / "best.pt").read_bytes() == b"old"


def test_deploy_still_replaces_the_weights_when_the_service_is_down(weights, monkeypatch):
    monkeypatch.setattr(auto_retrain, "reload_service", lambda url: (False, "service not reachable (ConnectionError)"))
    outcome = auto_retrain.deploy("http://x/reload", "better")
    assert (weights / "best.pt").read_bytes() == b"new" and "restart or reload the service" in outcome
