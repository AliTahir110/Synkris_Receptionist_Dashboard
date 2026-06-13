import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

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
    patient: "Ayesha Khan",
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
    { time: "2:30", meridiem: "PM", name: "Ayesha Khan", service: "Emergency Exam", room: "Room 4", status: "Just Booked" },
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

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);

  if (url.pathname === "/api/health") {
    sendJson(res, { ok: true, service: "dental-clinic-dashboard" });
    return;
  }

  if (url.pathname === "/api/dental-dashboard") {
    sendJson(res, { ...dashboard, updatedAt: new Date().toISOString() });
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
