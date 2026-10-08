# Auto Aesthetics

Lead-generation landing page for Auto Aesthetics, a boutique cosmetic-repair workshop for luxury and exotic cars (paint correction and respray, paintless dent repair, carbon fiber restoration).

Plain static site: **no framework, no build step, no runtime dependencies.** `index.html` holds all markup, CSS and JS. Open it through any static server.

```
python3 -m http.server 4173      # then visit http://localhost:4173
```

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | The whole page. Design tokens (primitive, semantic, component) are at the top of the `<style>` block. |
| `images/` | Hero, service and shop photos as WebP, plus `og.jpg` for link previews. |
| `api/lead.js` | **Vercel** Edge Function at `/api/lead`. Validates, rate-limits and relays quote requests to GoHighLevel. |
| `netlify/edge-functions/lead.mjs` | The same relay for **Netlify** (the live site's host). Not used on Vercel. Keep the two in step. |
| `vercel.json` | Copies `index.html` and `images/` into `public/` so only those are served, and sets security headers. |
| `.claude/skills/` | Design skills used for the rebuild. Not served (`.vercelignore`). |

## Deploying on Vercel

The Vercel project is linked to this repo. Pushes to `main` deploy to production; every other branch gets a preview.

Set these in **Project Settings > Environment Variables** (Production and Preview):

| Variable | Required | Purpose |
| --- | --- | --- |
| `GHL_WEBHOOK_URL` | yes | This client's GoHighLevel inbound webhook. Never commit it. |
| `ALERT_WEBHOOK_URL` | no | A workflow of yours that is notified if delivery to GHL fails after retries. |
| `CLIENT_NAME` | no | Shown in the failure alert. |

Until `GHL_WEBHOOK_URL` is set, the function answers 500 and writes each lead to the Vercel runtime logs (`LEAD_DELIVERY_FAILED`) so none are lost. The page still shows the visitor a confirmation.

## Lead payload (the contract your GHL workflow maps against)

`funnel, full_name, first_name, email, phone, vehicle, vehicle_year, vehicle_make, vehicle_model, vehicle_trim, services_requested, notes, preferred_contact, best_time, submitted_at, source_url`

The relay adds `client_ip` and `relayed_at`. A hidden `_gotcha` field is the spam honeypot and is stripped before relaying. **Do not rename these fields** without updating the GHL mapping.

## Known follow-ups

- **Gallery images** still load from an external Supabase bucket (`qyhdrnbvvjhvjcqrdwju.supabase.co`). Download them into `images/` so the page never depends on storage you do not control.
- **Vehicle photo preview** uses imagin.studio with the shared `customer=img` demo key. Get your own key before running real traffic.
- **Vehicle dropdown data** comes from fueleconomy.gov with a 6 second timeout and a built-in make list as fallback. Do not remove the timeout.
- **`og:image`** points at the project's `vercel.app` domain. Update it when a custom domain is attached.
- **No phone, address, hours or reviews** appear on the page because none were supplied. Adding them is the largest remaining conversion gain.
