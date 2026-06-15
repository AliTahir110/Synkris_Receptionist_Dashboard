# Dental Clinic Dashboard + SynVoiceAgent Backend

A Synkris-branded dental clinic dashboard with a Node dashboard server and a SynVoiceAgent-style FastAPI backend.

## Run the Dashboard

```bash
npm start
```

Open `http://localhost:3000`.

The dashboard currently fetches live demo data from:

```text
GET /api/dental-dashboard
```

## Run the Voice-Agent Backend

Install the Python dependencies once:

```bash
python3 -m pip install -r backend/requirements.txt
```

Start the SynVoiceAgent backend:

```bash
npm run backend
```

It serves on `http://127.0.0.1:8080` with:

```text
GET /health
POST /webhook
POST /webhook/{function}
```

The local backend defaults to the bundled mock PMS and seed practice config in `backend/seed_config.json`, keyed by `+441162345678`.

Optional Supabase call-log persistence:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Run [backend/db/schema.sql](/Users/mohdalitahir/Documents/Ai agent Dashboard/backend/db/schema.sql) once in the Supabase SQL editor to create the `call_logs` table. Do not commit service-role keys.

Supported webhook functions:

```text
check_availability
book_appointment
lookup_patient
cancel_appointment
reschedule_appointment
```

Run smoke tests:

```bash
npm run backend:test
```
