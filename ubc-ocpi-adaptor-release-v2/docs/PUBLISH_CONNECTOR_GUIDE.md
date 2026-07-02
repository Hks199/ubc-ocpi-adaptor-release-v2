# Publishing Connectors to CDS — Complete Guide

Once the CPO connection is established and locations are synced into the database, the next step is to **publish the connector catalog to the CDS (Central Data Service)**. The CDS is the Beckn gateway registry — it holds the catalog of all available EV chargers that BAP (consumer apps) can discover and book.

---

## What Is a Catalog Publish?

When a user opens their Beckn-compatible EV charging app and searches for nearby chargers, the BAP queries the CDS. The CDS returns catalogs that have been previously published by BPPs (like this adaptor). Each catalog contains:

- Charging station location (address, GPS co-ordinates)
- EVSE details (charger type, power rating, connector type)
- Tariff information (price per kWh)
- Availability windows (when the charger is available)

```
CDS (Discovery Registry)
       ^
       | catalog_publish
       |
UBC OCPI Adaptor (BPP)
       |
       | reads data from DB
       |
PostgreSQL (locations, tariffs synced from CPO)
```

---

## Prerequisites

Before publishing, make sure:

1. The CPO connection is complete (see `CPO_CONNECTION_GUIDE.md`).
2. The CPO has pushed at least one **location** and **tariff** to the adaptor's OCPI endpoints.
3. The environment variable `ENABLE_CATALOG_PUBLISH` is set to `"true"` in your `.env` or `docker-compose.yml`.

```yaml
# docker-compose.yml or .env
ENABLE_CATALOG_PUBLISH=true
```

> If `ENABLE_CATALOG_PUBLISH=false` (the default in UAT), publish calls are **silently skipped** without any error. Set it to `true` to actually send data to CDS.

---

## Step 1 — Verify Locations Are in the Database

Before publishing, confirm the CPO has synced at least one location.

**Endpoint:** `GET /api/admin/locations`

```http
GET /api/admin/locations?partner_id=30bec697-88f4-4f26-a31c-07208127abda
```

You should see a list of locations with EVSEs and connectors. Each connector will have a `beckn_connector_id` field that looks like `IND*TPC*i95OHf9ev*G9M6erpcu*C1`.

---

## Step 2 — Publish the Catalog

The publish API translates the CPO's location data from the database into a Beckn catalog payload and sends it to the CDS via the BPP ONIX service.

**Endpoint:** `POST /api/app/publish`

```http
POST /api/app/publish
Content-Type: application/json
```

### Option A — Publish all connectors for a partner (most common)

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda"
}
```

### Option B — Publish specific locations only

```json
{
  "ocpi_location_ids": ["LOC001", "LOC002"]
}
```

### Option C — Publish specific EVSEs only

```json
{
  "evse_ids": ["EVSE001", "EVSE002"]
}
```

### Option D — Publish with full control

```json
{
  "partner_id": "30bec697-88f4-4f26-a31c-07208127abda",
  "accepted_payment_methods": ["UPI", "BANK_TRANSFER", "WALLET"],
  "isActive": true,
  "validity": {
    "start": "2026-01-01T00:00:00Z",
    "end": "2026-12-31T23:59:59Z"
  },
  "availability_windows": [
    {
      "start_time": "2026-07-01T00:00:00Z",
      "end_time": "2026-07-08T23:59:59Z"
    }
  ]
}
```

**Field Descriptions:**

| Field | Required | Description |
|-------|----------|-------------|
| `partner_id` | One of the four | Publish all connectors for this CPO partner. |
| `ocpi_location_ids` | One of the four | Publish specific OCPI location IDs. |
| `evse_ids` | One of the four | Publish specific EVSE UIDs. |
| `connector_ids` | One of the four | Publish specific internal connector IDs. |
| `accepted_payment_methods` | Optional | Defaults to `["UPI", "BANK_TRANSFER", "WALLET"]`. |
| `isActive` | Optional | Whether the catalog item is marked as active. Defaults to `true`. |
| `validity.start` | Optional | Catalog validity start date. Defaults to today. |
| `validity.end` | Optional | Catalog validity end date. Defaults to 1 year from now. |
| `availability_windows` | Optional | Override time windows when the charger is available. If omitted, calculated automatically from the OCPI opening hours stored in the database (7-day rolling window). |

### Successful Response

```json
{
  "success": true,
  "message": "Catalog published successfully",
  "data": {
    "bpp_id": "uat-bpp-opci-adapter.ubc.nbsl.org.in",
    "bpp_uri": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/bpp/receiver",
    "item_count": 3,
    "locations_published": 1
  }
}
```

---

## What the Publish Payload Looks Like (Internal)

When the adaptor publishes to the CDS, it sends a payload in this format. Understanding this helps you debug discovery issues.

```json
{
  "context": {
    "version": "2.0.0",
    "action": "publish",
    "timestamp": "2026-07-01T06:00:00.000Z",
    "message_id": "a1b2c3d4-...",
    "transaction_id": "e5f6g7h8-...",
    "bpp_id": "uat-bpp-opci-adapter.ubc.nbsl.org.in",
    "bpp_uri": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/bpp/receiver",
    "ttl": "PT30S"
  },
  "message": {
    "catalogs": [
      {
        "@context": "...",
        "@type": "beckn:Catalog",
        "beckn:seller": "IN*TPC",
        "beckn:items": [
          {
            "@context": "...",
            "@type": "beckn:ChargingServiceItem",
            "beckn:id": "IND*TPC*i95OHf9ev*G9M6erpcu*C1",
            "beckn:isActive": true,
            "beckn:descriptor": {
              "beckn:name": "Charger A — Type2",
              "beckn:shortDesc": "22 kW AC Fast Charger"
            },
            "beckn:itemAttributes": {
              "connectorType": "Type2",
              "maxPowerKW": 22,
              "chargerType": "AC"
            },
            "beckn:location": {
              "beckn:gps": "12.9716,77.5946",
              "beckn:address": "123 MG Road, Bangalore",
              "beckn:city": "Bangalore",
              "beckn:state": "Karnataka",
              "beckn:country": "India",
              "beckn:areaCode": "560001"
            },
            "beckn:availabilityWindows": [
              {
                "start_time": "2026-07-01T00:00:00.000Z",
                "end_time": "2026-07-07T23:59:59.000Z"
              }
            ],
            "beckn:offers": [
              {
                "@type": "beckn:ChargingOffer",
                "beckn:offerType": "UNIT",
                "beckn:price": {
                  "currency": "INR",
                  "value": 20,
                  "applicableQuantity": {
                    "unitCode": "KWH",
                    "unitQuantity": 1
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## How Availability Windows Are Calculated

The adaptor automatically calculates a **7-day rolling availability window** for each connector based on the opening hours stored in the database (synced from the CPO):

- **24/7 charger:** A single window from today 00:00 to 7 days from now 23:59.
- **Fixed hours (e.g. 8am–10pm):** The system calculates one window per day for the next 7 days matching those hours.
- **No hours configured:** Same as 24/7 — assumes always available.
- **Reservation exclusion:** When a user initiates a booking (`/init`), the adaptor automatically re-publishes with the connector's availability window split to exclude the booking period (usually 2 minutes). This prevents double-booking.

---

## Automatic Publish Triggers

The adaptor automatically re-publishes the catalog in these situations — you do not need to call the API manually:

| Trigger | When | Why |
|---------|------|-----|
| `init` received | User starts booking | Marks connector as reserved for 2 minutes |
| Session COMPLETED | Charging finishes | Marks connector as available again |
| CDR received from CPO | After billing | Marks connector as available |

---

## CDS Callback — `on_catalog_publish`

After the CDS processes the publish request, it calls back to the adaptor at:

```
POST /bpp/receiver/on_catalog_publish
```

Or equivalently at `/ubc/on_catalog_publish`. The adaptor receives this and logs the result. A `status: "ACCEPTED"` response means the catalog is live on the CDS and discoverable by BAPs.

```json
{
  "context": { "action": "on_catalog_publish", ... },
  "message": {
    "ack": { "status": "ACK" }
  }
}
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "No locations found" | No locations in DB | Ensure CPO pushed locations via OCPI |
| Publish silently skipped | `ENABLE_CATALOG_PUBLISH=false` | Set env var to `true` |
| CDS returns `REJECTED` | Invalid catalog schema | Check connector type, tariff, and GPS fields are populated |
| Connectors not discoverable | CDS not receiving publish | Check `ONIX_BPP_PLUGIN_URL` is correctly pointed to your ONIX BPP service |
| Double-booking possible | Reservation re-publish failing | Check logs for "publish with reservation" errors |
