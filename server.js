import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const voiceBackendUrl = process.env.VOICE_BACKEND_URL || "http://127.0.0.1:8080";
const voiceWebhookSecret = process.env.VOICE_WEBHOOK_SECRET || "";
const defaultToNumber = process.env.DEFAULT_TO_NUMBER || "+441162345678";

const dashboard = {
  updatedAt: new Date().toISOString(),
  clinic: {
    name: "Dentist Clinic Dashboard",
    location: "Downtown Dental Care",
    aiAgent: "Synkris Dental AI",
    status: "Live"
  },
  stats: [
    { label: "Patients Today", value: "38", delta: "+12% vs yesterday", trend: "up", icon: "users" },
    { label: "Appointments Booked", value: "24", delta: "+6 new online", trend: "up", icon: "calendar" },
    { label: "Chair Utilization", value: "86%", delta: "4 rooms active", trend: "neutral", icon: "activity" },
    { label: "AI Resolution", value: "93%", delta: "+2.4% this week", trend: "up", icon: "sparkles" }
  ],
  activeCall: {
    patient: "Dr James Smith",
    phone: "+1 (415) 882-3047",
    reason: "Tooth pain consultation",
    timer: "02:47",
    transcript: "I can book an urgent dental exam for 11:30 AM today or 9:00 AM tomorrow. Which works better for you?",
    bookingRate: "78%",
    intentMatch: "96%",
    fallbackRate: "5%"
  },
  queue: [
    { name: "Michael Lee", wait: "0:42", reason: "Cleaning reschedule" },
    { name: "New Patient", wait: "1:16", reason: "Implant inquiry" },
    { name: "Sara Mitchell", wait: "2:03", reason: "Insurance question" }
  ],
  appointments: [
    { time: "9:00", meridiem: "AM", name: "Daniel Reeves", service: "Routine Cleaning", room: "Room 2", status: "Confirmed" },
    { time: "10:30", meridiem: "AM", name: "Priya Nair", service: "Crown Consultation", room: "Room 1", status: "Checked In" },
    { time: "12:00", meridiem: "PM", name: "Tom Larsen", service: "Root Canal Follow-up", room: "Room 3", status: "Pending" },
    { time: "2:30", meridiem: "PM", name: "Dr James Smith", service: "Emergency Exam", room: "Room 4", status: "Just Booked" },
    { time: "4:00", meridiem: "PM", name: "Wei Zhang", service: "Whitening Session", room: "Room 2", status: "Confirmed" }
  ],
  treatments: [
    { label: "Cleanings", value: 12, color: "#14b8a6" },
    { label: "Emergency", value: 7, color: "#ef4444" },
    { label: "Cosmetic", value: 6, color: "#0ea5e9" },
    { label: "Restorative", value: 9, color: "#f59e0b" },
    { label: "Consults", value: 4, color: "#64748b" }
  ],
  hourlyVolume: [8, 14, 18, 12, 22, 19, 16, 24],
  weekTrend: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    patients: [31, 34, 29, 36, 41, 38, 22],
    bookings: [18, 20, 17, 23, 26, 24, 12]
  },
  performance: [
    { label: "Missed calls recovered", value: "91%", percent: 91, color: "#14b8a6" },
    { label: "Insurance questions answered", value: "84%", percent: 84, color: "#0ea5e9" },
    { label: "Escalation accuracy", value: "97%", percent: 97, color: "#6366f1" },
    { label: "Patient sentiment", value: "4.8/5", percent: 96, color: "#f59e0b" }
  ],
  recentIntake: [
    { patient: "Mina Patel", phone: "+1 (415) 220-1309", reason: "New patient cleaning", outcome: "Booked", owner: "AI" },
    { patient: "Jason Smith", phone: "+1 (415) 665-4871", reason: "Wisdom tooth pain", outcome: "Escalated", owner: "Dr. Rivera" },
    { patient: "Nora Evans", phone: "+1 (415) 421-8890", reason: "Whitening price", outcome: "Info sent", owner: "AI" },
    { patient: "Omar Ali", phone: "+1 (415) 982-3340", reason: "Insurance coverage", outcome: "Follow-up", owner: "Front desk" }
  ]
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function fetchBackendJson(path, options = {}) {
  const response = await fetch(`${voiceBackendUrl}${path}`, {
    ...options,
    headers: {
      "Accept": "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(voiceWebhookSecret ? { "X-Webhook-Secret": voiceWebhookSecret } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
  return response.json();
}

function formatAppointmentTime(isoValue) {
  const date = new Date(isoValue);
  return {
    time: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Europe/London"
    }).replace(/\s?(AM|PM)$/i, ""),
    meridiem: date.toLocaleTimeString("en-US", {
      hour12: true,
      timeZone: "Europe/London"
    }).match(/AM|PM/i)?.[0] || ""
  };
}

function treatmentMix(snapshot) {
  const colors = ["#14b8a6", "#ef4444", "#0ea5e9", "#f59e0b", "#64748b"];
  const counts = new Map();
  for (const treatment of snapshot.treatment_types || []) counts.set(treatment.name, 0);

  for (const appointment of snapshot.appointments || []) {
    if (appointment.status !== "booked") continue;
    counts.set(appointment.treatment_name, (counts.get(appointment.treatment_name) || 0) + 1);
  }

  for (const call of snapshot.calls || []) {
    const treatment = treatmentFromCall(call, snapshot.treatment_types || []);
    if (treatment) counts.set(treatment, (counts.get(treatment) || 0) + 1);
  }

  return [...counts.entries()].slice(0, 5).map(([label, value], index) => ({
    label,
    value,
    color: colors[index]
  }));
}

function treatmentFromCall(call, treatments) {
  const args = call.args || {};
  const key = args.treatment_key;
  const fromKey = treatments.find(treatment => treatment.key === key);
  if (fromKey) return fromKey.name;

  const fullText = [
    call.transcript,
    call.function,
    call.message,
    JSON.stringify(args)
  ].filter(Boolean).join(" ").toLowerCase();

  const transcriptLines = String(call.transcript || "").toLowerCase().split(/\n+/);
  const decisiveText = transcriptLines
    .filter(line => line.includes("user:") || /book|reserve|appointment is/.test(line))
    .join(" ");

  const strongMatch = decisiveText.match(
    /\b(all booked in|booked you in|book you in|booked in|reserve|appointment is|user:)\b.{0,120}\b(scale and polish|scale|polish|teeth clean|clean|filling|fillings|emergency|emergence|urgent|pain|check-up|checkup|check up|exam|examination)\b/
  );
  const term = strongMatch?.[2] || "";
  if (/filling|fillings/.test(term)) return "Filling";
  if (/emergency|emergence|urgent|pain/.test(term)) return "Emergency Appointment";
  if (/scale|polish|clean/.test(term)) return "Scale & Polish";
  if (/check|exam|examination/.test(term)) return "Examination";

  if (/\b(filling|fillings)\b/.test(fullText)) return "Filling";
  if (/\b(emergency|urgent|pain|swelling|broken tooth)\b/.test(fullText)) return "Emergency Appointment";
  if (/\b(scale and polish|teeth clean|clean|hygien)\b/.test(fullText)) return "Scale & Polish";
  if (/\b(exam|examination|check-up|checkup|check up)\b/.test(fullText)) return "Examination";
  return null;
}

function patientNameFromCall(call) {
  const transcript = String(call.transcript || "");
  const patterns = [
    /first name is ([A-Za-z]+).*?last name is ([A-Za-z]+)/is,
    /I have:\s*- First name:\s*([A-Za-z]+)\s*- Last name:\s*([A-Za-z]+)/is,
    /My name is\s+([A-Za-z]+)\s+([A-Za-z]+)/i,
    /Thanks,\s*([A-Za-z]+)\s+([A-Za-z]+)[,.]/i,
    /Thank you,\s*([A-Za-z]+)\s+([A-Za-z]+)[,.]/i,
    /I have your last name as\s+([A-Za-z]+).*?Thanks,\s*([A-Za-z]+)/is
  ];
  for (const pattern of patterns) {
    const match = transcript.match(pattern);
    if (!match) continue;
    const name = pattern.source.includes("last name as")
      ? `${match[2]} ${match[1]}`
      : `${match[1]} ${match[2]}`;
    if (isPlausiblePatientName(name)) return titleCase(name);
  }
  const shortId = String(call.id || "").replace(/^call_/, "").slice(0, 8);
  return shortId ? `Caller ${shortId}` : "Caller";
}

function titleCase(value) {
  return String(value || "").trim().replace(/\s+/g, " ").replace(/\b[a-z]/g, char => char.toUpperCase());
}

function isPlausiblePatientName(value) {
  const words = String(value || "").trim().split(/\s+/);
  const bad = new Set(["and", "last", "first", "name", "is", "my", "please", "thanks", "thank", "mr", "mrs", "dr"]);
  return words.length >= 2
    && words.every(word => /^[A-Za-z]{2,}$/.test(word))
    && !words.some(word => bad.has(word.toLowerCase()));
}

function appointmentDateFromCall(call) {
  const transcript = String(call.transcript || "");
  const bookingText = transcript
    .split(/\n+/)
    .filter(line => /booked|book you|booked you|all booked|appointment/i.test(line))
    .join(" ");
  const text = bookingText || transcript.slice(-1200);
  const match = text.match(/\b(?:on|for|tomorrow,?)\s+(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  if (!match) return "Date from call";
  const weekday = match[1] ? `${match[1].slice(0, 3)} ` : "";
  return `${weekday}${match[2]} ${match[3].slice(0, 3)}`;
}

function appointmentTimeFromCall(call) {
  const transcript = String(call.transcript || "");
  const bookingLines = transcript
    .split(/\n+/)
    .filter(line => /booked|book you|booked you|all booked|appointment/i.test(line));
  const candidates = bookingLines.length ? bookingLines : [transcript.slice(-1400)];
  const timeRegex = /\b(?:at|for)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|in the morning|in the afternoon)?\b/ig;

  for (const text of candidates.reverse()) {
    const matches = [...String(text).matchAll(timeRegex)];
    const match = matches[matches.length - 1];
    if (!match) continue;
    const hour = Number(match[1]);
    if (hour < 1 || hour > 12) continue;
    const minute = match[2] || "00";
    const meridiemText = (match[3] || "").toLowerCase();
    const meridiem = meridiemText.includes("pm") || meridiemText.includes("afternoon") || (!meridiemText && hour === 12) ? "PM" : "AM";
    return { time: `${hour}:${minute.padStart(2, "0")}`, meridiem };
  }
  return { time: "--", meridiem: "" };
}

function scheduleMinutes(item) {
  if (!item || item.time === "--") return Number.MAX_SAFE_INTEGER;
  const [hourValue, minuteValue = "0"] = String(item.time).split(":");
  let hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (item.meridiem === "PM" && hour < 12) hour += 12;
  if (item.meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function callPatientRecord(call, snapshot) {
  const appointment = appointmentFromCall(call, 0, snapshot);
  const treatment = appointment?.service || treatmentFromCall(call, snapshot.treatment_types || []) || call.function || "Patient call";
  const callDate = call.created_at || call.started_at;
  return {
    patient: appointment?.name || patientNameFromCall(call),
    phone: call.from_number || call.to_number || snapshot.practice?.phone || "Unknown",
    reason: treatment,
    outcome: call.status || "Logged",
    owner: call.booking_id ? "Supabase booking" : "Supabase call log",
    source: "Backend",
    callId: call.id,
    transcript: call.transcript || "",
    recordingUrl: call.recording_url || "",
    lastContact: callDate ? new Date(callDate).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }) : ""
  };
}

function appointmentFromCall(call, index, snapshot) {
  if (!/book|rescheduled/.test(String(call.status || ""))) return null;
  const transcript = String(call.transcript || "");
  const treatment = treatmentFromCall(call, snapshot.treatment_types || []) || "Appointment";
  const when = appointmentTimeFromCall(call);
  const practitioner = transcript.match(/with\s+(Dr\.?\s+[A-Za-z]+\s+[A-Za-z]+)/i)?.[1] || "Dr. Jane Smith";
  const rooms = snapshot.rooms || [];
  return {
    time: when.time,
    meridiem: when.meridiem,
    date: appointmentDateFromCall(call),
    name: patientNameFromCall(call),
    service: treatment,
    room: practitioner.replace("Dr ", "Dr. "),
    status: "Call Booked",
    source: "Supabase",
    callId: call.id,
    transcript: call.transcript || "",
    recordingUrl: call.recording_url || "",
    confidence: when.time === "--" ? "Needs review" : "Confirmed in transcript"
  };
}

function buildLiveDashboard(snapshot) {
  const booked = (snapshot.appointments || []).filter(item => item.status === "booked");
  const availableSlots = snapshot.available_slots || [];
  const calls = (snapshot.calls || []).slice().reverse();
  const latestCall = calls[0];
  const nextSlot = availableSlots[0];
  const latestAppointment = booked[booked.length - 1];
  const roomCount = (snapshot.rooms || []).length;
  const bookedAppointments = booked.map((item, index) => {
    const when = formatAppointmentTime(item.start);
    return {
      ...when,
      name: item.patient_name,
      service: item.treatment_name,
      room: snapshot.rooms?.[index % Math.max(roomCount, 1)]?.name || "Surgery",
      status: "Backend Booked"
    };
  });
  const callAppointments = calls
    .map((call, index) => appointmentFromCall(call, index, snapshot))
    .filter(Boolean)
    .sort((left, right) => scheduleMinutes(left) - scheduleMinutes(right));
  const scheduleAppointments = bookedAppointments.length ? bookedAppointments : callAppointments;
  const nextSchedule = scheduleAppointments[0];
  const lastSchedule = scheduleAppointments[scheduleAppointments.length - 1];
  const pmsPatientRecords = (snapshot.patients || []).map(patient => ({
    patient: `${patient.first_name} ${patient.last_name}`,
    phone: patient.phone,
    reason: patient.upcoming?.[0]?.treatment_name || "Backend patient",
    outcome: patient.upcoming?.length ? "Booked" : "Created",
    owner: "Mock PMS",
    source: "PMS",
    callId: "",
    transcript: "",
    recordingUrl: "",
    lastContact: ""
  }));
  const callPatientRecords = calls
    .slice()
    .reverse()
    .filter(call => call.transcript || call.status || call.function)
    .map(call => callPatientRecord(call, snapshot));
  const recentIntake = [...pmsPatientRecords, ...callPatientRecords].slice(0, 12);
  const patientCount = recentIntake.length || (snapshot.patients || []).length;

  return {
    updatedAt: new Date().toISOString(),
    clinic: {
      name: "Dentist Clinic Dashboard",
      location: snapshot.practice?.name || "Backend practice",
      aiAgent: "SynVoiceAgent Backend",
      status: "Backend Live"
    },
    stats: [
      { label: "Backend Patients", value: String(patientCount), delta: "Stored in mock PMS", trend: "neutral", icon: "users" },
      { label: "Backend Bookings", value: String(booked.length), delta: `${availableSlots.length} open slots`, trend: "up", icon: "calendar" },
      { label: "Rooms Configured", value: String(roomCount), delta: `${snapshot.practitioners?.length || 0} practitioners`, trend: "neutral", icon: "activity" },
      { label: "Webhook Status", value: "OK", delta: "FastAPI connected", trend: "up", icon: "sparkles" }
    ],
    activeCall: {
      patient: latestAppointment?.patient_name || latestCall?.function || "Live Backend",
      phone: latestAppointment?.patient_phone || latestCall?.from_number || snapshot.practice?.phone || "",
      reason: latestAppointment?.treatment_name || latestCall?.function || nextSlot?.treatment_name || "Availability check",
      timer: "LIVE",
      transcript: latestCall
        ? `Backend handled ${latestCall.function} with status ${latestCall.status}.`
        : nextSlot
        ? `Next backend slot is ${nextSlot.start} with ${nextSlot.practitioner_name}.`
        : "No backend slots are currently available for the selected window.",
      bookingRate: booked.length ? "100%" : "0%",
      intentMatch: "Live",
      fallbackRate: "0%"
    },
    queue: (calls.length ? calls.slice(0, 3).map((call, index) => ({
      name: call.function,
      wait: `Call ${index + 1}`,
      reason: call.status
    })) : availableSlots.slice(0, 3).map((slot, index) => ({
      name: slot.practitioner_name,
      wait: `Slot ${index + 1}`,
      reason: slot.treatment_name
    }))),
    appointments: scheduleAppointments.length ? scheduleAppointments : [
      { time: "--", meridiem: "", name: "No backend bookings yet", service: "Use New Booking to create one", room: "Backend", status: "Open" }
    ],
    scheduleSummary: {
      count: scheduleAppointments.length,
      first: nextSchedule || null,
      last: lastSchedule || null,
      openSlots: availableSlots.length,
      source: bookedAppointments.length ? "Mock PMS appointments" : "Supabase call transcripts"
    },
    treatments: treatmentMix(snapshot),
    hourlyVolume: [patientCount, booked.length, availableSlots.length, roomCount, booked.length + 1, availableSlots.length + 2, patientCount + booked.length, Math.max(1, availableSlots.length)],
    weekTrend: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      patients: [patientCount, patientCount, patientCount, patientCount, patientCount, patientCount, patientCount],
      bookings: [booked.length, booked.length, booked.length, booked.length, booked.length, booked.length, booked.length]
    },
    performance: [
      { label: "Backend health", value: "Online", percent: 100, color: "#14b8a6" },
      { label: "Webhook routing", value: "Ready", percent: 100, color: "#0ea5e9" },
      { label: "Mock PMS storage", value: `${booked.length} bookings`, percent: Math.min(100, booked.length * 20), color: "#6366f1" },
      { label: "Available slots", value: String(availableSlots.length), percent: Math.min(100, availableSlots.length * 8), color: "#f59e0b" }
    ],
    calls: calls.map(call => ({
      id: call.id,
      time: new Date(call.created_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }),
      function: call.function,
      from: call.from_number || "Dashboard",
      to: call.to_number || snapshot.practice?.phone || "",
      status: call.status,
      message: call.message || "",
      transcript: call.transcript || "",
      recordingUrl: call.recording_url || "",
      startedAt: call.started_at || "",
      endedAt: call.ended_at || ""
    })),
    recentIntake
  };
}

async function getLiveDashboard() {
  try {
    const snapshot = await fetchBackendJson("/snapshot");
    if (snapshot.status !== "ok") throw new Error(snapshot.message || "Backend snapshot unavailable");
    return buildLiveDashboard(snapshot);
  } catch (snapshotError) {
    const health = await fetchBackendJson("/health");
    const availability = await fetchBackendJson("/webhook/check_availability", {
      method: "POST",
      body: JSON.stringify({
        to_number: defaultToNumber,
        args: {
          treatment_key: "exam",
          practitioner_id: null,
          date_from: "2026-06-22",
          date_to: "2026-06-22"
        }
      })
    });
    const slots = availability.slots || [];
    return {
      ...dashboard,
      updatedAt: new Date().toISOString(),
      clinic: {
        name: "Dentist Clinic Dashboard",
        location: "Railway SynVoiceAgent",
        aiAgent: "Function webhook connected",
        status: health.status === "ok" ? "Railway Live" : "Backend Partial"
      },
      stats: [
        { label: "Webhook Health", value: health.status === "ok" ? "OK" : "ERR", delta: "Railway backend", trend: health.status === "ok" ? "up" : "down", icon: "sparkles" },
        { label: "Available Slots", value: String(slots.length), delta: "From check_availability", trend: "up", icon: "calendar" },
        { label: "Call Logs", value: "N/A", delta: "Not exposed by Railway", trend: "neutral", icon: "activity" },
        { label: "Dashboard Mode", value: "Proxy", delta: "Function calls only", trend: "neutral", icon: "users" }
      ],
      activeCall: {
        patient: "Railway Backend",
        phone: defaultToNumber,
        reason: "Function webhook",
        timer: "LIVE",
        transcript: slots[0]
          ? `Railway is reachable. Next returned slot is ${slots[0].start} with ${slots[0].practitioner_name}.`
          : "Railway is reachable, but no slots were returned for the test window.",
        bookingRate: "N/A",
        intentMatch: "Live",
        fallbackRate: "N/A"
      },
      queue: slots.slice(0, 3).map((slot, index) => ({
        name: slot.practitioner_name,
        wait: `Slot ${index + 1}`,
        reason: "Examination"
      })),
      calls: [],
      recentIntake: []
    };
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function proxyBackendJson(res, path, options = {}) {
  try {
    const response = await fetch(`${voiceBackendUrl}${path}`, {
      ...options,
      headers: {
        "Accept": "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(voiceWebhookSecret ? { "X-Webhook-Secret": voiceWebhookSecret } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    res.writeHead(response.status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(text || "{}");
  } catch (error) {
    sendJson(res, {
      status: "error",
      message: "Voice backend is not reachable",
      backendUrl: voiceBackendUrl,
      detail: error.message
    }, 502);
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);

  if (url.pathname === "/api/health") {
    sendJson(res, { ok: true, service: "dental-clinic-dashboard" });
    return;
  }

  if (url.pathname === "/api/dental-dashboard") {
    try {
      sendJson(res, await getLiveDashboard());
    } catch (error) {
      sendJson(res, {
        ...dashboard,
        updatedAt: new Date().toISOString(),
        clinic: {
          ...dashboard.clinic,
          status: "Dashboard Fallback",
          aiAgent: `Backend offline: ${error.message}`
        }
      });
    }
    return;
  }

  if (url.pathname === "/api/backend/health") {
    await proxyBackendJson(res, "/health");
    return;
  }

  if (url.pathname === "/api/backend/config") {
    await proxyBackendJson(res, "/config");
    return;
  }

  if (url.pathname === "/api/backend/snapshot") {
    await proxyBackendJson(res, "/snapshot");
    return;
  }

  if (url.pathname.startsWith("/api/backend/webhook/") && req.method === "POST") {
    const functionName = url.pathname.split("/").pop();
    const body = await readJson(req);
    await proxyBackendJson(res, `/webhook/${encodeURIComponent(functionName)}`, {
      method: "POST",
      body: JSON.stringify({
        to_number: body.to_number || defaultToNumber,
        from_number: body.from_number,
        call_id: body.call_id,
        args: body.args || {}
      })
    });
    return;
  }

  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    sendJson(res, { error: "Not found" }, 404);
  }
}).listen(port, host, () => {
  console.log(`Dental clinic dashboard running at http://${host}:${port}`);
});
