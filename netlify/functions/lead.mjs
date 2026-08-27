/* ============================================================
   LEAD RELAY — runs on Netlify's servers, not in the browser.

   The form posts here instead of straight to GHL. This file:
     1. keeps the webhook URL off the public page
     2. throws out bot spam before it reaches the client's CRM
     3. retries GHL, and alerts you if delivery truly fails

   Set these in Netlify:
     Site configuration > Environment variables

     GHL_WEBHOOK_URL   (required)  this client's GHL inbound webhook
     ALERT_WEBHOOK_URL (optional)  YOUR own GHL workflow, for failure alerts
     CLIENT_NAME       (optional)  shows up in the alert email
   ============================================================ */

const seen = new Map(); // ip -> [timestamps]  (resets when the function goes cold)

const RATE_LIMIT = 5;            // submissions...
const RATE_WINDOW = 10 * 60_000; // ...per 10 minutes, per IP

function rateLimited(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter(t => now - t < RATE_WINDOW);
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
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return false;
  if (phone.length < 10) return false;
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
      signal: ctrl.signal
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhook = Netlify.env.get("GHL_WEBHOOK_URL");
  const alertUrl = Netlify.env.get("ALERT_WEBHOOK_URL");
  const client = Netlify.env.get("CLIENT_NAME") || "unnamed site";

  if (!webhook) {
    console.error("CONFIG ERROR: GHL_WEBHOOK_URL is not set");
    return Response.json({ ok: false, reason: "not_configured" }, { status: 500 });
  }

  let lead;
  try {
    lead = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "bad_json" }, { status: 400 });
  }

  const ip = context.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";

  if (rateLimited(ip)) {
    console.warn("RATE LIMITED", ip);
    return Response.json({ ok: true, filtered: true }); // look normal to the bot
  }

  if (!looksReal(lead)) {
    console.warn("REJECTED as spam", JSON.stringify(lead).slice(0, 300));
    return Response.json({ ok: true, filtered: true });
  }

  delete lead._gotcha;
  lead.client_ip = ip;
  lead.relayed_at = new Date().toISOString();

  // Try GHL: immediate, then two retries with backoff.
  let delivered = await postJson(webhook, lead);
  for (let wait of [600, 2000]) {
    if (delivered) break;
    await new Promise(r => setTimeout(r, wait));
    delivered = await postJson(webhook, lead);
  }

  if (delivered) return Response.json({ ok: true });

  // Delivery failed. Log the whole lead so it is recoverable from
  // Netlify > Logs > Functions, then try to alert a human.
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
      full_lead: JSON.stringify(lead)
    });
  }

  // The page shows the customer success regardless — losing the lead is
  // bad, but telling them to try again loses them for good.
  return Response.json({ ok: false, reason: "delivery_failed" }, { status: 502 });
};

export const config = { path: "/api/lead" };
