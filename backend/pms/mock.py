import itertools
from datetime import datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

from .base import PMS
from .models import Appointment, Patient, Slot
from .slots import _overlaps, compute_free_slots


class MockPMS(PMS):
    def __init__(self, config: dict, now: Optional[datetime] = None):
        self.config = config
        self.tz = ZoneInfo(config["practice"]["timezone"])
        self.now = now
        self.patients = {}
        self.appointments = {}
        self.appt_owner = {}
        self._next_pid = itertools.count(1)
        self._next_aid = itertools.count(1)

    def _treatment(self, key: str) -> dict:
        treatment = next((t for t in self.config["treatment_types"] if t["key"] == key), None)
        if treatment is None:
            raise ValueError(f"unknown treatment_key: {key}")
        return treatment

    def _practitioner(self, practitioner_id: str) -> dict:
        practitioner = next(
            (p for p in self.config["practitioners"] if p["id"] == practitioner_id),
            None,
        )
        if practitioner is None:
            raise ValueError(f"unknown practitioner_id: {practitioner_id}")
        return practitioner

    def _booked(self) -> List[Appointment]:
        return [appointment for appointment in self.appointments.values() if appointment.status == "booked"]

    def _upcoming_for(self, patient_id: str) -> List[dict]:
        upcoming = []
        for appointment_id, appointment in self.appointments.items():
            if self.appt_owner.get(appointment_id) != patient_id or appointment.status != "booked":
                continue
            if self.now is None or datetime.fromisoformat(appointment.start) >= self.now:
                upcoming.append(appointment.to_dict())
        upcoming.sort(key=lambda appointment: appointment["start"])
        return upcoming

    def find_patient(self, first_name: str, last_name: str, dob: str) -> Optional[Patient]:
        for patient in self.patients.values():
            if (
                patient.first_name.lower() == first_name.lower()
                and patient.last_name.lower() == last_name.lower()
                and patient.dob == dob
            ):
                patient.upcoming = self._upcoming_for(patient.id)
                return patient
        return None

    def create_patient(self, first_name: str, last_name: str, dob: str, phone: str) -> Patient:
        patient_id = f"pat_{next(self._next_pid)}"
        patient = Patient(patient_id, first_name, last_name, dob, phone, [])
        self.patients[patient_id] = patient
        return patient

    def get_available_slots(
        self,
        treatment_key: str,
        practitioner_id: Optional[str],
        date_from: str,
        date_to: str,
    ) -> List[Slot]:
        return compute_free_slots(
            self.config,
            treatment_key,
            practitioner_id,
            date_from,
            date_to,
            [appointment.to_dict() for appointment in self._booked()],
            now=self.now,
        )

    def create_appointment(
        self,
        patient_id: str,
        treatment_key: str,
        practitioner_id: str,
        start: str,
    ) -> dict:
        treatment = self._treatment(treatment_key)
        practitioner = self._practitioner(practitioner_id)
        start_dt = datetime.fromisoformat(start)
        end_dt = start_dt + timedelta(minutes=treatment["duration_minutes"])

        for appointment in self._booked():
            if appointment.practitioner_id != practitioner_id:
                continue
            if _overlaps(start_dt, end_dt, datetime.fromisoformat(appointment.start), datetime.fromisoformat(appointment.end)):
                return {"status": "slot_taken"}

        appointment_id = f"appt_{next(self._next_aid)}"
        appointment = Appointment(
            id=appointment_id,
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
            treatment_key=treatment_key,
            treatment_name=treatment["name"],
            practitioner_id=practitioner_id,
            practitioner_name=practitioner["name"],
        )
        self.appointments[appointment_id] = appointment
        self.appt_owner[appointment_id] = patient_id
        return {"status": "booked", "appointment": appointment.to_dict()}

    def cancel_appointment(self, appointment_id: str) -> dict:
        appointment = self.appointments.get(appointment_id)
        if appointment is None or appointment.status != "booked":
            return {"status": "not_found"}
        appointment.status = "cancelled"
        return {"status": "cancelled"}

    def reschedule_appointment(
        self,
        appointment_id: str,
        new_start: str,
        practitioner_id: Optional[str] = None,
    ) -> dict:
        appointment = self.appointments.get(appointment_id)
        if appointment is None or appointment.status != "booked":
            return {"status": "not_found"}

        patient_id = self.appt_owner.get(appointment_id)
        target_practitioner = practitioner_id or appointment.practitioner_id
        practitioner = self._practitioner(target_practitioner)
        treatment = self._treatment(appointment.treatment_key)
        start_dt = datetime.fromisoformat(new_start)
        end_dt = start_dt + timedelta(minutes=treatment["duration_minutes"])

        for booked in self._booked():
            if booked.id == appointment_id or booked.practitioner_id != target_practitioner:
                continue
            if _overlaps(start_dt, end_dt, datetime.fromisoformat(booked.start), datetime.fromisoformat(booked.end)):
                return {"status": "slot_taken"}

        appointment.status = "cancelled"
        new_id = f"appt_{next(self._next_aid)}"
        new_appointment = Appointment(
            id=new_id,
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
            treatment_key=appointment.treatment_key,
            treatment_name=treatment["name"],
            practitioner_id=target_practitioner,
            practitioner_name=practitioner["name"],
        )
        self.appointments[new_id] = new_appointment
        self.appt_owner[new_id] = patient_id
        return {"status": "rescheduled", "appointment": new_appointment.to_dict()}
