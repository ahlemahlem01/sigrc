"""The defect catalogue exists once (defect_catalog.json); everything that repeats it must stay identical."""
import json
import re
from pathlib import Path

from cv_mapping import line_context, load_catalog, load_class_map

ROOT = Path(__file__).resolve().parents[2]
CATALOG = load_catalog()
CABLE = [d["code"] for d in CATALOG["defects"] if d["kind"] == "cable"]
FACTORY = [d["code"] for d in CATALOG["defects"] if d["kind"] == "factory"]


def test_the_catalogue_has_25_types_and_2889_claims_with_11_percent_of_workshop_defects():
    counts = {d["code"]: d["count"] for d in CATALOG["defects"]}
    assert len(counts) == 25 and len(CABLE) == 20 and len(FACTORY) == 5
    assert sum(counts.values()) == 2889
    assert round(100 * sum(counts[c] for c in FACTORY) / 2889) == 11
    top7 = [counts[c] for c in ("CUT_INSULATION", "SCRATCH_INSULATION", "COPPER_BROKEN", "MARKING_DEFECT",
                                "COLOR_NON_CONFORMITY", "INSULATION_THICKNESS", "SPOOL_DAMAGED")]
    assert top7 == [261, 233, 233, 206, 173, 168, 145]
    assert all(48 <= n <= 130 for code, n in counts.items() if code not in ("CUT_INSULATION", "SCRATCH_INSULATION", "COPPER_BROKEN", "MARKING_DEFECT", "COLOR_NON_CONFORMITY", "INSULATION_THICKNESS", "SPOOL_DAMAGED"))


def test_each_defect_is_found_only_on_the_lines_of_its_process():
    def families(code):
        return set(line_context(code, CATALOG)["lineFamilies"])

    assert families("INSULATION_THICKNESS") == {"EXT"}
    assert families("CONDUCTOR_DIAMETER") == {"WR"}
    assert families("SPOOL_LENGTH") == {"CUT", "CTL"}
    assert all(families(c) == {"ASM"} for c in FACTORY)


def test_the_reference_list_of_the_application_uses_the_same_codes():
    source = (ROOT / "Coficab.Auth/Coficab.ActionPlan.Application/ReferenceLists/ProductionReferenceData.cs").read_text(encoding="utf-8-sig")
    block = source.split("// Direct customers")[0]
    assert re.findall(r'ReferenceListKeys\.DefectType, "([A-Z_]+)"', block) == CABLE


def test_the_translations_and_the_label_helper_use_the_same_codes():
    for lang in ("fr", "en", "it"):
        locale = json.loads((ROOT / f"coficab-auth-frontend/src/i18n/locales/{lang}.json").read_text(encoding="utf-8-sig"))
        assert list(locale["defectTypes"]) == CABLE, lang
    helper = (ROOT / "coficab-auth-frontend/src/utils/defectLabel.ts").read_text(encoding="utf-8-sig")
    declared = re.search(r"const CODED_DEFECTS = \[(.*?)\];", helper, re.S).group(1)
    assert re.findall(r"'([A-Z_]+)'", declared) == CABLE


def test_the_french_wording_of_the_reference_list_is_the_catalogue_wording():
    source = (ROOT / "Coficab.Auth/Coficab.ActionPlan.Application/ReferenceLists/ProductionReferenceData.cs").read_text(encoding="utf-8-sig")
    declared = dict(re.findall(r'ReferenceListKeys\.DefectType, "([A-Z_]+)", "([^"]+)"', source))
    assert declared == {d["code"]: d["fr"] for d in CATALOG["defects"] if d["kind"] == "cable"}


def test_the_dataset_classes_point_at_codes_of_the_catalogue():
    mapping = load_class_map()
    assert {"foreign", "hole", "scratch", "spot", "break", "thunderbolt"} <= set(mapping)
    assert set(mapping.values()) <= set(CABLE)


def test_the_narratives_cover_every_cable_defect_with_usable_templates():
    narratives = json.loads((ROOT / "ml-service/reference-dataset/cable_narratives.json").read_text(encoding="utf-8"))
    assert list(narratives["defects"]) == CABLE
    categories = {"Machine", "Method", "Material", "Manpower", "Milieu", "Measurement"}
    for code, n in narratives["defects"].items():
        assert len(n["scenarios"]) == 2 and n["action"].strip() and "{line}" in n["note"], code
        for title, description in n["scenarios"]:
            assert any(p in title for p in ("{line}", "{client}", "{zone}", "{lot}")), code
            assert "{lot}" in description or "{line}" in description, code
        assert 3 <= len(n["causes"]) <= 5 and any(c[2] for c in n["causes"]), code
        assert all(c[0] in categories for c in n["causes"]), code
