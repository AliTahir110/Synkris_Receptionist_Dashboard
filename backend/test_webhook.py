import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from handlers import dispatch  # noqa: E402
from pms.mock import MockPMS  # noqa: E402

CONFIG = json.load(open(os.path.join(HERE, "seed_config.json"), encoding="utf-8"))
TZ = ZoneInfo(CONFIG["practice"]["timezone"])


def main():
    pms = MockPMS(CONFIG, now=datetime(2026, 6, 8, 8, 0, tzinfo=TZ))

    available = dispatch(
        pms,
        "check_availability",
        {
            "treatment_key": "exam",
            "practitioner_id": None,
            "date_from": "2026-06-08",
            "date_to": "2026-06-12",
        },
    )
    assert available["status"] == "ok"
    first_slot = available["slots"][0]

    booked = dispatch(
        pms,
        "book_appointment",
        {
            "patient": {
                "first_name": "John",
                "last_name": "Doe",
                "dob": "1985-03-22",
                "phone": "+447700900123",
            },
            "treatment_key": "exam",
            "practitioner_id": first_slot["practitioner_id"],
            "start": first_slot["start"],
        },
    )
    assert booked["status"] == "booked"

    lookup = dispatch(
        pms,
        "lookup_patient",
        {"first_name": "John", "last_name": "Doe", "dob": "1985-03-22"},
    )
    assert lookup["status"] == "found"
    appointment_id = lookup["upcoming"][0]["appointment_id"]

    cancelled = dispatch(pms, "cancel_appointment", {"appointment_id": appointment_id})
    assert cancelled["status"] == "cancelled"
    assert dispatch(pms, "missing", {})["status"] == "error"
    print("Webhook dispatch smoke test passed")


if __name__ == "__main__":
    main()
