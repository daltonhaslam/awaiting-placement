"""Run the pipeline test suite under `python3 -I` (isolated mode drops cwd from sys.path)."""
import sys
import unittest
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE_DIR))

if __name__ == "__main__":
    pattern = sys.argv[1] if len(sys.argv) > 1 else "test_*.py"
    suite = unittest.defaultTestLoader.discover(str(PIPELINE_DIR / "tests"), pattern=pattern, top_level_dir=str(PIPELINE_DIR))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
