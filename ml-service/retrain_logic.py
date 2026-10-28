"""Pure rules of the retraining loop of the image model (no PyTorch, no network: tested on their own).

* which detector class a corrected defect code teaches (and which new classes are worth adding);
* the training label of a corrected photo (box of the model if it found the right defect there, else a weak box, else the photo is left for
  a person to annotate);
* the decision to put a candidate model in service.
"""
from __future__ import annotations

import hashlib
from collections import Counter
from dataclasses import dataclass, field

# the classes of the model in service (same order as build_training_set.NAMES: ids never move, new classes are appended)
BASE_CLASSES = ["foreign", "hole", "scratch", "spot", "break", "thunderbolt", "defect"]


def classes_of_code(code: str, class_map: dict[str, str]) -> list[str]:
    """Detector class names that stand for a defect code (cv_class_map.json)."""
    return [name for name, target in class_map.items() if target == code]


@dataclass
class ClassPlan:
    names: list[str]                                   # base classes, then the classes added for new codes
    assignment: dict[str, str | None] = field(default_factory=dict)   # defect code -> class name (None: cannot be learned)
    skipped: Counter = field(default_factory=Counter)  # reason -> number of photos


def plan_classes(
    codes: list[str],
    class_map: dict[str, str],
    visual_codes: set[str],
    base: list[str] | None = None,
    min_new: int = 20,
) -> ClassPlan:
    """Which class each corrected photo teaches.

    A code already behind a class of the model teaches that class. A cable code with no class yet gets a class of its own (named like the code in
    lower case) once at least `min_new` photos show it; fewer photos would not teach anything and are left out. Codes that are not a visual
    cable defect (workshop wordings, dimensions, electrical values...) cannot be learned from a photo.
    """
    base = list(base or BASE_CLASSES)
    plan = ClassPlan(names=base)
    counts = Counter(codes)
    for code, n in sorted(counts.items()):
        existing = [c for c in classes_of_code(code, class_map) if c in base]
        if existing:
            plan.assignment[code] = existing[0]
        elif code in visual_codes and n >= min_new:
            plan.names.append(code.lower())
            plan.assignment[code] = code.lower()
        else:
            plan.assignment[code] = None
            plan.skipped["too few photos for a new class" if code in visual_codes else "not a defect visible on a photo"] += n
    return plan


def centre_box(width: int, height: int, share: float = 0.5) -> tuple[float, float, float, float]:
    """A box over the centre of the photo: a guess, only used when it was asked for."""
    return (width * (1 - share) / 2, height * (1 - share) / 2, width * (1 + share) / 2, height * (1 + share) / 2)


def yolo_line(class_id: int, box: tuple[float, float, float, float], width: int, height: int) -> str:
    x1, y1, x2, y2 = max(0.0, box[0]), max(0.0, box[1]), min(float(width), box[2]), min(float(height), box[3])
    return f"{class_id} {(x1 + x2) / 2 / width:.6f} {(y1 + y2) / 2 / height:.6f} {(x2 - x1) / width:.6f} {(y2 - y1) / height:.6f}"


def build_label(
    detections: list[tuple[str, float, tuple[float, float, float, float]]],
    class_name: str,
    size: tuple[int, int],
    allow_weak: bool = False,
    min_conf: float = 0.25,
) -> tuple[str, list[tuple[float, float, float, float]]]:
    """(kind, boxes) of a corrected photo.

    'model': the model found the defect the operator named: its boxes (the person confirmed the class, the model only locates it).
    'weak':  nothing found, a centre box was asked for.
    'none':  nothing found: the photo needs a person to draw the box.
    """
    boxes = [box for name, conf, box in detections if name == class_name and conf >= min_conf]
    if boxes:
        return "model", boxes
    if allow_weak:
        return "weak", [centre_box(*size)]
    return "none", []


def is_holdout(key: str, share: float = 0.2) -> bool:
    """Stable choice of the photos kept aside to measure on field photos (never trained on)."""
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF < share


@dataclass
class Decision:
    accept: bool
    reason: str


def decide(
    current: dict,
    candidate: dict,
    min_gain: float = 0.0,
    max_class_drop: float = 0.10,
) -> Decision:
    """Does the candidate replace the model in service?

    current / candidate: {"reference_map50": float, "per_class": {class name: AP50}} where the first is measured on the fixed reference photos
    (the 38 held-out photos of the first dataset) and the second on the wider held-out test set.
    The candidate must beat the current model on the reference photos (strictly, by more than min_gain) and must not lose more than
    max_class_drop of AP50 on any class the current model already handled.
    """
    gain = candidate["reference_map50"] - current["reference_map50"]
    if gain <= min_gain:
        return Decision(False, f"mAP@50 on the reference photos {candidate['reference_map50']:.4f} does not beat the current {current['reference_map50']:.4f} (gain {gain:+.4f}, needed more than {min_gain:+.4f})")
    drops = []
    for name, value in current.get("per_class", {}).items():
        cand = candidate.get("per_class", {}).get(name)
        if cand is None:
            drops.append(f"{name} (lost)")
        elif cand < value - max_class_drop:
            drops.append(f"{name} ({value:.2f} -> {cand:.2f})")
    if drops:
        return Decision(False, "better on the reference photos but loses too much on: " + ", ".join(drops))
    return Decision(True, f"mAP@50 on the reference photos {current['reference_map50']:.4f} -> {candidate['reference_map50']:.4f} (gain {gain:+.4f}), no class loses more than {max_class_drop:.2f}")
