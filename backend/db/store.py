import json
import os
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CALL_LOGS_TABLE = os.environ.get("SUPABASE_CALL_LOGS_TABLE", "call_logs")


def configured():
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def _headers(prefer=None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _request(path, method="GET", payload=None, prefer=None):
    if not configured():
        raise RuntimeError("Supabase is not configured")

    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=data,
        method=method,
        headers=_headers(prefer=prefer),
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Supabase {method} {path} failed: {exc.code} {detail}") from exc


def log_call(call):
    row = {
        "retell_call_id": call["id"],
        "tenant_id": call.get("tenant_id"),
        "from_number": call.get("from_number"),
        "to_number": call.get("to_number"),
        "intent": call.get("function"),
        "outcome": call.get("status"),
        "transcript": call.get("transcript"),
        "created_at": call.get("created_at"),
    }
    return _request(
        CALL_LOGS_TABLE,
        method="POST",
        payload=row,
        prefer="resolution=merge-duplicates,return=representation",
    )


def fetch_calls(limit=25):
    query = urllib.parse.urlencode({
        "select": "*",
        "order": "created_at.desc",
        "limit": str(limit),
    })
    rows = _request(f"{CALL_LOGS_TABLE}?{query}") or []
    return [
        {
            "id": row.get("retell_call_id") or row.get("call_id") or row.get("id"),
            "created_at": row.get("created_at") or row.get("started_at"),
            "tenant_id": row.get("tenant_id"),
            "from_number": row.get("from_number"),
            "to_number": row.get("to_number"),
            "function": row.get("intent") or row.get("function_name"),
            "args": row.get("args") or {},
            "status": row.get("outcome") or row.get("status"),
            "message": row.get("message") or "",
            "transcript": row.get("transcript") or "",
            "recording_url": row.get("recording_url") or "",
            "started_at": row.get("started_at"),
            "ended_at": row.get("ended_at"),
            "booking_id": row.get("booking_id"),
        }
        for row in rows
    ]
