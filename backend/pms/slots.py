from datetime import date, datetime, time, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from .models import Slot

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _hhmm(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


def _overlaps(a_start, a_end, b_start, b_end) -> bool:
    return a_start < b_end and a_end > b_start


def compute_free_slots(
    config: dict,
    treatment_key: str,
    practitioner_id: Optional[str],
    date_from: str,
    date_to: str,
    booked: List[dict],
    now: Optional[datetime] = None,
    granularity_min: int = 15,
    limit: int = 6,
) -> List[Slot]:
    tz = ZoneInfo(config["practice"]["timezone"])
    treatment = next((t for t in config["treatment_types"] if t["key"] == treatment_key), None)
    if treatment is None:
        raise ValueError(f"unknown treatment_key: {treatment_key}")

    duration = timedelta(minutes=treatment["duration_minutes"])
    step = timedelta(minutes=granularity_min)
    practitioners = [p for p in config["practitioners"] if treatment_key in p["treatment_keys"]]
    if practitioner_id is not None:
        practitioners = [p for p in practitioners if p["id"] == practitioner_id]

    slots = []
    day = date.fromisoformat(date_from)
    end_day = date.fromisoformat(date_to)
    while day <= end_day:
        weekday = WEEKDAYS[day.weekday()]
        for practitioner in practitioners:
            hours = (practitioner.get("working_hours") or config["opening_hours"]).get(weekday)
            if not hours:
                continue

            win_start = datetime.combine(day, _hhmm(hours["open"]), tz)
            win_end = datetime.combine(day, _hhmm(hours["close"]), tz)
            busy = [
                (
                    datetime.combine(day, _hhmm(item["start"]), tz),
                    datetime.combine(day, _hhmm(item["end"]), tz),
                )
                for item in hours.get("breaks", [])
            ]

            for appointment in booked:
                if appointment["practitioner_id"] != practitioner["id"]:
                    continue
                appt_start = datetime.fromisoformat(appointment["start"])
                appt_end = datetime.fromisoformat(appointment["end"])
                if appt_start.astimezone(tz).date() == day:
                    busy.append((appt_start, appt_end))

            cursor = win_start
            while cursor + duration <= win_end:
                slot_start = cursor
                slot_end = cursor + duration
                if (now is None or slot_start >= now) and not any(
                    _overlaps(slot_start, slot_end, busy_start, busy_end)
                    for busy_start, busy_end in busy
                ):
                    slots.append(
                        Slot(
                            start=slot_start.isoformat(),
                            practitioner_id=practitioner["id"],
                            practitioner_name=practitioner["name"],
                        )
                    )
                cursor += step
        day += timedelta(days=1)

    slots.sort(key=lambda slot: (slot.start, slot.practitioner_id))
    return slots[:limit]
