"""Default paths anchored to this checkout, independent of the working directory."""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOT = REPO_ROOT / 'data_artifacts'
REFERENCE_OUTPUT = ARTIFACT_ROOT / '20261110'
NAME_REPORT = Path(__file__).resolve().parent / 'reference/name_report.csv'
