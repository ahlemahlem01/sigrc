"""Data mining over historical dossiers: thin data, planted rules, employee restrictions."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import mining  # noqa: E402


def dossier(i, defect="Sertissage", line="ASM-01", shift="Matin", client="C1", severity="MEDIUM",
            produced=1000, defective=10, causes=None, title=None):
    return {
        "id": f"id-{i}", "title": title or f"Titre secret {i}", "defectType": defect, "productionLine": line,
        "shift": shift, "clientId": client, "severity": severity, "lotNumber": f"LOT-{i}",
        "description": f"{defect} sur {line}", "detectionDate": "2024-01-01",
        "produced": produced, "defective": defective, "causes": causes or [],
    }


def planted_history():
    """24 'Soudure' dossiers on WR-04 at night, plus 40 varied others."""
    rows = [dossier(i, "Soudure", "WR-04", "Nuit", causes=[
        {"category": "Machine", "text": "Usure des électrodes de soudure", "isRoot": True},
        {"category": "Méthode", "text": "Paramètres non standardisés", "isRoot": False}]) for i in range(24)]
    lines = ["ASM-01", "CUT-01", "EXT-01", "WR-04"]
    shifts = ["Matin", "Après-midi", "Nuit"]
    defects = ["Sertissage", "Isolation", "Dimension", "Soudure"]
    for j in range(40):
        rows.append(dossier(100 + j, defects[j % 3], lines[j % 3], shifts[j % 2], client=f"C{j % 5}"))
    return rows


def test_empty_history_does_not_fail_and_says_insufficient():
    out = mining.mine([], {"defectType": "Soudure"})
    assert out["meta"]["dossiers"] == 0
    assert out["meta"]["rulesSufficient"] is False
    assert out["rules"] == []
    assert out["rootCauses"]["sufficient"] is False
    assert out["similar"]["available"] is False


def test_thin_history_mines_no_rules():
    history = [dossier(i, "Soudure", "WR-04", "Nuit") for i in range(8)]
    out = mining.mine(history, {"defectType": "Soudure", "productionLine": "WR-04"})
    assert out["meta"]["rulesSufficient"] is False
    assert out["rules"] == []


def test_planted_rule_is_found_and_matches_the_current_dossier():
    out = mining.mine(planted_history(), {"defectType": "Soudure", "productionLine": "WR-04", "shift": "Nuit"})
    assert out["meta"]["rulesSufficient"] is True
    rule = next(r for r in out["rules"] if r["defect"] == "Soudure" and {a["value"] for a in r["antecedent"]} & {"WR-04", "Nuit"})
    assert rule["support"] >= 3 and rule["confidence"] >= 0.5 and rule["lift"] >= 1.5 and rule["pValue"] < 0.05
    assert rule["matchesCurrent"] is True


def test_random_data_yields_no_spurious_rules():
    import random
    rng = random.Random(1)
    history = [dossier(i, rng.choice(["A", "B", "C", "D"]), rng.choice(["L1", "L2", "L3"]), rng.choice(["Matin", "Nuit"]),
                       client=rng.choice(["X", "Y", "Z"])) for i in range(60)]
    assert mining.mine(history, None)["rules"] == []


def test_root_cause_wordings_are_grouped():
    history = [dossier(i, "Soudure", causes=[{"category": "Machine", "text": t, "isRoot": True}])
               for i, t in enumerate(["Usure des électrodes de soudure", "Usure électrodes soudure", "Usure des électrodes",
                                      "Usure des électrodes de soudure", "Dérive de la pression", "Usure des électrodes de soudure"])]
    out = mining.mine(history, {"defectType": "Soudure"})["rootCauses"]
    assert out["sufficient"] is True
    top = out["causes"][0]
    assert "électrodes" in top["text"] and top["dossiers"] >= 4


def test_weighted_pareto_uses_impact_not_just_counts():
    history = [dossier(i, "Frequent", severity="LOW", defective=2) for i in range(10)] + \
              [dossier(100 + i, "Grave", severity="CRITICAL", defective=40) for i in range(3)]
    rows = mining.mine(history)["weightedPareto"]["defectType"]
    assert rows[0]["category"] == "Grave"
    assert rows[0]["count"] == 3 and rows[0]["ppm"] == 40000


def test_employee_output_never_contains_dossier_identifiers_or_small_groups():
    history = planted_history() + [dossier(500, "Rare", "TEST-01", "Nuit", client="SECRET-CLIENT", title="Titre secret rare",
                                           causes=[{"category": "Machine", "text": "Cause très rare", "isRoot": True}])]
    out = mining.mine(history, {"defectType": "Soudure", "productionLine": "WR-04"}, restricted=True)
    blob = json.dumps(out, ensure_ascii=False)
    for forbidden in ("Titre secret", "LOT-", "SECRET-CLIENT", "id-"):
        assert forbidden not in blob
    assert "Rare" not in {r["category"] for r in out["weightedPareto"]["defectType"]}
    assert all(r["count"] >= mining.MIN_SUPPORT for r in out["weightedPareto"]["defectType"])
    assert out["similar"]["cases"] == []
    assert out["similar"]["available"] is True and out["similar"]["count"] >= mining.MIN_SUPPORT
    assert all(c["dossiers"] >= mining.MIN_SUPPORT for c in out["rootCauses"]["causes"])


def test_admin_gets_the_individual_similar_cases():
    out = mining.mine(planted_history(), {"defectType": "Soudure", "productionLine": "WR-04"}, restricted=False)
    cases = out["similar"]["cases"]
    assert cases and cases[0]["id"].startswith("id-") and cases[0]["similarity"] >= mining.SIMILARITY_FLOOR


def test_endpoint_works_without_the_recommendation_model():
    from fastapi.testclient import TestClient
    import api

    client = TestClient(api.app)  # no lifespan: the recommend model is not loaded here
    response = client.post("/mine/insights", json={"history": planted_history(), "current": {"defectType": "Soudure"}, "restricted": True})
    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["restricted"] is True and body["meta"]["dossiers"] == 64
    empty = client.post("/mine/insights", json={"history": []})
    assert empty.status_code == 200 and empty.json()["meta"]["rulesSufficient"] is False


def monthly_history(defect, counts_by_month, start=(2024, 1)):
    """One dossier per count in the given month sequence; filler dossiers keep the history above the minimum size."""
    rows, i = [], 0
    year, month = start
    for count in counts_by_month:
        for _ in range(count):
            d = dossier(i, defect, "WR-04", "Nuit")
            d["detectionDate"] = f"{year}-{month:02d}-10"
            rows.append(d)
            i += 1
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return rows


def test_a_rising_defect_is_detected():
    # 9 quiet months (1 per month) then 3 months with 5 per month
    history = monthly_history("Soudure", [1] * 9 + [5, 5, 5])
    out = mining.mine(history, {"defectType": "Soudure"})["trend"]
    assert out["sufficient"] is True
    assert out["current"]["direction"] == "up" and out["current"]["ratio"] > 2
    assert out["current"]["recent"] == 15 and out["current"]["baseline"] == 9
    assert [r["defect"] for r in out["rising"]] == ["Soudure"]
    assert len(out["monthly"]) == 12


def test_a_steady_defect_is_not_flagged():
    history = monthly_history("Soudure", [2] * 12) + monthly_history("Sertissage", [1] * 12)
    out = mining.mine(history, {"defectType": "Soudure"})["trend"]
    assert out["current"]["direction"] == "stable" and out["rising"] == []


def test_trend_is_not_computed_on_a_thin_history():
    out = mining.mine(monthly_history("Soudure", [1, 1, 1]), {"defectType": "Soudure"})["trend"]
    assert out["sufficient"] is False and out["current"] is None


def test_repeated_lots_admin_gets_the_lots_employee_only_an_aggregate():
    history = [dossier(i, "Soudure", lot_override) for i, lot_override in enumerate(["L1"] * 3)]
    for i, d in enumerate(history):
        d["lotNumber"] = "LOT-A" if i < 2 else "LOT-B"
    more = [dossier(10 + i) for i in range(30)]
    for i, d in enumerate(more):
        d["lotNumber"] = f"U{i}"
    admin = mining.mine(history + more, {"defectType": "Soudure", "lotNumber": "LOT-A"})["repeatedLots"]
    assert admin["count"] == 1 and admin["lots"][0]["lot"] == "LOT-A" and admin["currentLotDossiers"] == 2

    employee = mining.mine(history + more, {"defectType": "Soudure", "lotNumber": "LOT-A"}, restricted=True)["repeatedLots"]
    assert employee["lots"] == [] and employee["count"] == 0 and employee["currentLotDossiers"] == 0
    assert "LOT-A" not in json.dumps(mining.mine(history + more, None, restricted=True), ensure_ascii=False)


def test_employee_trend_has_no_month_by_month_series():
    history = monthly_history("Soudure", [1] * 9 + [5, 5, 5])
    out = mining.mine(history, {"defectType": "Soudure"}, restricted=True)["trend"]
    assert out["monthly"] == [] and out["current"]["direction"] == "up"


def test_the_analysts_causes_are_ranked_by_what_history_says():
    history = [dossier(i, "Soudure", causes=[
        {"category": "Machine", "text": "Usure des électrodes de soudure", "isRoot": True},
        {"category": "Méthode", "text": "Paramètres non standardisés", "isRoot": False}]) for i in range(6)]
    current = {"defectType": "Soudure", "causeCandidates": [
        {"id": "a", "category": "Milieu", "text": "Température de l'atelier"},
        {"id": "b", "category": "Machine", "text": "Usure électrodes"},
        {"id": "c", "category": "Méthode", "text": "Paramètres non standardisés"},
    ]}
    out = mining.mine(history, current)["causeEvidence"]
    assert out["sufficient"] is True and out["pool"] == 6
    assert [i["id"] for i in out["items"]] == ["b", "c", "a"]       # root-cause evidence first
    assert out["items"][0]["rootDossiers"] == 6 and out["items"][1]["rootDossiers"] == 0
    assert out["items"][2]["dossiers"] == 0


def test_cause_evidence_stays_aggregate_for_employees_and_is_silent_on_thin_history():
    thin = mining.mine([dossier(1, "Soudure", causes=[{"category": "Machine", "text": "x", "isRoot": True}])],
                       {"defectType": "Soudure", "causeCandidates": [{"id": "a", "category": "Machine", "text": "x"}]})["causeEvidence"]
    assert thin["sufficient"] is False and thin["items"][0]["dossiers"] is None   # nothing invented, order kept

    history = [dossier(i, "Soudure", causes=[{"category": "Machine", "text": "Usure des électrodes", "isRoot": True}]) for i in range(5)]
    history.append(dossier(99, "Soudure", causes=[{"category": "Milieu", "text": "Poussière rare", "isRoot": True}]))
    cur = {"defectType": "Soudure", "causeCandidates": [
        {"id": "a", "category": "Machine", "text": "Usure électrodes"}, {"id": "b", "category": "Milieu", "text": "Poussière rare"}]}
    items = {i["id"]: i for i in mining.mine(history, cur, restricted=True)["causeEvidence"]["items"]}
    assert items["a"]["rootDossiers"] == 5
    assert items["b"]["dossiers"] is None and items["b"]["rootDossiers"] is None   # fewer than 3 dossiers: hidden


def test_a_long_specific_cause_matches_the_short_recorded_wording():
    history = [dossier(i, "Soudure", causes=[
        {"category": "Machine", "text": "Usure des électrodes de soudure", "isRoot": True},
        {"category": "Méthode", "text": "Paramètres non standardisés", "isRoot": False}]) for i in range(6)]
    current = {"defectType": "Soudure", "causeCandidates": [
        {"id": "long", "category": "Machine", "text": "Usure électrodes pince robot WR-04 au-delà du seuil TPM"},
        {"id": "drift", "category": "Machine", "text": "Usure / dérive des électrodes de la pince robot"},
        {"id": "humid", "category": "Milieu", "text": "Impact humidité / température atelier"},
        {"id": "one", "category": "Mesure", "text": "Contrôle final insuffisant"},
    ]}
    items = {i["id"]: i for i in mining.mine(history, current)["causeEvidence"]["items"]}
    assert items["long"]["rootDossiers"] == 6
    assert items["drift"]["rootDossiers"] == 6
    assert items["humid"]["dossiers"] == 0 and items["one"]["dossiers"] == 0   # no false match on unrelated wording
