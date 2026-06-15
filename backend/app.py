import hmac
import os
import sys
import traceback
from datetime import date, datetime, timedelta, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import store  # noqa: E402
from handlers import dispatch  # noqa: E402
from tenants import DEFAULT_TO_NUMBER, get_tenant  # noqa: E402

app = FastAPI(title="SynVoiceAgent backend")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET")
CALL_LOGS = []


def _build_transcript(function, args, result):
    if function == "call_event":
        return (
            args.get("transcript")
            or args.get("transcript_text")
            or args.get("call_summary")
            or args.get("summary")
            or f"Received call event: {args.get('event', 'unknown')}."
        )
    status = result.get("status", "unknown") if isinstance(result, dict) else "unknown"
    if function == "check_availability":
        treatment = args.get("treatment_key", "appointment")
        date_from = args.get("date_from", "")
        date_to = args.get("date_to", "")
        slots = result.get("slots", []) if isinstance(result, dict) else []
        if slots:
            first = slots[0]
            return (
                f"Caller asked about {treatment} availability from {date_from} to {date_to}. "
                f"Synkris found {len(slots)} slots. First option: {first.get('start')} "
                f"with {first.get('practitioner_name')}."
            )
        return f"Caller asked about {treatment} availability from {date_from} to {date_to}. No slots were found."
    if function == "book_appointment":
        patient = args.get("patient", {})
        patient_name = f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip() or "the patient"
        treatment = args.get("treatment_key", "appointment")
        start = args.get("start", "")
        message = result.get("message", "") if isinstance(result, dict) else ""
        return f"Caller booked {treatment} for {patient_name} at {start}. Backend status: {status}. {message}".strip()
    if function == "lookup_patient":
        return f"Caller requested patient lookup. Backend status: {status}."
    if function == "cancel_appointment":
        return f"Caller requested cancellation for appointment {args.get('appointment_id', '')}. Backend status: {status}."
    if function == "reschedule_appointment":
        return f"Caller requested reschedule for appointment {args.get('appointment_id', '')} to {args.get('new_start', '')}. Backend status: {status}."
    return f"Backend handled {function or 'unknown'} with status {status}."


def _extract_to_number(body):
    return (
        body.get("to_number")
        or (body.get("call") or {}).get("to_number")
        or (body.get("args") or {}).get("to_number")
        or DEFAULT_TO_NUMBER
    )


def _extract_call_id(body):
    return body.get("call_id") or (body.get("call") or {}).get("call_id")


def _extract_from_number(body):
    return body.get("from_number") or (body.get("call") or {}).get("from_number")


def _extract_transcript(body):
    return (
        body.get("transcript")
        or body.get("transcript_text")
        or (body.get("call") or {}).get("transcript")
        or (body.get("call") or {}).get("transcript_text")
        or (body.get("call_analysis") or {}).get("call_summary")
        or body.get("summary")
    )


def _log_call(config, body, function, result, args):
    call = {
        "id": _extract_call_id(body) or f"call_{len(CALL_LOGS) + 1}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "tenant_id": config["tenant_id"],
        "from_number": _extract_from_number(body),
        "to_number": _extract_to_number(body),
        "function": function or "unknown",
        "args": args,
        "status": result.get("status", "unknown") if isinstance(result, dict) else "unknown",
        "message": result.get("message", "") if isinstance(result, dict) else "",
        "transcript": _build_transcript(function, args, result),
    }
    CALL_LOGS.append(call)
    if store.configured():
        try:
            store.log_call(call)
        except Exception:
            traceback.print_exc()


@app.get("/health")
def health():
    return {"status": "ok", "service": "synvoiceagent-backend"}


@app.get("/config")
def config():
    tenant = get_tenant(DEFAULT_TO_NUMBER)
    if tenant is None:
        return {"status": "error", "message": "default practice is not configured"}

    practice_config, _ = tenant
    calls = CALL_LOGS[-25:]
    if store.configured():
        try:
            calls = store.fetch_calls(limit=25)
        except Exception:
            traceback.print_exc()

    return {
        "status": "ok",
        "practice": practice_config["practice"],
        "practitioners": practice_config["practitioners"],
        "treatment_types": practice_config["treatment_types"],
        "rooms": practice_config.get("rooms", []),
        "faq": practice_config.get("faq", []),
        "escalation": practice_config.get("escalation", {}),
    }


@app.get("/snapshot")
def snapshot(date_from: str | None = None, date_to: str | None = None):
    tenant = get_tenant(DEFAULT_TO_NUMBER)
    if tenant is None:
        return {"status": "error", "message": "default practice is not configured"}

    practice_config, pms = tenant
    start_day = date.fromisoformat(date_from) if date_from else date.today()
    end_day = date.fromisoformat(date_to) if date_to else start_day + timedelta(days=6)

    patients = [patient.to_dict() for patient in pms.patients.values()]
    appointments = []
    for appointment in pms.appointments.values():
        row = appointment.to_dict()
        patient_id = pms.appt_owner.get(appointment.id)
        patient = pms.patients.get(patient_id)
        row["patient_id"] = patient_id
        row["patient_name"] = (
            f"{patient.first_name} {patient.last_name}" if patient else "New Patient"
        )
        row["patient_phone"] = patient.phone if patient else ""
        appointments.append(row)

    available_slots = []
    for treatment in practice_config["treatment_types"]:
        slots = pms.get_available_slots(
            treatment["key"],
            None,
            start_day.isoformat(),
            end_day.isoformat(),
        )
        available_slots.extend(
            {**slot.to_dict(), "treatment_key": treatment["key"], "treatment_name": treatment["name"]}
            for slot in slots
        )

    appointments.sort(key=lambda item: item["start"])
    available_slots.sort(key=lambda item: item["start"])
    calls = CALL_LOGS[-25:]
    if store.configured():
        try:
            calls = store.fetch_calls(limit=25)
        except Exception:
            traceback.print_exc()

    return {
        "status": "ok",
        "practice": practice_config["practice"],
        "practitioners": practice_config["practitioners"],
        "treatment_types": practice_config["treatment_types"],
        "rooms": practice_config.get("rooms", []),
        "patients": patients,
        "appointments": appointments,
        "available_slots": available_slots[:12],
        "calls": calls,
    }


async def _handle(request: Request, path_function=None):
    if WEBHOOK_SECRET:
        provided = request.headers.get("x-webhook-secret", "")
        if not hmac.compare_digest(provided, WEBHOOK_SECRET):
            return JSONResponse(
                status_code=401,
                content={"status": "error", "message": "unauthorized"},
            )

    body = await request.json()
    try:
        tenant = get_tenant(_extract_to_number(body))
        if tenant is None:
            return {"status": "error", "message": "unknown practice for dialled number"}

        config, pms = tenant
        function = path_function or body.get("function") or body.get("name")
        if not function:
            event_args = {
                "event": body.get("event") or body.get("event_type") or body.get("type") or "call_event",
                "transcript": _extract_transcript(body),
                "summary": (body.get("call_analysis") or {}).get("call_summary") or body.get("summary"),
            }
            result = {"status": "received", "message": "Call event logged."}
            _log_call(config, body, "call_event", result, event_args)
            return result

        result = dispatch(pms, function, body.get("args") or {})
        _log_call(config, body, function, result, body.get("args") or {})
        return result
    except Exception:
        traceback.print_exc()
        return {"status": "error", "message": "Sorry, something went wrong on our side."}


@app.post("/webhook")
async def webhook(request: Request):
    return await _handle(request)


@app.post("/webhook/{function}")
async def webhook_named(function: str, request: Request):
    return await _handle(request, path_function=function)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=8080)
