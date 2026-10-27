"""Downloads the Roboflow cable-defect dataset (YOLOv8 format) into ml-service/dataset/.

    ROBOFLOW_API_KEY=<key> python download_dataset.py

The key is read from the environment and never written to a file. The dataset is not committed (see .gitignore): this script
and the version below are what makes it reproducible. Check the licence printed in dataset/README.roboflow.txt before reuse.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

WORKSPACE = "steves-workspace-ls3rm"
PROJECT = "cable-defect-4umnl"
VERSION = 3
TARGET = Path(__file__).resolve().parent / "dataset"


def main() -> None:
    key = os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        sys.exit("Set ROBOFLOW_API_KEY (Roboflow > Settings > API Keys) before running this script.")
    from roboflow import Roboflow  # imported here: the module stays importable without the package

    version = Roboflow(api_key=key).workspace(WORKSPACE).project(PROJECT).version(VERSION)
    dataset = version.download("yolov8", location=str(TARGET))
    print("downloaded to", dataset.location)


if __name__ == "__main__":
    main()
