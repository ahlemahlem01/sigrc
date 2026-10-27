from cv_mapping import load_class_map, pick_defect

MAP = load_class_map()


def test_the_most_confident_known_defect_is_picked():
    detections = [("cut_insulation", 0.61), ("Copper Broken", 0.85), ("person", 0.99)]
    assert pick_defect(detections, MAP) == ("COPPER_BROKEN", 0.85)


def test_class_names_match_whatever_the_case_or_separator():
    assert pick_defect([("Cut-Insulation", 0.5)], MAP) == ("CUT_INSULATION", 0.5)


def test_everyday_objects_are_never_turned_into_a_defect():
    # what the general-purpose yolov8n.pt sees on any photo
    assert pick_defect([("person", 0.97), ("cell phone", 0.9), ("scissors", 0.8)], MAP) is None


def test_a_detection_below_the_threshold_is_ignored():
    assert pick_defect([("cut_insulation", 0.2)], MAP, min_confidence=0.25) is None


def test_every_target_code_is_a_cable_code_of_the_catalogue():
    from cv_mapping import load_catalog

    cable = {d["code"] for d in load_catalog()["defects"] if d["kind"] == "cable"}
    assert set(MAP.values()) == cable


def test_the_trained_detector_classes_give_business_codes():
    assert pick_defect([("scratch", 0.8)], MAP) == ("SCRATCH_INSULATION", 0.8)
    assert pick_defect([("hole", 0.7)], MAP) == ("CUT_INSULATION", 0.7)
    assert pick_defect([("spot", 0.6)], MAP) == ("COLOR_NON_CONFORMITY", 0.6)
    assert pick_defect([("foreign", 0.5)], MAP) == ("FOREIGN_MATTER", 0.5)
