#!/usr/bin/env python
"""Preview or apply missing local trial accounts without wiping demo data."""

import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from app.services.local_trial_account_service import (  # noqa: E402
    ensure_local_director01,
    ensure_local_interviewer02,
)


def main():
    parser = argparse.ArgumentParser(
        description="只补齐缺失的本地试用账号；默认仅预览",
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        result = {
            "accounts": [
                ensure_local_interviewer02(apply=args.apply),
                ensure_local_director01(apply=args.apply),
            ],
        }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
