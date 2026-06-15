import json
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from pms.mock import MockPMS  # noqa: E402
from pms.slots import compute_free_slots  # noqa: E402

CONFIG = json.load(open(os.path.join(HERE, "seed_config.json"), encoding="utf-8"))
TZ = ZoneInfo(CONFIG["practice"]["timezone"])
JANE = "dentally_practitioner_101"
AISHA = "dentally_practitioner_102"


def iso(value):
    return datetime.fromisoformat(value)


def overlaps(slot, duration_min, start, end):
    slot_start = iso(slot.start)
    return slot_start < iso(end) and slot_start + timedelta(minutes=duration_min) > iso(start)


def main():
    now = datetime(2026, 6, 8, 8, 0, tzinfo=TZ)
    pms = MockPMS(CONFIG, now=now)

    patient = pms.create_patient("John", "Doe", "1985-03-22", "+447700900123")
    assert patient.id.startswith("pat_")

    booking = pms.create_appointment(patient.id, "exam", JANE, "2026-06-08T10:00:00+01:00")
    assert booking["status"] == "booked"
    assert booking["appointment"]["end"] == "2026-06-08T10:20:00+01:00"

    found = pms.find_patient("john", "doe", "1985-03-22")
    assert found and found.id == patient.id
    assert len(found.upcoming) == 1

    slots = pms.get_available_slots("exam", None, "2026-06-08", "2026-06-12")
    assert slots
    assert all(slot.practitioner_id == JANE for slot in slots)
    assert all(iso(slot.start) >= now for slot in slots)
    assert not any(overlaps(slot, 20, "2026-06-08T10:00:00+01:00", "2026-06-08T10:20:00+01:00") for slot in slots)

    scale_slots = compute_free_slots(
        CONFIG,
        "scale_polish",
        None,
        "2026-06-08",
        "2026-06-13",
        [appointment.to_dict() for appointment in pms._booked()],
        now=now,
        limit=100000,
    )
    practitioners = {slot.practitioner_id for slot in scale_slots}
    assert JANE in practitioners and AISHA in practitioners

    taken = pms.create_appointment(patient.id, "exam", JANE, "2026-06-08T10:05:00+01:00")
    assert taken["status"] == "slot_taken"

    assert pms.cancel_appointment(booking["appointment"]["id"])["status"] == "cancelled"
    assert pms.cancel_appointment(booking["appointment"]["id"])["status"] == "not_found"
    print("PMS smoke test passed")


if __name__ == "__main__":
    main()
