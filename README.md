# Dental Clinic Dashboard

A Synkris-branded dental clinic dashboard with a small Node backend.

## Run

```bash
npm start
```

Open `http://localhost:3000`.

## Backend Endpoint

The dashboard currently fetches live data from:

```text
GET /api/dental-dashboard
```

Replace the demo payload in `server.js` with your database, CRM, dental practice management system, or AI receptionist data source. The health check is available at:

```text
GET /api/health
```
