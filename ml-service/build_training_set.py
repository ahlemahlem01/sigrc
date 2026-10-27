"""Merges the two Roboflow cable datasets into one YOLOv8 training set: ml-service/dataset_merged/.

    python build_training_set.py

* dataset/   cable-defect v3 (insulated cable photos):   foreign, hole, scratch, spot            -> classes 0-3
* dataset2/  cable-damage v1 (steel wire-rope photos):   break, thunderbolt                      -> classes 4-5
* dataset3/  cable-defect v2 (harness leads with a terminal): defect (kind not given), good        -> class 6 "defect"; the "good" boxes are
             dropped and those images stay as photos without any defect (background examples that teach the model not to raise false alarms)

The second dataset is 15 times larger than the first one: it is sampled down and the first one is repeated, so the insulation classes are
not drowned. Images the model is tested on are never in the training split (the second dataset has no test split: its test images are taken
from the training images that are not used for training).
"""
from __future__ import annotations

import random
import shutil
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
OUT = HERE / "dataset_merged"
NAMES = ["foreign", "hole", "scratch", "spot", "break", "thunderbolt", "defect"]
DS1_REPEAT = 2       # the small dataset is used twice per epoch
DS2_TRAIN, DS2_VALID, DS2_TEST = 250, 50, 80
DS3_TRAIN, DS3_VALID = 200, 40   # the 25 images of its own test split are the test images
SEED = 7


def pairs(folder: Path):
    for img in sorted((folder / "images").glob("*")):
        label = folder / "labels" / (img.stem + ".txt")
        if label.exists():
            yield img, label


def copy(img: Path, label: Path, split: str, tag: str, offset: int, keep: set[int] | None = None):
    (OUT / split / "images").mkdir(parents=True, exist_ok=True)
    (OUT / split / "labels").mkdir(parents=True, exist_ok=True)
    stem = f"{tag}_{img.stem}"[:120]
    shutil.copyfile(img, OUT / split / "images" / (stem + img.suffix))
    lines = []
    for line in label.read_text().splitlines():
        parts = line.split()
        if parts and (keep is None or int(parts[0]) in keep):
            lines.append(" ".join([str(int(parts[0]) + offset), *parts[1:]]))
    (OUT / split / "labels" / (stem + ".txt")).write_text("\n".join(lines) + "\n")


def main() -> None:
    rnd = random.Random(SEED)
    if OUT.exists():
        shutil.rmtree(OUT)

    ds1, ds2 = HERE / "dataset", HERE / "dataset2"
    for split in ("train", "valid", "test"):
        for img, label in pairs(ds1 / split):
            for r in range(DS1_REPEAT if split == "train" else 1):
                copy(img, label, split, f"c{r}", 0)

    pool = list(pairs(ds2 / "train"))
    rnd.shuffle(pool)
    chosen_train, chosen_test = pool[:DS2_TRAIN], pool[DS2_TRAIN:DS2_TRAIN + DS2_TEST]
    valid_pool = list(pairs(ds2 / "valid"))
    rnd.shuffle(valid_pool)
    for img, label in chosen_train:
        copy(img, label, "train", "r", 4)
    for img, label in valid_pool[:DS2_VALID]:
        copy(img, label, "valid", "r", 4)
    for img, label in chosen_test:
        copy(img, label, "test", "r", 4)

    # dataset 3: class 0 "defect" is kept (id 6), class 1 "good" is dropped
    for split, quota in (("train", DS3_TRAIN), ("valid", DS3_VALID), ("test", None)):
        items = list(pairs(HERE / "dataset3" / split))
        rnd.shuffle(items)
        for img, label in items[:quota]:
            copy(img, label, split, "d", 6, keep={0})

    (OUT / "data.yaml").write_text(yaml.safe_dump({
        "path": str(OUT), "train": "train/images", "val": "valid/images", "test": "test/images",
        "nc": len(NAMES), "names": NAMES,
    }, sort_keys=False), encoding="utf-8")
    for split in ("train", "valid", "test"):
        print(split, len(list((OUT / split / "images").glob("*"))), "images")


if __name__ == "__main__":
    main()
