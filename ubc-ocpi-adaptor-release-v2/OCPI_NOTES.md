### OCPI 2.2.1 – Project Notes

This file summarizes how OCPI 2.2.1 is modeled and used in this repo so it can be referenced later.

---

### Core Data Model (Prisma)

- **Location** (`prisma.schema` model `Location`)
  - OCPI fields: `country_code`, `party_id`, `id` → stored as `country_code`, `party_id`, `ocpi_location_id`.
  - Coordinates: `coordinates.latitude/longitude` → `latitude`, `longitude`.
  - Complex/nested OCPI fields are stored as:
    - `related_locations`, `directions`, `operator`, `suboperator`, `owner`, `opening_times`, `images`, `energy_mix`, `publish_allowed_to` → `Json?`.
    - `facilities` → `String[]`.
  - Soft delete: `deleted Boolean @default(false)`, `deleted_at DateTime?`.

- **EVSE** (`EVSE`)
  - Linked to `Location` via `location_id`.
  - OCPI fields: `uid`, `evse_id`, `status`, `status_schedule`, `capabilities`, coordinates, `physical_reference`, `directions`, `parking_restrictions`, `images`, `status_errorcode`, `status_errordescription`, `last_updated`.
  - Lists/enums:
    - `capabilities`, `parking_restrictions` → `String[]`.

- **Connector** (`EVSEConnector`)
  - Linked to `EVSE` via `evse_id`.
  - OCPI fields: `id`, `standard`, `format`, `qr_code`, `power_type`, `max_voltage`, `max_amperage`, `max_electric_power`, `tariff_ids`, `terms_and_conditions`, `last_updated`.
  - Lists: `tariff_ids → String[]`.

- **Tariff / Session / CDR / Token**
  - Normalized by main identifiers.
  - Numeric energy amounts use `Decimal @db.Decimal(10, 3)` (e.g. `Session.kwh`, `CDR.total_energy`).
  - Many nested OCPI price/charging-period types are stored as `Json`.

---

### OCPI TypeScript Types (Locations)

- Defined under `src/ocpi/schema/modules/locations/types/index.ts`.
- Key types:
  - `OCPILocation` – direct mapping of OCPI 2.2.1 Location object.
  - `OCPIEVSE`, `OCPIConnector`, `OCPIEnergyMix`, `OCPIHours`, etc.
  - Response wrappers in `types/responses.ts`:
    - `OCPILocationsResponse = OCPIResponsePayload<OCPILocation[]>`
    - `OCPILocationResponse = OCPIResponsePayload<OCPILocation>`

---

### Endpoint Discovery (`Utils.getAllEndpoints`)

- File: `src/utils/Utils.ts`.
- `getAllEndpoints()` returns a static OCPI versions response-like object:
  - Version: `'2.2.1'`.
  - `endpoints` contains entries with:
    - `identifier`: `'credentials' | 'locations' | 'sessions' | 'cdrs' | 'tariffs' | 'tokens' | 'commands'`.
    - `role`: `'SENDER' | 'RECEIVER'`.
    - `url`: full base URL for that interface.
- Locations CPO sender URL is resolved by:
  - Filtering on `identifier === 'locations'` and `role === 'SENDER'`.

---

### OCPI Auth Token Helper

- File: `src/ocpi/utils/ocpi-auth-token.ts`.
- `getOcpiCpoAuthToken()`:
  - Reads `process.env.OCPI_CPO_AUTH_TOKEN`.
  - Throws if not set.
  - Used as the CPO OCPI `Token` authentication header.

---

### Locations – Outgoing Requests (EMSP → CPO)

File: `src/ocpi/modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleOutgoingRequestService.ts`.

- **Dependencies**
  - `OCPIOutgoingRequestService.sendGetRequest` – performs HTTP GET with logging.
  - `OCPIResponseService` – wraps responses in `HttpResponse<OCPIResponsePayload<T>>`.
  - `Utils.getAllEndpoints()` – resolves base URL for locations.
  - `getOcpiCpoAuthToken()` – OCPI `Token` auth.
  - `LocationDbService` – DB persistence and mapping.

- **`sendGetLocations(req: Request): Promise<HttpResponse<OCPILocationsResponse>>`**
  - Extracts `limit` and `offset` from `req.query` if provided.
  - Resolves base locations URL (role `'SENDER'`) from `Utils.getAllEndpoints()`.
  - Appends query params using `URLSearchParams`.
  - Generates or reuses `X-Request-Id` and `X-Correlation-Id`.
  - Calls CPO via `OCPIOutgoingRequestService.sendGetRequest` with:
    - `Authorization: Token <OCPI_CPO_AUTH_TOKEN>`.
  - Expects OCPI envelope `OCPILocationsResponse`.
  - **On success**:
    - Iterates `payload.data` (array of `OCPILocation`).
    - Calls `LocationDbService.upsertFromOcpiLocation` for each to persist into Prisma (`Location`, `EVSE`, `EVSEConnector`).
    - Returns the CPO payload as-is (`httpStatus: 200, payload`).

- **`sendGetLocation(req: Request): Promise<HttpResponse<OCPILocationResponse>>`**
  - Reads `location_id` from `req.params`.
  - **DB-first behavior**:
    - Uses `LocationDbService.findByOcpiLocationId(location_id)`.
    - If found:
      - Maps DB record to OCPI using `mapPrismaLocationToOcpi`.
      - Returns `OCPIResponseService.success(ocpiLocation)`.
  - **If not in DB**:
    - Resolves base URL (role `'SENDER'`) and builds `.../locations/{location_id}`.
    - Adds `X-Request-Id`, `X-Correlation-Id`, OCPI `Token` auth.
    - Calls CPO with `sendGetRequest`.
    - Validates `OCPILocationResponse` envelope (must have `data`).
    - Persists via `LocationDbService.upsertFromOcpiLocation(payload.data)`.
    - Returns the mapped OCPI `Location` from DB via `mapPrismaLocationToOcpi`.

---

### Location DB Service – Responsibilities

File: `src/services/location-db.service.ts`.

- **`findByOcpiLocationId(locationId: string)`**
  - Looks up a non-deleted `Location` row where `ocpi_location_id` matches.
  - Includes `evses` and `evse_connectors`.

- **`upsertFromOcpiLocation(ocpiLocation: OCPILocation)`**
  - Finds existing `Location` by `(ocpi_location_id, country_code, party_id)`.
  - If exists:
    - Deletes its `EVSE` rows (and cascaded connectors via relations).
    - Updates the `Location` row.
  - If not:
    - Creates a new `Location` row.
  - Recreates EVSE + Connector tree from the OCPI data.
  - Returns `LocationWithRelations` (Location + EVSE + EVSEConnector[]).

- **`mapPrismaLocationToOcpi(location: LocationWithRelations)`**
  - Reconstructs a full OCPI `OCPILocation` object from DB rows, including:
    - Nested `evses` and `connectors`.
    - All relevant optional JSON/list fields.

---

### OCPI Version / Modules Summary (high level)

From shared spec excerpts and types:

- **OCPI 2.2.1 Modules of interest in this repo**
  - Versions: version discovery and module endpoints.
  - Credentials: platform registration and credentials exchange.
  - Locations: `Location`, `EVSE`, `Connector` objects and Sender/Receiver interfaces.
  - Sessions & CDRs: charging sessions and charge detail records.
  - Tariffs: tariff, tariff elements, price components.
  - Tokens: token objects and authorization flows.
  - Commands & ChargingProfiles: remote commands and smart-charging profiles (not yet implemented here, but present in spec).

- **Transport & Response format**
  - JSON/HTTP, bearer style `Token` auth, OCPI response envelope:
    - `data`, `status_code`, `status_message?`, `timestamp`.

---

### Environment Expectations

- `DATABASE_URL` – Prisma Postgres connection string.
- `OCPI_VERSION` – defaults to `2.2.1` (from `app.config.ts`).
- `OCPI_COUNTRY_CODE`, `OCPI_PARTY_ID` – OCPI party identifiers (from `app.config.ts`).
- `OCPI_CPO_AUTH_TOKEN` – CPO OCPI token used by outgoing requests.


