/* ============================================================
   LEAD RELAY (Vercel Edge Function) — mirrors netlify/edge-functions/lead.mjs.

   The quote form posts here instead of straight to GHL. This file:
     1. keeps the webhook URL off the public page
     2. throws out bot spam before it reaches the client's CRM
     3. retries GHL, and alerts you if delivery truly fails

   Set these in Vercel: Project Settings > Environment Variables

     GHL_WEBHOOK_URL   (required)  this client's GHL inbound webhook
     ALERT_WEBHOOK_URL (optional)  YOUR own GHL workflow, for failure alerts
     CLIENT_NAME       (optional)  shows up in the alert email

   The payload field names are the contract the GHL workflow maps against.
   Do not rename them without updating the mapping on the GHL side.

   ============================================================ */

export const config = { runtime: "edge" };

const seen = new Map(); // ip -> [timestamps]  (per-instance; resets on cold start)

const RATE_LIMIT = 5;            // submissions...
const RATE_WINDOW = 10 * 60_000; // ...per 10 minutes, per IP
const MAX_BODY = 16 * 1024;      // a real lead is well under 2 KB

function rateLimited(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  hits.push(now);
  seen.set(ip, hits);
  if (seen.size > 500) seen.clear(); // crude memory guard
  return hits.length > RATE_LIMIT;
}

function looksReal(lead) {
  if (lead._gotcha) return false; // honeypot: humans never fill this
  const email = String(lead.email || "");
  const phone = String(lead.phone || "").replace(/\D/g, "");
  const name = String(lead.full_name || lead.first_name || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && phone.length < 10) return false;
  if (name.length < 2) return false;
  return true;
}

async function postJson(url, body, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const webhook = process.env.GHL_WEBHOOK_URL;
  const alertUrl = process.env.ALERT_WEBHOOK_URL;
  const client = process.env.CLIENT_NAME || "Auto Aesthetics";

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, reason: "bad_body" }, 400);
  }
  if (raw.length > MAX_BODY) return json({ ok: false, reason: "too_large" }, 413);

  let lead;
  try {
    lead = JSON.parse(raw);
  } catch {
    return json({ ok: false, reason: "bad_json" }, 400);
  }
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) {
    return json({ ok: false, reason: "bad_json" }, 400);
  }

  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";

  if (rateLimited(ip)) {
    console.warn("RATE LIMITED", ip);
    return json({ ok: true, filtered: true }); // look normal to the bot
  }

  if (!looksReal(lead)) {
    console.warn("REJECTED as spam", JSON.stringify(lead).slice(0, 300));
    return json({ ok: true, filtered: true });
  }

  delete lead._gotcha;
  lead.client_ip = ip;
  lead.relayed_at = new Date().toISOString();

  if (!webhook) {
    // Misconfigured deploy. Keep the lead recoverable from the function logs
    // instead of dropping it, then fail loudly.
    console.error("CONFIG ERROR: GHL_WEBHOOK_URL is not set");
    console.error("LEAD_DELIVERY_FAILED", client, JSON.stringify(lead));
    return json({ ok: false, reason: "not_configured" }, 500);
  }

  // Try GHL: immediate, then two retries with backoff.
  let delivered = await postJson(webhook, lead);
  for (const wait of [600, 2000]) {
    if (delivered) break;
    await new Promise((r) => setTimeout(r, wait));
    delivered = await postJson(webhook, lead);
  }

  if (delivered) return json({ ok: true });

  // Delivery failed. Log the whole lead so it is recoverable from
  // Vercel > Logs, then try to alert a human.
  console.error("LEAD_DELIVERY_FAILED", client, JSON.stringify(lead));

  if (alertUrl) {
    await postJson(alertUrl, {
      alert: "Lead delivery failed",
      client,
      site: request.headers.get("host") || "",
      lead_name: lead.full_name || lead.first_name || "",
      lead_email: lead.email || "",
      lead_phone: lead.phone || "",
      failed_at: new Date().toISOString(),
      full_lead: JSON.stringify(lead),
    });
  }

  return json({ ok: false, reason: "delivery_failed" }, 502);
}
