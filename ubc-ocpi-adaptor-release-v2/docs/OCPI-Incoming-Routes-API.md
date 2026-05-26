# OCPI Incoming Routes API Reference

This document describes every HTTP API exposed by **`src/ocpi/ocpi-incoming-routes.ts`**.

These are **incoming OCPI 2.2.1 endpoints** on the **EMSP (receiver)** side: a **CPO** calls this adaptor to push or query data. The adaptor persists data in PostgreSQL and, where noted, triggers **UBC / Beckn** flows (catalog, charging, tracking).

---

## 1. Overview

| Item | Value |
|------|--------|
| **Source file** | `src/ocpi/ocpi-incoming-routes.ts` |
| **Mount path** | `/ocpi` (see `src/index.ts`) |
| **OCPI version** | **2.2.1** (module paths use `/2.2.1/...`) |
| **Role** | **EMSP receiver** — CPO → this service |
| **Related (outgoing)** | `/ocpi/cpo/*` — this EMSP calling CPO (`ocpi-outgoing-routes.ts`) |

### Request flow

```text
CPO  --Authorization: Token <emsp_auth_token>-->  POST/GET/PUT/PATCH/DELETE /ocpi/...
                                                      |
                                                      v
                                            ocpiAuth middleware
                                            (validate token, attach partner)
                                                      |
                                                      v
                                            Module handler (credentials, locations, ...)
                                                      |
                                                      v
                                            OCPI JSON envelope response
```

---

## 2. Authentication & headers

All routes use the **`ocpiAuth`** middleware.

### Required header

```http
Authorization: Token <emsp_auth_token>
```

- Also accepts `Bearer <token>`.
- Token may be sent **base64-encoded**; the adaptor tries decode + raw token lookup.

### Optional headers (recommended)

| Header | Purpose |
|--------|---------|
| `X-Correlation-Id` | Trace id across services (auto-generated if missing) |
| `X-Request-Id` | Per-request id (auto-generated if missing) |
| `Content-Type` | `application/json` for bodies |

### Auth failure response (401)

```json
{
  "status_code": 2001,
  "status_message": "Unauthorized",
  "timestamp": "2026-05-22T14:27:24.900Z"
}
```

On success, **`req.ocpiPartnerCredentials`** is set (partner id, tokens, etc.) for downstream handlers.

---

## 3. Standard OCPI response envelope

Successful module responses typically use:

```json
{
  "data": { },
  "status_code": 1000,
  "status_message": "Success",
  "timestamp": "2026-05-22T14:27:24.900Z"
}
```

| `status_code` | Meaning (common) |
|---------------|------------------|
| `1000` | Success |
| `2000` | Client error (invalid payload / params) |
| `2001` | Not found / unauthorized |
| `3000` | Server error |

List endpoints may return **`data` as an array** and support pagination via query params (`offset`, `limit`, `date_from`, `date_to`).

---

## 4. API catalog (quick reference)

Base URL: **`{host}/ocpi`**

| # | Method | Path | Who calls | Primary purpose |
|---|--------|------|-----------|-----------------|
| 1 | GET | `/versions` | CPO | Discover supported OCPI versions |
| 2 | GET | `/versions/2.2.1/details` | CPO | Version details + module endpoints |
| 3 | POST | `/2.2.1/credentials` | CPO | Register / exchange credentials |
| 4 | GET | `/2.2.1/credentials` | CPO | Read EMSP credentials |
| 5 | PUT | `/2.2.1/credentials` | CPO | Replace credentials |
| 6 | PATCH | `/2.2.1/credentials` | CPO | Partial credentials update |
| 7 | GET | `/2.2.1/tokens` | CPO | List tokens (optional filters) |
| 8 | GET | `/2.2.1/tokens/{cc}/{pid}/{uid}` | CPO | Get one token |
| 9 | PUT | `/2.2.1/tokens/{cc}/{pid}/{uid}` | CPO | Create/replace token |
| 10 | PATCH | `/2.2.1/tokens/{cc}/{pid}/{uid}` | CPO | Update token |
| 11 | POST | `/2.2.1/tokens/{cc}/{pid}/{uid}/authorize` | CPO | Authorize token at location |
| 12 | GET | `/2.2.1/sessions` | CPO | List sessions |
| 13 | GET | `/2.2.1/sessions/{cc}/{pid}/{id}` | CPO | Get session |
| 14 | PUT | `/2.2.1/sessions/{cc}/{pid}/{id}` | CPO | Create/replace session → **UBC track / auto cutoff** |
| 15 | PATCH | `/2.2.1/sessions/{cc}/{pid}/{id}` | CPO | Update session |
| 16 | GET | `/2.2.1/cdrs` | CPO | List CDRs |
| 17 | GET | `/2.2.1/cdrs/{cc}/{pid}/{cdr_id}` | CPO | Get CDR |
| 18 | POST | `/2.2.1/cdrs` | CPO | Push CDR (body only) |
| 19 | POST | `/2.2.1/cdrs/{cc}/{pid}` | CPO | Push CDR (with path ids) |
| 20 | POST | `/2.2.1/commands/{type}/{id}` | CPO | Command **result** callback (start/stop) |
| 21 | GET | `/2.2.1/locations` | CPO | List locations |
| 22 | GET | `/2.2.1/locations/{cc}/{pid}/{loc_id}` | CPO | Get location |
| 23 | PUT | `/2.2.1/locations/{cc}/{pid}/{loc_id}` | CPO | Upsert location + EVSEs → **Beckn IDs** |
| 24 | PATCH | `/2.2.1/locations/{cc}/{pid}/{loc_id}` | CPO | Partial location update |
| 25 | GET | `/2.2.1/locations/.../{evse_uid}` | CPO | Get EVSE |
| 26 | PUT | `/2.2.1/locations/.../{evse_uid}` | CPO | Upsert EVSE |
| 27 | PATCH | `/2.2.1/locations/.../{evse_uid}` | CPO | Patch EVSE |
| 28 | GET | `/2.2.1/locations/.../{connector_id}` | CPO | Get connector |
| 29 | PUT | `/2.2.1/locations/.../{connector_id}` | CPO | Upsert connector |
| 30 | PATCH | `/2.2.1/locations/.../{connector_id}` | CPO | Patch connector |
| 31 | GET | `/2.2.1/tariffs` | CPO | List tariffs |
| 32 | GET | `/2.2.1/tariffs/{cc}/{pid}/{tariff_id}` | CPO | Get tariff |
| 33 | PUT | `/2.2.1/tariffs/{cc}/{pid}/{tariff_id}` | CPO | Upsert tariff (used in UBC pricing) |
| 34 | PATCH | `/2.2.1/tariffs/{cc}/{pid}/{tariff_id}` | CPO | Patch tariff |
| 35 | DELETE | `/2.2.1/tariffs/{cc}/{pid}/{tariff_id}` | CPO | Delete tariff |

`cc` = `country_code`, `pid` = `party_id`

---

## 5. Versions module

**Handler:** `VersionsModuleIncomingRequestService`

### 5.1 GET `/ocpi/versions`

**Use:** OCPI handshake — CPO discovers which protocol versions this EMSP supports.

**Request body:** None

**Query:** None

**Response `data`:** Array of version objects

```json
{
  "data": [
    {
      "version": "2.2.1",
      "url": "https://your-emsp.example.com/ocpi/versions/2.2.1/details"
    }
  ],
  "status_code": 1000,
  "timestamp": "2026-05-22T14:27:24.900Z"
}
```

---

### 5.2 GET `/ocpi/versions/2.2.1/details`

**Use:** Returns EMSP version details: supported modules and endpoint URLs for 2.2.1.

**Request body:** None

**Response `data`:** Version detail object (endpoints for credentials, locations, sessions, tokens, tariffs, cdrs, commands, etc.)

---

## 6. Credentials module

**Handler:** `OCPIv221CredentialsModuleIncomingRequestService`

**Use:** Mutual registration between CPO and EMSP (tokens, URLs, roles). Required during OCPI onboarding.

### 6.1 POST `/ocpi/2.2.1/credentials`

**Use:** CPO sends its credentials; EMSP stores partner credentials and returns EMSP credentials.

**Request body:**

```json
{
  "token": "cpo-access-token-from-cpo",
  "url": "https://cpo.example.com/ocpi/versions",
  "roles": [
    {
      "country_code": "IN",
      "party_id": "CPO",
      "role": "CPO",
      "business_details": {
        "name": "Example CPO"
      }
    }
  ]
}
```

**Response `data`:** `OCPICredentials` (EMSP token + URL + roles)

---

### 6.2 GET `/ocpi/2.2.1/credentials`

**Use:** CPO reads back the EMSP credentials object.

**Request body:** None

---

### 6.3 PUT `/ocpi/2.2.1/credentials`

**Use:** Full replace of credentials (same processing as POST).

**Request body:** Same shape as POST (`OCPICredentials`).

---

### 6.4 PATCH `/ocpi/2.2.1/credentials`

**Use:** Partial update (token, url, roles).

**Request body:**

```json
{
  "token": "new-token-optional",
  "url": "https://cpo.example.com/ocpi/versions",
  "roles": []
}
```

---

## 7. Tokens module

**Handler:** `OCPIv221TokensModuleIncomingRequestService`

**Use:** Manage driver/charging tokens and **real-time authorization** when a vehicle plugs in.

### 7.1 GET `/ocpi/2.2.1/tokens`

**Use:** List tokens for this partner (with OCPI pagination/filters per implementation).

**Query (typical):** `date_from`, `date_to`, `offset`, `limit`

---

### 7.2 GET `/ocpi/2.2.1/tokens/{country_code}/{party_id}/{token_uid}`

**Use:** Fetch a single token.

**Path params:** `country_code`, `party_id`, `token_uid`

---

### 7.3 PUT `/ocpi/2.2.1/tokens/{country_code}/{party_id}/{token_uid}`

**Use:** Create or fully replace a token in DB.

**Request body (`OCPIToken`):**

```json
{
  "country_code": "IN",
  "party_id": "EMS",
  "uid": "A1B2C3D4",
  "type": "APP_USER",
  "contract_id": "contract-001",
  "issuer": "Example EMSP",
  "valid": true,
  "whitelist": "ALWAYS",
  "last_updated": "2026-05-22T14:27:24.900Z"
}
```

---

### 7.4 PATCH `/ocpi/2.2.1/tokens/{country_code}/{party_id}/{token_uid}`

**Use:** Partial token update.

**Request body:** Subset of `OCPIToken` fields + `last_updated`.

---

### 7.5 POST `/ocpi/2.2.1/tokens/{country_code}/{party_id}/{token_uid}/authorize`

**Use:** CPO asks EMSP whether a token may charge at a location (plug-and-charge / RFID flow).

**Request body (optional location reference):**

```json
{
  "location_id": "LOC001",
  "evse_uids": ["EVSE-1"]
}
```

**Response `data` (`OCPIAuthorizationInfo`):**

```json
{
  "allowed": "ALLOWED",
  "token": { },
  "location": {
    "location_id": "LOC001",
    "evse_uids": ["EVSE-1"]
  },
  "cache_until": "2026-05-22T14:32:24.900Z"
}
```

**Logic:** `whitelist` on token drives `ALLOWED` vs `NOT_ALLOWED`; `cache_until` is ~5 minutes.

---

## 8. Locations module

**Handler:** `OCPIv221LocationsModuleIncomingRequestService`

**Use:** CPO pushes **charging site catalog** (locations → EVSEs → connectors). The adaptor stores OCPI objects and generates **`beckn_connector_id`** values used later in UBC `select` / `init` flows.

### 8.1 GET `/ocpi/2.2.1/locations`

**Use:** List locations for partner.

**Query:** `date_from`, `date_to`, `offset`, `limit` (per OCPI)

---

### 8.2 GET `/ocpi/2.2.1/locations/{country_code}/{party_id}/{location_id}`

**Use:** Get one location with nested EVSEs/connectors.

---

### 8.3 PUT `/ocpi/2.2.1/locations/{country_code}/{party_id}/{location_id}`

**Use:** Create or replace entire location tree.

**Request body (`OCPILocation` — key fields):**

```json
{
  "country_code": "IN",
  "party_id": "CPO",
  "id": "LOC001",
  "publish": true,
  "name": "Station A",
  "address": "123 Main St",
  "city": "Bengaluru",
  "country": "IND",
  "coordinates": {
    "latitude": "12.971600",
    "longitude": "77.594600"
  },
  "time_zone": "Asia/Kolkata",
  "evses": [
    {
      "uid": "EVSE-1",
      "status": "AVAILABLE",
      "connectors": [
        {
          "id": "1",
          "standard": "IEC_62196_T2",
          "format": "CABLE",
          "power_type": "AC_3_PHASE",
          "max_voltage": 400,
          "max_amperage": 32,
          "tariff_ids": ["TARIFF1"],
          "last_updated": "2026-05-22T14:27:24.900Z"
        }
      ],
      "last_updated": "2026-05-22T14:27:24.900Z"
    }
  ],
  "last_updated": "2026-05-22T14:27:24.900Z"
}
```

**Validation:** `body.id` must match path `location_id`.

**Side effects:** DB upsert; Beckn connector id generation for UBC catalog.

---

### 8.4 PATCH `/ocpi/2.2.1/locations/{country_code}/{party_id}/{location_id}`

**Use:** Partial location update.

---

### 8.5 EVSE endpoints

| Method | Path suffix | Use |
|--------|-------------|-----|
| GET | `.../{location_id}/{evse_uid}` | Get EVSE |
| PUT | `.../{location_id}/{evse_uid}` | Upsert EVSE under location |
| PATCH | `.../{location_id}/{evse_uid}` | Patch EVSE (status, connectors, etc.) |

---

### 8.6 Connector endpoints

| Method | Path suffix | Use |
|--------|-------------|-----|
| GET | `.../{evse_uid}/{connector_id}` | Get connector |
| PUT | `.../{evse_uid}/{connector_id}` | Upsert connector |
| PATCH | `.../{evse_uid}/{connector_id}` | Patch connector (`OCPIPatchConnector`) |

**Example PATCH connector body:**

```json
{
  "status": "AVAILABLE",
  "tariff_ids": ["TARIFF1"],
  "last_updated": "2026-05-22T14:27:24.900Z"
}
```

---

## 9. Tariffs module

**Handler:** `OCPIv221TariffsModuleIncomingRequestService`

**Use:** CPO publishes pricing. Tariffs are used by **UBC `select`** (`buildOrderValue`) to compute `beckn:orderValue`.

### 9.1 GET `/ocpi/2.2.1/tariffs`

**Use:** List tariffs for partner.

---

### 9.2 GET `/ocpi/2.2.1/tariffs/{country_code}/{party_id}/{tariff_id}`

**Use:** Get one tariff.

---

### 9.3 PUT `/ocpi/2.2.1/tariffs/{country_code}/{party_id}/{tariff_id}`

**Use:** Create/replace tariff.

**Request body:** `OCPITariff` (OCPI 2.2.1 tariff with `elements`, `price_components`, currency, etc.)

---

### 9.4 PATCH `/ocpi/2.2.1/tariffs/{country_code}/{party_id}/{tariff_id}`

**Use:** Partial tariff update.

---

### 9.5 DELETE `/ocpi/2.2.1/tariffs/{country_code}/{party_id}/{tariff_id}`

**Use:** Remove tariff from EMSP store.

---

## 10. Sessions module

**Handler:** `OCPIv221SessionsModuleIncomingRequestService`

**Use:** CPO pushes **live charging session** state (kWh, status, cost). Links to `authorization_reference` from Beckn/UBC payment flow.

### 10.1 GET `/ocpi/2.2.1/sessions`

**Use:** List sessions for partner.

**Query:** `country_code`, `party_id`, `date_from`, `date_to`, `offset`, `limit`

---

### 10.2 GET `/ocpi/2.2.1/sessions/{country_code}/{party_id}/{session_id}`

**Use:** Get one session (`session_id` = CPO session id / `cpo_session_id`).

---

### 10.3 PUT `/ocpi/2.2.1/sessions/{country_code}/{party_id}/{session_id}`

**Use:** Create or update session from CPO.

**Request body (`OCPISession`):**

```json
{
  "country_code": "IN",
  "party_id": "CPO",
  "id": "SESSION-UUID-FROM-CPO",
  "start_date_time": "2026-05-22T14:00:00.000Z",
  "end_date_time": null,
  "kwh": 1.5,
  "cdr_token": {
    "country_code": "IN",
    "party_id": "EMS",
    "uid": "TOKEN-UID",
    "type": "APP_USER",
    "contract_id": "contract-001"
  },
  "auth_method": "COMMAND",
  "authorization_reference": "51b28863-bddf-4939-a190-043a558bfca0",
  "location_id": "LOC001",
  "evse_uid": "EVSE-1",
  "connector_id": "1",
  "currency": "INR",
  "status": "ACTIVE",
  "last_updated": "2026-05-22T14:27:24.900Z"
}
```

**Validation:** `country_code`, `party_id`, and `id` in body must match URL.

**Lookup order:**

1. By `cpo_session_id` = path `session_id`
2. Else by `authorization_reference` (first time) and attach `cpo_session_id`

**Side effects:**

- Updates `session` table
- **`TrackActionHandler.sendOnTrackToBAPONIX`** when session has `authorization_reference`
- **`ChargingService.autoCutOffChargingSession`** after store

---

### 10.4 PATCH `/ocpi/2.2.1/sessions/{country_code}/{party_id}/{session_id}`

**Use:** Partial session update (`OCPIPatchSession`).

---

## 11. CDRs module

**Handler:** `OCPIv221CDRsModuleIncomingRequestService`

**Use:** CPO sends **Charge Detail Record** after session ends (billing / settlement).

### 11.1 GET `/ocpi/2.2.1/cdrs`

**Use:** List stored CDRs.

---

### 11.2 GET `/ocpi/2.2.1/cdrs/{country_code}/{party_id}/{cdr_id}`

**Use:** Get one CDR.

---

### 11.3 POST `/ocpi/2.2.1/cdrs`  
### 11.4 POST `/ocpi/2.2.1/cdrs/{country_code}/{party_id}`

**Use:** CPO pushes a new CDR (both routes call the same handler).

**Request body (`OCPICDR` — key fields):**

```json
{
  "country_code": "IN",
  "party_id": "CPO",
  "id": "CDR-001",
  "start_date_time": "2026-05-22T14:00:00.000Z",
  "end_date_time": "2026-05-22T15:00:00.000Z",
  "session_id": "SESSION-UUID-FROM-CPO",
  "cdr_token": {
    "country_code": "IN",
    "party_id": "EMS",
    "uid": "TOKEN-UID",
    "type": "APP_USER",
    "contract_id": "contract-001"
  },
  "auth_method": "COMMAND",
  "authorization_reference": "51b28863-bddf-4939-a190-043a558bfca0",
  "cdr_location": {
    "id": "LOC001",
    "name": "Station A",
    "address": "123 Main St",
    "city": "Bengaluru",
    "country": "IND",
    "coordinates": {
      "latitude": "12.971600",
      "longitude": "77.594600"
    },
    "evse_uid": "EVSE-1",
    "evse_id": "IN*CPO*E123",
    "connector_id": "1",
    "connector_standard": "IEC_62196_T2",
    "connector_format": "CABLE"
  },
  "currency": "INR",
  "charging_periods": [],
  "total_cost": {
    "excl_vat": 200.0,
    "incl_vat": 236.0
  },
  "total_energy": 10.5,
  "total_time": 1.0,
  "last_updated": "2026-05-22T15:00:00.000Z"
}
```

**Side effects:** Persist CDR; may interact with charging settlement logic in handler.

---

## 12. Commands module (callback)

**Handler:** `OCPIv221CommandsModuleIncomingRequestService`

### 12.1 POST `/ocpi/2.2.1/commands/{command_type}/{command_id}`

**Use:** This is the **`response_url` target** after the EMSP sent a command to the CPO (e.g. START_SESSION / STOP_SESSION). CPO posts the **result** here.

**Path params:**

| Param | Examples | Meaning |
|-------|----------|---------|
| `command_type` | `START_SESSION`, `STOP_SESSION` | OCPI command type |
| `command_id` | auth ref or CPO session id | Correlates to session lookup |

**Request body (`OCPICommandResult`):**

```json
{
  "result": "ACCEPTED",
  "message": [
    {
      "language": "en",
      "text": "Charging started"
    }
  ]
}
```

`result` enum: `ACCEPTED`, `REJECTED`, `TIMEOUT`, `UNKNOWN_SESSION`, etc.

**Behavior:**

| `command_type` | Session lookup | Status update |
|----------------|----------------|---------------|
| `START_SESSION` | `authorization_reference` = `command_id` | `ACTIVE` if ACCEPTED, else `INVALID` |
| `STOP_SESSION` | `cpo_session_id` = `command_id` | `COMPLETED` if ACCEPTED |

If session not found → **404** with `status_code` 2001.

**Side effects:** May trigger UBC **`on_update`** to Beckn ONIX (charging state) when configured in handler.

---

## 13. Error handling

Global **`errorHandler`** on the router maps:

| Condition | HTTP | `status_code` |
|-----------|------|---------------|
| `AppError` 400 | 400 | 2000 |
| `AppError` 404 | 404 | 2001 |
| Other errors | 500 | 3000 |

---

## 14. How this file relates to UBC / Beckn

| OCPI incoming API | UBC / business impact |
|-------------------|----------------------|
| **Locations** PUT/PATCH | Catalog data; `beckn:orderedItem` connector ids |
| **Tariffs** PUT | `on_select` pricing / `beckn:orderValue` |
| **Sessions** PUT | Live kWh/status; **on_track** to BAP |
| **Commands** POST | Start/stop charging acknowledgement |
| **CDRs** POST | Post-session billing record |
| **Tokens** authorize | Plug-and-charge authorization |
| **Credentials** | OCPI onboarding only |

Beckn actions (`select`, `init`, `on_status`, etc.) are **not** in this file; they live under **`/ubc`** (`ubc-router.ts`).

---

## 15. Implementation map

| Route group | Service class |
|-------------|---------------|
| Versions | `VersionsModuleIncomingRequestService` |
| Credentials | `OCPIv221CredentialsModuleIncomingRequestService` |
| Tokens | `OCPIv221TokensModuleIncomingRequestService` |
| Sessions | `OCPIv221SessionsModuleIncomingRequestService` |
| CDRs | `OCPIv221CDRsModuleIncomingRequestService` |
| Commands | `OCPIv221CommandsModuleIncomingRequestService` |
| Locations | `OCPIv221LocationsModuleIncomingRequestService` |
| Tariffs | `OCPIv221TariffsModuleIncomingRequestService` |

---

## 16. Related documentation

- Full UBC Beckn flows: `docs/UBC-Technical-Specification-Document.md`
- Project setup: `docs/SETUP.md`
- Outgoing CPO calls: `src/api/ocpi/ocpi-outgoing-routes.ts`

---

*Generated from `src/ocpi/ocpi-incoming-routes.ts` and module handlers. For exact field-level OCPI schemas, refer to the [OCPI 2.2.1 specification](https://github.com/ocpi/ocpi) and types under `src/ocpi/schema/modules/`.*
