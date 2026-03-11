from __future__ import annotations

import argparse
import json

from services.meeting_packet_rpa import MeetingPacketRPAService


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze recurring meeting packet folders for ERP/RPA.")
    parser.add_argument("root_path", help="Root directory containing packet subfolders")
    args = parser.parse_args()

    service = MeetingPacketRPAService()
    result = service.analyze_root(args.root_path)
    print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
