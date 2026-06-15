from dataclasses import asdict, dataclass, field
from typing import List


@dataclass
class Slot:
    start: str
    practitioner_id: str
    practitioner_name: str

    def to_dict(self):
        return asdict(self)


@dataclass
class Appointment:
    id: str
    start: str
    end: str
    treatment_key: str
    treatment_name: str
    practitioner_id: str
    practitioner_name: str
    status: str = "booked"

    def to_dict(self):
        return asdict(self)


@dataclass
class Patient:
    id: str
    first_name: str
    last_name: str
    dob: str
    phone: str
    upcoming: List[dict] = field(default_factory=list)

    def to_dict(self):
        return asdict(self)
