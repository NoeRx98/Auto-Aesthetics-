# Quote form → GHL: field contract

The new design (`combined.template.html`) posts the same JSON to `/api/lead` as the live `index.html`. The relay (`api/lead.js`, `netlify/edge-functions/lead.mjs`) forwards every key, drops `_gotcha`, and adds `client_ip` and `relayed_at`.

## Unchanged (the GHL workflow already maps these)

| Key | Values sent |
|---|---|
| `funnel` | `Auto Aesthetics` |
| `full_name`, `first_name` | as typed; first word of the name |
| `email`, `phone` | as typed (one of the two is required) |
| `vehicle` | `"<year> <make> <model>"` |
| `vehicle_year` | `1995`–`2027` |
| `vehicle_make`, `vehicle_model`, `vehicle_trim` | as typed or picked; trim may be empty |
| `services_requested` | comma-joined, any of: `Showroom paint / custom paint`, `Carbon fiber restoration`, `Paintless dent repair`, `Not sure — assess it` (em dash) |
| `notes` | free text |
| `preferred_contact` | comma-joined, any of: `email`, `text`, `call` |
| `best_time` | one of: `Weekday mornings`, `Weekday afternoons`, `Weekday evenings`, `Weekends`, `Any time — just reach me` (em dash) |
| `submitted_at` | e.g. `10/15/26, 9:33:06 AM CT` (America/Chicago) |
| `source_url` | full page URL, including UTM parameters |

## New (create a custom field for each in GHL, then map it)

| Key | Values | Use |
|---|---|---|
| `vehicle_vin` | 17 characters, or empty | exact vehicle |
| `terms_consent` | `Yes` / `No` | agreed to the Privacy Policy and Terms |
| `sms_service_consent` | `Yes` / `No` | may receive texts about this request |
| `sms_marketing_consent` | `Yes` / `No` | may receive marketing texts |
| `consent_text_version` | e.g. `aa-consent-2026-10-15` | which consent wording the person saw |
| `consent_at` | ISO time, UTC, e.g. `2026-10-15T14:33:06.216Z` | when they consented |

Rules for the automations:
- Only add a contact to a marketing text workflow when `sms_marketing_consent` is `Yes`.
- None of the boxes is required to submit. Never make SMS consent required (A2P 10DLC).
- Change the consent wording only together with a new `consent_text_version`.

## Before the texting automations go live

1. Publish the Privacy Policy and Terms pages, then set `privacy_url` and `terms_url` in `CONFIG` in the page script.
2. Set `business_legal_name` in `CONFIG`. It must match the EIN document, because carriers check it against the A2P registration.
3. Create the six custom fields above and map them in the inbound-webhook workflow.

## Vehicle data

- **Makes:** the same curated list as the live page. Typing any other make is allowed.
- **Models:** NHTSA vPIC `GetModelsForMakeYear`. It's free, needs no API key, and covers every make and model sold in the US. It replaces fueleconomy.gov, which only lists vehicles with EPA fuel ratings and misses many exotics.
- **Trims:** no free source has a complete US trim list. The fueleconomy.gov "options" the live page shows as trims are engine and transmission strings (for example `Auto (AM-S9), 6 cyl, 3.0 L, Turbo`), not trims, so they're dropped here. Exact trims come from the optional VIN lookup (vPIC `DecodeVinValues`). If a full trim dropdown matters, the paid option is CarAPI (about $199/yr, server-side only). It would need a `/api/vehicles` proxy and a `CARAPI_TOKEN` / `CARAPI_SECRET` in Vercel; never put the key in the page.
- **Not yet tested from a browser:** the build session's network blocked vPIC. Test the model list and the VIN lookup on the Vercel preview before launch. If vPIC is down or slow, the 6-second timeout falls back to typing.
