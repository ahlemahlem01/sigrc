"""Downloads a Roboflow cable dataset (YOLOv8 format) into ml-service/<folder>/ (dataset/, dataset2/ or dataset3/).

    ROBOFLOW_API_KEY=<key> python download_dataset.py [cable-defect | cable-damage | cable-defect-2]

The key is read from the environment and never written to a file. The dataset is not committed (see .gitignore): this script
and the version below are what makes it reproducible. Check the licence printed in dataset/README.roboflow.txt before reuse.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# the datasets used to train the image model (name -> workspace, project, version, folder)
DATASETS = {
    "cable-defect": ("steves-workspace-ls3rm", "cable-defect-4umnl", 3, "dataset"),
    "cable-damage": ("cables-ibsrd", "cable-damage-detection-lsniu", 1, "dataset2"),
    "cable-defect-2": ("kaoutherazouzis-workspace", "cable-defect-wv1yv", 2, "dataset3"),
}
HERE = Path(__file__).resolve().parent


def main() -> None:
    which = sys.argv[1] if len(sys.argv) > 1 else "cable-defect"
    if which not in DATASETS:
        sys.exit("Usage: ROBOFLOW_API_KEY=<key> python download_dataset.py [" + " | ".join(DATASETS) + "]")
    workspace, project, version_no, folder = DATASETS[which]
    key = os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        sys.exit("Set ROBOFLOW_API_KEY (Roboflow > Settings > API Keys) before running this script.")
    from roboflow import Roboflow  # imported here: the module stays importable without the package

    version = Roboflow(api_key=key).workspace(workspace).project(project).version(version_no)
    dataset = version.download("yolov8", location=str(HERE / folder))
    print("downloaded to", dataset.location)


if __name__ == "__main__":
    main()
