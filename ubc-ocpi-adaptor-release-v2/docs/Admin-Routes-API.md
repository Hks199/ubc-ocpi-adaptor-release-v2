# Admin Routes API Reference

This document describes every HTTP API defined under **`src/admin/routes`**. These are **internal admin / operations APIs** used to onboard CPO partners, sync OCPI data, manage tokens, trigger charging commands, and authenticate admin users.

They are **not** the public OCPI receiver APIs (`/ocpi/*` — see `docs/OCPI-Incoming-Routes-API.md`) and **not** the Beckn UBC APIs (`/ubc/*`).

---

## 1. Overview

| Route file | Mount path (`src/index.ts`) | Purpose |
|------------|----------------------------|---------|
| `admin/auth.routes.ts` | `/api/admin/auth` | Admin JWT login & profile |
| `ocpi/ocpi-setup.routes.ts` | `/api/admin/ocpi` | CPO onboarding: versions, credentials, register |
| `ocpi/locations.routes.ts` | `/api/admin/locations` | Pull locations from CPO; Beckn ID generation |
| `ocpi/tokens.routes.ts` | `/api/admin/tokens` | Upsert token in DB + sync to CPO |
| `ocpi/commands.routes.ts` | `/api/admin/commands` | Start/stop charging via OCPI Commands |
| `ocpi/tariffs.routes.ts` | `/api/admin/tariffs` | **Inactive** (all routes commented out) |

### Architecture

```text
Admin UI / Postman / Scripts
        |
        v
  /api/admin/*  (this document)
        |
        +--> Local DB (Prisma: OCPIPartner, Location, Token, Session, ...)
        |
        +--> Outgoing OCPI calls to CPO (EMSP --> CPO)
        |
        +--> UBC side effects (beckn_connector_id, Commands -> charging)
```

---

## 2. Common behaviour

### 2.1 Response wrapper

Most admin handlers return:

```json
{
  "data": { }
}
```

HTTP status is set on the response (typically `200`). When proxying OCPI, the inner structure may also include OCPI fields:

```json
{
  "data": {
    "status_code": 1000,
    "status_message": "Success",
    "timestamp": "2026-05-22T14:27:24.900Z",
    "data": { }
  }
}
```

### 2.2 Authentication (`adminAuth`)

| Route group | `adminAuth` enabled? |
|-------------|----------------------|
| `POST /api/admin/auth/login` | No (uses `adminRequestLogger` only) |
| `GET /api/admin/auth/me` | **Yes** |
| Most OCPI admin routes | **Commented out in code** — currently **open** unless you uncomment `adminAuth` in route files |

When `adminAuth` is enabled:

```http
Authorization: Bearer <JWT from /login>
```

JWT is created by `AdminAuthModule.login` and verified in `middlewares.ts`.

### 2.3 Recommended headers

| Header | Purpose |
|--------|---------|
| `X-Correlation-Id` | End-to-end trace (auto-generated if missing on some routes) |
| `X-Request-Id` | Per-request id |
| `Content-Type` | `application/json` for POST bodies |

### 2.4 Errors

Validation errors throw `ValidationError` → typically HTTP **400** with message. Unhandled errors → HTTP **500**.

---

## 3. Quick reference — all active endpoints

| # | Method | Full path | Use when you need to… |
|---|--------|-----------|------------------------|
| 1 | POST | `/api/admin/auth/login` | Get admin JWT |
| 2 | GET | `/api/admin/auth/me` | Verify JWT / get user info |
| 3 | POST | `/api/admin/ocpi/versions` | Fetch CPO `/versions` and store in DB |
| 4 | POST | `/api/admin/ocpi/versions/details` | Fetch CPO version details + store endpoints |
| 5 | POST | `/api/admin/ocpi/credentials` | POST credentials to CPO (handshake) |
| 6 | GET | `/api/admin/ocpi/credentials` | GET credentials from CPO |
| 7 | POST | `/api/admin/ocpi/register` | **Full CPO + EMSP onboarding** (one-shot) |
| 8 | GET | `/api/admin/locations` | Pull all locations from CPO (paginated) |
| 9 | GET | `/api/admin/locations/:location_id` | Pull one location from CPO |
| 10 | GET | `/api/admin/locations/generate-beckn-connector-ids` | Generate `beckn_connector_id` for partner |
| 11 | GET | `/api/admin/locations/generate-beckn-ids` | Same as above (alias handler) |
| 12 | POST | `/api/admin/tokens` | Save token locally + PUT to CPO |
| 13 | POST | `/api/admin/commands/start` | OCPI START_SESSION to CPO |
| 14 | POST | `/api/admin/commands/stop` | OCPI STOP_SESSION to CPO |

---

## 4. Auth module

**Files:** `admin/routes/admin/auth.routes.ts` → `AdminAuthModule`

### 4.1 POST `/api/admin/auth/login`

**Purpose:** Issue a JWT for admin tools. Does **not** validate password against a user DB (accepts any email).

**Auth:** None (`adminRequestLogger` only)

**Request body:**

```json
{
  "email": "admin@example.com",
  "company": "Example Corp"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `email` | Yes | Stored in JWT payload |
| `company` | No | Stored in JWT payload |

**Response (200):**

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "email": "admin@example.com",
      "company": "Example Corp"
    }
  }
}
```

---

### 4.2 GET `/api/admin/auth/me`

**Purpose:** Return claims from the JWT (who is logged in).

**Auth:** `Bearer <token>`

**Request body:** None

**Response (200):**

```json
{
  "data": {
    "email": "admin@example.com",
    "company": "Example Corp"
  }
}
```

---

## 5. OCPI setup module

**Files:** `admin/routes/ocpi/ocpi-setup.routes.ts` → `AdminVersionsModule`, `AdminCredentialsModule`

**Typical onboarding order:**

1. `POST /register` (all-in-one), **or**
2. `POST /versions` → `POST /versions/details` → `POST /credentials`

---

### 5.1 POST `/api/admin/ocpi/versions`

**Purpose:** Call the CPO’s OCPI **`GET /versions`** using stored `versions_url` and `cpo_auth_token`; insert new versions into `OCPIVersion` table.

**Handler:** `AdminVersionsModule.getCpoVersions`

**Request body:**

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | `OCPIPartner.id` (UUID) |

**Response (200):**

```json
{
  "data": {
    "success": true,
    "versions": [
      {
        "version": "2.2.1",
        "url": "https://cpo.example.com/ocpi/2.2.1"
      }
    ]
  }
}
```

**Prerequisites:** Partner exists with `versions_url`; `OCPIPartnerCredentials.cpo_auth_token` configured.

---

### 5.2 POST `/api/admin/ocpi/versions/details`

**Purpose:** Call CPO **version details** for stored version (prefers **2.2.1**); save module endpoints to `OCPIPartnerEndpoint`.

**Handler:** `AdminVersionsModule.getCpoVersionDetails`

**Request body:**

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda"
}
```

**Response (200):**

```json
{
  "data": {
    "success": true,
    "version": "2.2.1",
    "endpoints": [
      {
        "identifier": "locations",
        "role": "SENDER",
        "url": "https://cpo.example.com/ocpi/2.2.1/locations"
      }
    ]
  }
}
```

**Prerequisites:** Call `/versions` first so `OCPIVersion` rows exist.

---

### 5.3 POST `/api/admin/ocpi/credentials`

**Purpose:** EMSP sends **credentials** to the CPO (`POST /credentials` on CPO). Updates `cpo_auth_token` and partner status to `ACTIVE` if CPO returns a new token.

**Handler:** `AdminCredentialsModule.sendPostCredentials`

**Request body:**

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda",
  "token": "emsp-token-for-cpo",
  "url": "https://emsp.example.com/ocpi/versions",
  "roles": [
    {
      "country_code": "IN",
      "party_id": "EMS",
      "role": "EMSP"
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | Target CPO partner |
| `token` | Yes | Token EMSP gives CPO |
| `url` | Yes | EMSP versions URL |
| `roles` | Yes | OCPI credential roles array |

**Response (200):** Wraps raw OCPI response:

```json
{
  "data": {
    "status_code": 1000,
    "timestamp": "2026-05-22T14:27:24.900Z",
    "data": {
      "token": "new-cpo-token-from-cpo",
      "url": "https://cpo.example.com/ocpi/versions",
      "roles": [ ]
    }
  }
}
```

---

### 5.4 GET `/api/admin/ocpi/credentials`

**Purpose:** Call CPO **`GET /credentials`** and return the CPO’s view of credentials.

**Handler:** `AdminCredentialsModule.getCpoCredentials`

**Query parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | `OCPIPartner.id` |

**Example:** `GET /api/admin/ocpi/credentials?partner_id=30bec697-88f4-4f26-a31c-07208127abda`

**Response (200):** OCPI envelope inside `data` (credentials object).

---

### 5.5 POST `/api/admin/ocpi/register`

**Purpose:** **One-shot onboarding** — creates/updates CPO partner + credentials, creates EMSP partner on first run, fetches CPO versions & version details, returns everything needed for CPO to call this EMSP.

**Handler:** `AdminCredentialsModule.registerCpoFromCredentialsPayload`

**Request body (`AdminRegisterRequestPayload`):**

```json
{
  "cpo_auth_token": "initial-cpo-token",
  "cpo_versions_url": "https://cpo.example.com/ocpi/versions",
  "cpo_party_id": "CPO",
  "cpo_country_code": "IN",
  "cpo_name": "Example CPO",
  "emsp_auth_token": "optional-emsp-token",
  "emsp_ocpi_host": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in",
  "emsp_party_id": "EMS",
  "emsp_country_code": "IN",
  "emsp_name": "UBC EMSP"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `cpo_auth_token` | Yes | Token CPO gave EMSP to call CPO APIs |
| `cpo_versions_url` | Yes | CPO `/versions` URL |
| `cpo_party_id` | Yes | CPO party id |
| `cpo_country_code` | Yes | e.g. `IN` |
| `cpo_name` | Yes | Display name |
| `emsp_ocpi_host` | Yes (first EMSP create) | Public base URL of **this** adaptor |
| `emsp_party_id` | Yes (first EMSP create) | Default `EMSP` |
| `emsp_country_code` | Yes (first EMSP create) | Default `IN` |
| `emsp_name` | Yes (first EMSP create) | EMSP name |
| `emsp_auth_token` | No | Auto-generated UUID if omitted |
| `cpo_token` | No | OCPI token object (in type; optional in flow) |

**What it does internally:**

1. Upsert `OCPIPartner` (role `CPO`)
2. Create EMSP partner + version + receiver/sender endpoints if first time
3. Upsert `OCPIPartnerCredentials`
4. Calls `getCpoVersions` + `getCpoVersionDetails` automatically

**Response (200):**

```json
{
  "data": {
    "status_code": 1000,
    "timestamp": "2026-05-22T14:27:24.900Z",
    "data": {
      "cpo_partner": { "id": "...", "party_id": "CPO", "status": "INIT" },
      "cpo_credentials": { "cpo_auth_token": "...", "emsp_auth_token": "..." },
      "cpo_versions": [ { "version": "2.2.1", "url": "..." } ],
      "cpo_version_details": { "version": "2.2.1", "endpoints": [ ] },
      "emsp_partner": { "id": "...", "role": "EMSP" },
      "emsp_endpoints": [
        { "module": "locations", "role": "RECEIVER", "url": "https://.../ocpi/2.2.1/locations" }
      ],
      "emsp_versions_url": "https://.../ocpi/versions"
    }
  }
}
```

**When to use:** New CPO integration from admin panel or runbook — **most useful single API** for setup.

---

## 6. Locations module

**Files:** `admin/routes/ocpi/locations.routes.ts` → `AdminLocationsModule`

### 6.1 GET `/api/admin/locations`

**Purpose:** Pull locations from CPO via outgoing **`GET /locations`** (paginated, 100 per page, 10s delay between pages), **persist each location** to local DB.

**Handler:** `AdminLocationsModule.sendGetLocations`

**Query parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | CPO partner UUID |
| `page` | No | Starting page (0-based). Default `0`. Each page = 100 locations. |

**Example:** `GET /api/admin/locations?partner_id=30bec697-...&page=0`

**Response (200):**

```json
{
  "data": {
    "status_code": 1000,
    "status_message": "Success",
    "timestamp": "2026-05-22T14:27:24.900Z",
    "data": [
      {
        "country_code": "IN",
        "party_id": "CPO",
        "id": "LOC001",
        "publish": true,
        "name": "Station A",
        "address": "123 Main St",
        "city": "Bengaluru",
        "country": "IND",
        "coordinates": { "latitude": "12.97", "longitude": "77.59" },
        "time_zone": "Asia/Kolkata",
        "evses": [ ],
        "last_updated": "2026-05-22T14:27:24.900Z"
      }
    ]
  }
}
```

**When to use:** Initial catalog sync or refresh all sites from CPO before UBC charging.

**Note:** Can take a long time for large CPO catalogs (pagination + delays + rate-limit retries).

---

### 6.2 GET `/api/admin/locations/:location_id`

**Purpose:** Fetch **one** location from CPO and upsert to DB.

**Handler:** `AdminLocationsModule.sendGetLocation`

**Path params:**

| Param | Description |
|-------|-------------|
| `location_id` | OCPI location id |

**Query:**

| Param | Required |
|-------|----------|
| `partner_id` | Yes |

**Example:** `GET /api/admin/locations/LOC001?partner_id=30bec697-...`

**Response (200):** OCPI location envelope in `data` (single `OCPILocation`).

---

### 6.3 GET `/api/admin/locations/generate-beckn-connector-ids`

**Purpose:** Bulk-generate **`beckn_connector_id`** for all connectors of a partner (used in UBC `beckn:orderedItem`).

**Handler:** `AdminLocationsModule.generateBecknConnectorIds`

**Auth:** `adminAuth` **enabled** on this route

**Query:**

| Param | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | CPO partner UUID |

**ID format:** `IND*{ubc_party_id}*{ocpi_location_id}*{evse_uid}*{connector_id}`  
(`ubc_party_id` from partner `additional_props`, default `TPC`)

**Response (200):**

```json
{
  "data": {
    "updated": 42,
    "connectors": [
      {
        "id": "internal-connector-uuid",
        "beckn_connector_id": "IND*TPC*LOC001*EVSE-1*1"
      }
    ]
  }
}
```

**When to use:** After location sync, before UBC `select` / catalog publish testing.

---

### 6.4 GET `/api/admin/locations/generate-beckn-ids`

**Purpose:** Same implementation as `generate-beckn-connector-ids` (duplicate route name).

**Handler:** `AdminLocationsModule.generateBecknIds`

---

## 7. Tokens module

**Files:** `admin/routes/ocpi/tokens.routes.ts` → `AdminTokensModule`

**Mount note:** `/api/admin/tokens` (not under `/api/admin/ocpi`).

### 7.1 POST `/api/admin/tokens`

**Purpose:** Upsert driver/charging **token** in local DB, then **`PUT`** token to CPO via OCPI.

**Handler:** `AdminTokensModule.upsertTokenAndSyncWithCPO`

**Request body:** OCPI `OCPIToken` + `partner_id`

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda",
  "country_code": "IN",
  "party_id": "EMS",
  "uid": "A1B2C3D4E5",
  "type": "APP_USER",
  "contract_id": "contract-001",
  "issuer": "UBC EMSP",
  "valid": true,
  "whitelist": "ALWAYS",
  "last_updated": "2026-05-22T14:27:24.900Z"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | CPO partner to sync to |
| All other fields | Per OCPI 2.2.1 Token | Standard `OCPIToken` |

**Response (200):** CPO OCPI response wrapped in `data`:

```json
{
  "data": {
    "status_code": 1000,
    "timestamp": "2026-05-22T14:27:24.900Z",
    "data": { }
  }
}
```

**When to use:** Register app user tokens before `START_SESSION` / plug-and-charge flows.

---

## 8. Commands module

**Files:** `admin/routes/ocpi/commands.routes.ts` → `AdminCommandsModule` → `CommandsService`

**Purpose:** Manually trigger **OCPI Commands** (EMSP → CPO) for testing or ops, without going through Beckn BAP UI.

### 8.1 POST `/api/admin/commands/start`

**Purpose:** Send **`START_SESSION`** to CPO for a connector; uses `transaction_id` as `authorization_reference`.

**Handler:** `AdminCommandsModule.startCharging`

**Request body:**

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda",
  "location_id": "LOC001",
  "evse_uid": "EVSE-1",
  "connector_id": "1",
  "transaction_id": "51b28863-bddf-4939-a190-043a558bfca0"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | CPO partner |
| `location_id` | Yes | OCPI location id |
| `evse_uid` | Yes | EVSE uid |
| `connector_id` | Yes | Connector id |
| `transaction_id` | Yes | Beckn/UBC authorization reference (links to `Session`) |

**Response (200):** OCPI command response from CPO in `data` (async command accepted / result URL).

**When to use:** Test physical start after payment/`init`; pairs with incoming `POST /ocpi/2.2.1/commands/...` callback on CPO result.

---

### 8.2 POST `/api/admin/commands/stop`

**Purpose:** Send **`STOP_SESSION`** to CPO.

**Handler:** `AdminCommandsModule.stopCharging`

**Request body:**

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda",
  "session_id": "CPO-SESSION-UUID"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `partner_id` | Yes | CPO partner |
| `session_id` | Yes | CPO’s OCPI session id (`cpo_session_id`) |

**Response (200):** OCPI command response in `data`.

**When to use:** End charging from ops when BAP/UI stop is unavailable.

---

## 9. Tariffs module (inactive)

**Files:** `admin/routes/ocpi/tariffs.routes.ts`

All routes are **commented out**. Planned endpoints (not available unless re-enabled):

| Method | Path | Intended handler |
|--------|------|------------------|
| POST | `/fetch` | `AdminTariffsModule.fetchTariffs` |
| POST | `/sync-to-cds` | `AdminTariffsModule.syncToCDS` |
| GET | `/` | `AdminTariffsModule.getTariffs` |
| GET | `/:tariff_id` | `AdminTariffsModule.getTariff` |

**Today:** Tariffs are synced via **incoming** CPO `PUT /ocpi/2.2.1/tariffs/...` or CPO push, not these admin routes.

---

## 10. Typical operational flows

### Flow A — Onboard new CPO (recommended)

```text
POST /api/admin/ocpi/register
  --> partner + credentials + versions + endpoints in DB

GET /api/admin/locations?partner_id=...
  --> sync all locations

GET /api/admin/locations/generate-beckn-connector-ids?partner_id=...
  --> beckn_connector_id for UBC select
```

### Flow B — Manual step-by-step

```text
POST /api/admin/ocpi/versions          { partner_id }
POST /api/admin/ocpi/versions/details { partner_id }
POST /api/admin/ocpi/credentials      { partner_id, token, url, roles }
GET  /api/admin/locations?partner_id=...
```

### Flow C — Test charging from admin

```text
POST /api/admin/tokens        { partner_id, ...OCPIToken }
POST /api/admin/commands/start { partner_id, location_id, evse_uid, connector_id, transaction_id }
... CPO calls back POST /ocpi/2.2.1/commands/START_SESSION/{id} ...
POST /api/admin/commands/stop  { partner_id, session_id }
```

---

## 11. File → handler map

| Route file | Module class |
|------------|--------------|
| `admin/auth.routes.ts` | `AdminAuthModule` |
| `ocpi/ocpi-setup.routes.ts` | `AdminVersionsModule`, `AdminCredentialsModule` |
| `ocpi/locations.routes.ts` | `AdminLocationsModule` |
| `ocpi/tokens.routes.ts` | `AdminTokensModule` |
| `ocpi/commands.routes.ts` | `AdminCommandsModule` |
| `ocpi/tariffs.routes.ts` | `AdminTariffsModule` (disabled) |
| `utils/middlewares.ts` | `adminAuth`, `adminRequestLogger` |
| `utils/requestHandler.ts` | JSON response + BigInt sanitization |

---

## 12. Related documentation

| Document | Content |
|----------|---------|
| `docs/OCPI-Incoming-Routes-API.md` | CPO → EMSP `/ocpi/*` receiver APIs |
| `docs/SETUP.md` | Environment and deployment |
| `docs/UBC-Technical-Specification-Document.md` | Beckn/UBC flows |

---

*Generated from `src/admin/routes/**` and `src/admin/modules/**`. Re-enable `adminAuth` on routes before production exposure.*
