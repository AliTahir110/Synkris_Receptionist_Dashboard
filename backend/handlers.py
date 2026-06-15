def handle_check_availability(pms, args):
    slots = pms.get_available_slots(
        args["treatment_key"],
        args.get("practitioner_id") or None,
        args["date_from"],
        args["date_to"],
    )
    if not slots:
        return {"status": "no_slots", "slots": []}
    return {"status": "ok", "slots": [slot.to_dict() for slot in slots]}


def handle_book_appointment(pms, args):
    patient_args = args["patient"]
    patient = pms.find_patient(
        patient_args["first_name"],
        patient_args["last_name"],
        patient_args["dob"],
    ) or pms.create_patient(
        patient_args["first_name"],
        patient_args["last_name"],
        patient_args["dob"],
        patient_args["phone"],
    )
    result = pms.create_appointment(
        patient.id,
        args["treatment_key"],
        args["practitioner_id"],
        args["start"],
    )
    if result["status"] == "booked":
        return {
            "status": "booked",
            "appointment_id": result["appointment"]["id"],
            "message": "You're booked in.",
        }
    if result["status"] == "slot_taken":
        return {"status": "slot_taken", "message": "Sorry, that slot was just taken."}
    return {"status": "error", "message": "Something went wrong booking that."}


def handle_lookup_patient(pms, args):
    patient = pms.find_patient(args["first_name"], args["last_name"], args["dob"])
    if patient is None:
        return {"status": "not_found"}
    upcoming = [
        {
            "appointment_id": appointment["id"],
            "start": appointment["start"],
            "treatment": appointment["treatment_name"],
            "practitioner_name": appointment["practitioner_name"],
        }
        for appointment in patient.upcoming
    ]
    return {"status": "found", "patient_id": patient.id, "upcoming": upcoming}


def handle_cancel_appointment(pms, args):
    result = pms.cancel_appointment(args["appointment_id"])
    if result["status"] == "cancelled":
        return {"status": "cancelled", "message": "That's cancelled for you."}
    return {"status": "not_found", "message": "I couldn't find that appointment."}


def handle_reschedule_appointment(pms, args):
    result = pms.reschedule_appointment(
        args["appointment_id"],
        args["new_start"],
        args.get("practitioner_id") or None,
    )
    if result["status"] == "rescheduled":
        return {
            "status": "rescheduled",
            "appointment_id": result["appointment"]["id"],
            "message": "Done, that's moved.",
        }
    if result["status"] == "slot_taken":
        return {"status": "slot_taken", "message": "Sorry, that new time was just taken."}
    return {"status": "not_found", "message": "I couldn't find that appointment."}


HANDLERS = {
    "check_availability": handle_check_availability,
    "book_appointment": handle_book_appointment,
    "lookup_patient": handle_lookup_patient,
    "cancel_appointment": handle_cancel_appointment,
    "reschedule_appointment": handle_reschedule_appointment,
}


def dispatch(pms, function, args):
    handler = HANDLERS.get(function)
    if handler is None:
        return {"status": "error", "message": f"unknown function: {function}"}
    try:
        return handler(pms, args)
    except (KeyError, ValueError) as exc:
        return {"status": "error", "message": f"bad request: {exc}"}
