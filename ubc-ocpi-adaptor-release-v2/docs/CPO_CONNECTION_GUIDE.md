# CPO Connection Guide — Beginner to Production

This guide walks you through connecting a **Charge Point Operator (CPO)** to the UBC OCPI Adaptor step by step. After following it you will have a working OCPI 2.2.1 handshake and the adaptor will start syncing locations, tariffs, and tokens with your CPO.

---

## What Is the OCPI Handshake?

OCPI (Open Charge Point Interface) is a protocol that allows an EMSP (like this adaptor) and a CPO to exchange data — locations of chargers, user tokens, active sessions, and billing records. Before any of that can happen, both sides must exchange **credentials** (API tokens) so they can authenticate each other's requests. This is called the **OCPI Handshake**.

```
CPO                        UBC OCPI Adaptor (EMSP)
 |                                  |
 |  1. CPO gives you: token, url    |
 |--------------------------------->|  (you call register API)
 |                                  |
 |  2. Adaptor fetches versions     |
 |<---------------------------------|  GET /versions
 |                                  |
 |  3. Adaptor fetches endpoints    |
 |<---------------------------------|  GET /versions/2.2.1/details
 |                                  |
 |  4. Adaptor sends its credentials|
 |<---------------------------------|  POST /credentials
 |                                  |
 |  5. CPO updates its token → DONE |
```

---

## Prerequisites

Before you start, make sure you have:

1. **The adaptor is running** — see `docs/SETUP.md`
2. **Postman or curl** installed
3. The following information from your CPO:
   - `cpo_auth_token` — the token the CPO gave you to call their API
   - `cpo_versions_url` — the URL of the CPO's OCPI versions endpoint (e.g., `https://cpo.example.com/ocpi/versions`)
   - `cpo_party_id` — the CPO's party identifier (e.g., `TPC`)
   - `cpo_country_code` — the CPO's country code (e.g., `IN`)
   - `cpo_name` — a human-readable name for this CPO (e.g., `TPC Charging`)

---

## Step 1 — Register the CPO (Single API Call)

This single API call does everything: creates the CPO partner record, fetches their OCPI versions and endpoints, and stores it all in the database. It also creates an EMSP partner record for the adaptor itself on the first registration.

**Endpoint:** `POST /api/admin/ocpi/register`

**Base URL:** `http://localhost:6001` (or your deployment URL)

### Request

```http
POST /api/admin/ocpi/register
Content-Type: application/json
```

```json
{
  "cpo_auth_token": "Token your-cpo-gave-you-abc123",
  "cpo_versions_url": "https://cpo.example.com/ocpi/versions",
  "cpo_party_id": "TPC",
  "cpo_country_code": "IN",
  "cpo_name": "TPC Charging Network",

  "emsp_ocpi_host": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in",
  "emsp_party_id": "EMSP",
  "emsp_country_code": "IN",
  "emsp_name": "UBC EMSP Adaptor"
}
```

**Field Descriptions:**

| Field | Required | Description |
|-------|----------|-------------|
| `cpo_auth_token` | ✅ Yes | The token your CPO gave you. Must start with `Token ` or be the raw token string. |
| `cpo_versions_url` | ✅ Yes | The URL to call to get the list of OCPI versions the CPO supports. |
| `cpo_party_id` | ✅ Yes | Short party identifier for the CPO (2–4 letters). |
| `cpo_country_code` | ✅ Yes | ISO 3166-1 alpha-2 code (e.g., `IN` for India). |
| `cpo_name` | ✅ Yes | Human-readable name for the CPO. |
| `emsp_ocpi_host` | ✅ First time | The public base URL of this adaptor. The CPO will use this to call back into the adaptor. |
| `emsp_party_id` | Optional | Defaults to `EMSP`. |
| `emsp_country_code` | Optional | Defaults to `IN`. |
| `emsp_name` | Optional | Defaults to `EMSP PARTNER`. |
| `emsp_auth_token` | Optional | If omitted, a random UUID token is auto-generated. This is the token the CPO must use when calling the adaptor's OCPI endpoints. |

### Successful Response

```json
{
  "status_code": 1000,
  "timestamp": "2026-07-01T06:00:00.000Z",
  "data": {
    "cpo_partner": {
      "id": "30bec697-88f4-4f26-a31c-07208127abda",
      "name": "TPC Charging Network",
      "country_code": "IN",
      "party_id": "TPC",
      "role": "CPO",
      "status": "INIT",
      "versions_url": "https://cpo.example.com/ocpi/versions"
    },
    "cpo_credentials": {
      "id": "...",
      "partner_id": "30bec697-88f4-4f26-a31c-07208127abda",
      "cpo_auth_token": "Token your-cpo-gave-you-abc123",
      "emsp_auth_token": "auto-generated-uuid-token"
    },
    "cpo_versions": [
      { "version": "2.2.1", "url": "https://cpo.example.com/ocpi/2.2.1/details" }
    ],
    "cpo_version_details": {
      "version": "2.2.1",
      "endpoints": [
        { "identifier": "credentials", "role": "SENDER", "url": "https://cpo.example.com/ocpi/2.2.1/credentials" },
        { "identifier": "locations", "role": "SENDER", "url": "https://cpo.example.com/ocpi/2.2.1/locations" },
        { "identifier": "tariffs", "role": "SENDER", "url": "https://cpo.example.com/ocpi/2.2.1/tariffs" }
      ]
    },
    "emsp_partner": { ... },
    "emsp_endpoints": [ ... ],
    "emsp_versions_url": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/ocpi/versions"
  }
}
```

> **Important:** Save the `cpo_partner.id` value from the response. You will need it for the next step (sending credentials to the CPO).

---

## Step 2 — Send Your Credentials to the CPO

After registration, the adaptor knows the CPO's endpoints. Now you need to tell the CPO who the adaptor is by sending the adaptor's own credentials to the CPO.

**Endpoint:** `POST /api/admin/ocpi/credentials`

```http
POST /api/admin/ocpi/credentials
Content-Type: application/json
```

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda",
  "token": "auto-generated-uuid-token",
  "url": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/ocpi/versions",
  "roles": [
    {
      "role": "EMSP",
      "party_id": "EMSP",
      "country_code": "IN",
      "business_details": {
        "name": "UBC EMSP Adaptor"
      }
    }
  ]
}
```

**Field Descriptions:**

| Field | Description |
|-------|-------------|
| `partner_id` | The `cpo_partner.id` from Step 1. |
| `token` | The `emsp_auth_token` from the `cpo_credentials` block in Step 1. This is the token the CPO will use to authenticate itself when calling the adaptor's OCPI endpoints. |
| `url` | The adaptor's public OCPI versions URL (same as `emsp_ocpi_host + /ocpi/versions`). |
| `roles` | An array describing the adaptor's identity. Always `EMSP`. |

### Successful Response

The CPO will return its new updated token in the response body. The adaptor automatically saves this new CPO token in the database and updates the partner status to `ACTIVE`.

```json
{
  "status_code": 1000,
  "data": {
    "status_code": 1000,
    "data": {
      "token": "new-cpo-token-after-handshake",
      "url": "https://cpo.example.com/ocpi/versions",
      "roles": [
        { "role": "CPO", "party_id": "TPC", "country_code": "IN" }
      ]
    }
  }
}
```

---

## Step 3 — Verify the Connection

Check that the partner status has changed to `ACTIVE` by reading the CPO's credentials back.

**Endpoint:** `GET /api/admin/ocpi/credentials?partner_id=<id>`

```http
GET /api/admin/ocpi/credentials?partner_id=30bec697-88f4-4f26-a31c-07208127abda
```

---

## Step 4 — Configure the CPO's Side

Share these details with the CPO team so they can add your adaptor's token to their allowlist:

| Item | Value |
|------|-------|
| **EMSP Auth Token** | The `emsp_auth_token` from Step 1 |
| **EMSP OCPI Versions URL** | `https://<your-host>/ocpi/versions` |
| **EMSP Version Details URL** | `https://<your-host>/ocpi/versions/2.2.1/details` |
| **EMSP Credentials URL** | `https://<your-host>/ocpi/2.2.1/credentials` |

The CPO must send this token in all HTTP requests as:
```
Authorization: Token <emsp_auth_token>
```

---

## OCPI Endpoints Exposed by the Adaptor (CPO → EMSP)

These are the endpoints the CPO can call on the adaptor. All require the `Authorization: Token <emsp_auth_token>` header.

| Module | Method | Path | Purpose |
|--------|--------|------|---------|
| Versions | GET | `/ocpi/versions` | List supported OCPI versions |
| Versions | GET | `/ocpi/versions/2.2.1/details` | List all endpoints and their URLs |
| Credentials | GET | `/ocpi/2.2.1/credentials` | Get adaptor's credentials |
| Credentials | POST | `/ocpi/2.2.1/credentials` | Register / update credentials |
| Credentials | PUT | `/ocpi/2.2.1/credentials` | Full update of credentials |
| Locations | GET | `/ocpi/2.2.1/locations` | List all locations |
| Locations | PUT | `/ocpi/2.2.1/locations/:cc/:party/:loc_id` | CPO pushes a location |
| Locations | PATCH | `/ocpi/2.2.1/locations/:cc/:party/:loc_id` | CPO updates a location |
| Tariffs | GET | `/ocpi/2.2.1/tariffs` | List all tariffs |
| Tokens | GET | `/ocpi/2.2.1/tokens` | List all user tokens |
| Tokens | PUT | `/ocpi/2.2.1/tokens/:cc/:party/:uid` | Push a token |
| Sessions | GET | `/ocpi/2.2.1/sessions` | List charging sessions |
| Sessions | PUT | `/ocpi/2.2.1/sessions/:cc/:party/:id` | CPO updates a session |
| Sessions | PATCH | `/ocpi/2.2.1/sessions/:cc/:party/:id` | CPO patches a session |
| CDRs | POST | `/ocpi/2.2.1/cdrs` | CPO sends a Charge Detail Record |
| Commands | POST | `/ocpi/2.2.1/commands/:type/:id` | CPO responds to a command |

---

## Optional — Enable Test Mode for a Partner

If the CPO does not have a working backend during UAT, you can enable `test_mode` on the partner. In test mode:
- The adaptor bypasses the real `StartCharging` command to the CPO.
- A synthetic session lifecycle runs automatically, completing after about 2 minutes.
- This lets the full Beckn flow (select → init → confirm → update → rating) run end-to-end without a real charger.

To enable test mode, update the partner's `additional_props` in the database:

```sql
UPDATE "OCPIPartner"
SET additional_props = jsonb_set(
  COALESCE(additional_props, '{}'),
  '{test_mode}',
  'true'
)
WHERE id = '30bec697-88f4-4f26-a31c-07208127abda';
```

---

## Troubleshooting

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `401 Unauthorized` | Wrong `cpo_auth_token` | Double-check the token provided by the CPO |
| `Partner not found` | Wrong `partner_id` | Use the UUID from the register response |
| `Credentials endpoint not found` | CPO version details not synced | Re-run the register API |
| CPO rejects credentials | Wrong `emsp_auth_token` or URL | Ensure the token in Step 2 matches what CPO received |
| `Failed to fetch versions` | CPO URL is unreachable | Check if the CPO server is reachable from the adaptor |
