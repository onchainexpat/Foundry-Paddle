import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "dist");
const launchDir = path.join(dist, "launch");
const indexHtml = path.join(dist, "index.html");
const launchIndex = path.join(launchDir, "index.html");

const app = express();
app.use(express.json({ limit: "32kb" }));

const interestWebhookUrl =
  process.env.MAKE_INTEREST_WEBHOOK_URL ||
  "https://hook.eu1.make.com/ay8xqbengj94jw74iie1ndy116vw03ba";

const E164_MOBILE_REGEX = /^\+[1-9]\d{6,14}$/;

const interestPayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  mobile: z.preprocess(
    (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === "string" && v.trim() === "") return undefined;
      return v;
    },
    z.string().regex(E164_MOBILE_REGEX).optional(),
  ),
  source: z.enum(["home", "memberships", "contact", "book"]).optional(),
});

app.post("/api/register-interest", async (req, res) => {
  const parsed = interestPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn("[register-interest] Validation failed", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    });
    return res.status(400).json({ error: "Invalid request payload." });
  }

  try {
    const upstreamResponse = await fetch(interestWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!upstreamResponse.ok) {
      const responseText = await upstreamResponse.text();
      console.error("[register-interest] Upstream webhook failure", {
        status: upstreamResponse.status,
        bodyPreview: responseText.slice(0, 300),
      });
      return res.status(502).json({ error: "Upstream service unavailable." });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[register-interest] Unexpected error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

function requireDb(req, res, next) {
  if (!sql) {
    console.error("[events] DATABASE_URL not configured");
    return res.status(503).json({ error: "Database not configured." });
  }
  next();
}

// ---------------------------------------------------------------------------
// Public events API
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

app.get("/api/events", requireDb, async (req, res) => {
  const { date } = req.query;
  if (!date || !DATE_REGEX.test(date)) {
    return res.status(400).json({ error: "Query param 'date' required (YYYY-MM-DD)." });
  }

  try {
    const rows = await sql`
      SELECT id, title, date::text, start_time::text, end_time::text, duration_min, spots_left, total_spots
      FROM events
      WHERE date = ${date}
      ORDER BY start_time ASC
    `;
    return res.json(rows);
  } catch (error) {
    console.error("[events] Query failed", { message: error instanceof Error ? error.message : error });
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ---------------------------------------------------------------------------
// Admin auth
// ---------------------------------------------------------------------------

function requireAdmin(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: "Admin not configured." });
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || token !== adminPassword) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
}

// ---------------------------------------------------------------------------
// Admin events CRUD
// ---------------------------------------------------------------------------

const eventSchema = z.object({
  title: z.string().trim().min(1).max(500),
  date: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  duration_min: z.number().int().min(1).max(1440),
  spots_left: z.number().int().min(0).default(0),
  total_spots: z.number().int().min(0).default(0),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get("/api/admin/events", requireDb, requireAdmin, async (_req, res) => {
  try {
    const rows = await sql`
      SELECT e.id, e.title, e.date::text, e.start_time::text, e.end_time::text,
             e.duration_min, e.spots_left, e.total_spots, e.created_at, e.updated_at,
             COALESCE(s.signup_count, 0)::int AS signup_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*)::int AS signup_count
        FROM event_signups
        GROUP BY event_id
      ) s ON s.event_id = e.id
      ORDER BY e.date ASC, e.start_time ASC
    `;
    return res.json(rows);
  } catch (error) {
    console.error("[admin/events] List failed", { message: error instanceof Error ? error.message : error });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/admin/events", requireDb, requireAdmin, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed.", issues: parsed.error.issues });
  }
  const d = parsed.data;

  try {
    const rows = await sql`
      INSERT INTO events (title, date, start_time, end_time, duration_min, spots_left, total_spots)
      VALUES (${d.title}, ${d.date}, ${d.start_time}, ${d.end_time}, ${d.duration_min}, ${d.spots_left}, ${d.total_spots})
      RETURNING id, title, date::text, start_time::text, end_time::text, duration_min, spots_left, total_spots, created_at, updated_at
    `;
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error("[admin/events] Create failed", { message: error instanceof Error ? error.message : error });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.put("/api/admin/events/:id", requireDb, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: "Invalid event ID." });
  }

  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed.", issues: parsed.error.issues });
  }
  const d = parsed.data;

  try {
    const rows = await sql`
      UPDATE events
      SET title = ${d.title}, date = ${d.date}, start_time = ${d.start_time}, end_time = ${d.end_time},
          duration_min = ${d.duration_min}, spots_left = ${d.spots_left}, total_spots = ${d.total_spots},
          updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, date::text, start_time::text, end_time::text, duration_min, spots_left, total_spots, created_at, updated_at
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "Event not found." });
    }
    return res.json(rows[0]);
  } catch (error) {
    console.error("[admin/events] Update failed", { message: error instanceof Error ? error.message : error });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.delete("/api/admin/events/:id", requireDb, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: "Invalid event ID." });
  }

  try {
    const rows = await sql`
      DELETE FROM events WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) {
      return res.status(404).json({ error: "Event not found." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("[admin/events] Delete failed", { message: error instanceof Error ? error.message : error });
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ---------------------------------------------------------------------------
// Public signup endpoint
// ---------------------------------------------------------------------------

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  mobile: z.preprocess(
    (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === "string" && v.trim() === "") return undefined;
      return v;
    },
    z.string().regex(E164_MOBILE_REGEX).optional(),
  ),
});

app.post("/api/events/:id/signup", requireDb, async (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: "Invalid event ID." });
  }

  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed.", issues: parsed.error.issues });
  }
  const { name, email, mobile } = parsed.data;

  try {
    const events = await sql`
      SELECT id, spots_left FROM events WHERE id = ${id}
    `;
    if (events.length === 0) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (events[0].spots_left <= 0) {
      return res.status(409).json({ error: "No spots left for this event." });
    }

    await sql`
      INSERT INTO event_signups (event_id, name, email, mobile)
      VALUES (${id}, ${name}, ${email}, ${mobile ?? null})
    `;

    await sql`
      UPDATE events SET spots_left = spots_left - 1 WHERE id = ${id} AND spots_left > 0
    `;

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("[signup] Failed", { message: error instanceof Error ? error.message : error });
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ---------------------------------------------------------------------------
// Admin signups endpoint
// ---------------------------------------------------------------------------

app.get("/api/admin/events/:id/signups", requireDb, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: "Invalid event ID." });
  }

  try {
    const rows = await sql`
      SELECT id, name, email, mobile, created_at
      FROM event_signups
      WHERE event_id = ${id}
      ORDER BY created_at ASC
    `;
    return res.json(rows);
  } catch (error) {
    console.error("[admin/signups] Query failed", { message: error instanceof Error ? error.message : error });
    return res.status(500).json({ error: "Internal server error." });
  }
});

// Legacy URLs: /fullsite and /fullsite/* -> / and /*
app.use((req, res, next) => {
  const p = req.path;
  if (!p.startsWith("/fullsite")) return next();
  const after = p === "/fullsite" ? "" : p.slice("/fullsite".length);
  const pathOnly =
    after === "" || after === "/" ? "/" : after.startsWith("/") ? after : `/${after}`;
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(301, pathOnly + qs);
});

// Serves fullsite at / (e.g. /assets/...) and holding files under /launch/...
app.use(express.static(dist, { index: false }));

function sendLaunchSpa(res) {
  if (!existsSync(launchIndex)) {
    console.error("Holding page not built: missing dist/launch/index.html (run npm run build:railway)");
    return res
      .status(503)
      .type("text/plain")
      .send("Holding page not deployed. Ensure build command is: npm run build:railway");
  }
  res.sendFile(launchIndex);
}

// Holding SPA: /launch and client routes under /launch/*
app.get(/^\/launch(\/.*)?$/, (req, res, next) => {
  if (path.extname(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  sendLaunchSpa(res);
});

// Main site SPA fallback
app.get("*", (req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  if (!existsSync(indexHtml)) {
    console.error("Main site not built: missing dist/index.html (run npm run build:railway)");
    return res
      .status(503)
      .type("text/plain")
      .send("Main site not deployed. Ensure build command is: npm run build:railway");
  }
  res.sendFile(indexHtml);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serving at http://localhost:${port}`);
  console.log(`  /         -> full marketing site`);
  console.log(`  /launch   -> holding / launch page`);
});
