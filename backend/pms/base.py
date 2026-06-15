from abc import ABC, abstractmethod
from typing import List, Optional

from .models import Patient, Slot


class PMS(ABC):
    @abstractmethod
    def find_patient(self, first_name: str, last_name: str, dob: str) -> Optional[Patient]:
        pass

    @abstractmethod
    def create_patient(self, first_name: str, last_name: str, dob: str, phone: str) -> Patient:
        pass

    @abstractmethod
    def get_available_slots(
        self,
        treatment_key: str,
        practitioner_id: Optional[str],
        date_from: str,
        date_to: str,
    ) -> List[Slot]:
        pass

    @abstractmethod
    def create_appointment(
        self,
        patient_id: str,
        treatment_key: str,
        practitioner_id: str,
        start: str,
    ) -> dict:
        pass

    @abstractmethod
    def cancel_appointment(self, appointment_id: str) -> dict:
        pass

    @abstractmethod
    def reschedule_appointment(
        self,
        appointment_id: str,
        new_start: str,
        practitioner_id: Optional[str] = None,
    ) -> dict:
        pass
