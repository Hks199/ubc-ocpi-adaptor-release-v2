# Tariff API - cURL Examples

This document contains all working cURL commands for tariff operations.

**Note:** There are two sets of endpoints:
1. **OCPI Standard Endpoints** (`/ocpi/tariffs`) - OCPI 2.2.1 compliant endpoints for external OCPI communication
2. **Internal API Endpoints** (`/api/ocpi/tariffs`) - Internal API endpoints for administrative operations

---

## OCPI Standard Endpoints (from `ocpi-router.ts`)

These endpoints follow the OCPI 2.2.1 specification and are mounted at `/ocpi/tariffs`.

**Base URL:** `http://localhost:6001/ocpi`

### Authentication
All OCPI standard endpoints require OCPI authentication:
```bash
--header 'Authorization: Token your-ocpi-token-here'
```

---

## Internal API Endpoints

These endpoints are for internal use and administrative operations, mounted at `/api/ocpi/tariffs`.

**Base URL:** `http://localhost:6001/api/ocpi`

---

# OCPI Standard Endpoints

## OCPI 1. Get All Tariffs (OCPI Standard)

Returns all tariffs stored in the database. This is the OCPI 2.2.1 compliant endpoint.

### Endpoint
```
GET /ocpi/tariffs
```

### cURL Command
```bash
curl --location 'http://localhost:6001/ocpi/tariffs' \
  --header 'Authorization: Token your-ocpi-token-here'
```

### With Query Parameters (Pagination & Filtering)
```bash
# With limit and offset
curl --location 'http://localhost:6001/ocpi/tariffs?limit=10&offset=0' \
  --header 'Authorization: Token your-ocpi-token-here'

# With country_code and party_id filter
curl --location 'http://localhost:6001/ocpi/tariffs?country_code=US&party_id=ABC' \
  --header 'Authorization: Token your-ocpi-token-here'

# With date filtering
curl --location 'http://localhost:6001/ocpi/tariffs?date_from=2024-01-01T00:00:00Z&date_to=2024-12-31T23:59:59Z' \
  --header 'Authorization: Token your-ocpi-token-here'
```

### Response Format
```json
{
  "data": [
    {
      "country_code": "US",
      "party_id": "ABC",
      "id": "tariff-001",
      "currency": "USD",
      "type": "REGULAR",
      "elements": [...],
      "last_updated": "2024-01-01T00:00:00Z"
    }
  ],
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## OCPI 2. Get Single Tariff (OCPI 2.2.1 Compliant)

Returns a single tariff using OCPI 2.2.1 compliant URL format with `country_code` and `party_id` in the path.

### Endpoint
```
GET /ocpi/tariffs/:country_code/:party_id/:tariff_id
```

### cURL Command
```bash
curl --location 'http://localhost:6001/ocpi/tariffs/US/ABC/tariff-001' \
  --header 'Authorization: Token your-ocpi-token-here'
```

### Response Format
```json
{
  "data": {
    "country_code": "US",
    "party_id": "ABC",
    "id": "tariff-001",
    "currency": "USD",
    "type": "REGULAR",
    "elements": [...],
    "last_updated": "2024-01-01T00:00:00Z"
  },
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## OCPI 3. Put Tariff (OCPI 2.2.1 Compliant)

Creates or updates a tariff using OCPI 2.2.1 compliant URL format.

### Endpoint
```
PUT /ocpi/tariffs/:country_code/:party_id/:tariff_id
```

### cURL Command
```bash
curl --location --request PUT 'http://localhost:6001/ocpi/tariffs/US/ABC/tariff-001' \
  --header 'Authorization: Token your-ocpi-token-here' \
  --header 'Content-Type: application/json' \
  --data '{
    "country_code": "US",
    "party_id": "ABC",
    "id": "tariff-001",
    "currency": "USD",
    "elements": [
      {
        "price_components": [
          {
            "type": "ENERGY",
            "price": 0.20,
            "vat": 18,
            "step_size": 1
          }
        ]
      }
    ],
    "last_updated": "2024-01-01T00:00:00Z"
  }'
```

### Response Format
```json
{
  "data": {
    "country_code": "US",
    "party_id": "ABC",
    "id": "tariff-001",
    "currency": "USD",
    "elements": [...],
    "last_updated": "2024-01-01T00:00:00Z"
  },
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Note:** Returns HTTP 201 (Created) for new tariffs, HTTP 200 (OK) for updates.

---

# Internal API Endpoints

## 1. Get All Tariffs from Database

Returns all tariffs stored in the database.

### Endpoint
```
GET /api/ocpi/tariffs
```

### cURL Command
```bash
curl --location 'http://localhost:6001/api/ocpi/tariffs'
```

### With Query Parameters (Pagination & Filtering)
```bash
# With limit and offset
curl --location 'http://localhost:6001/api/ocpi/tariffs?limit=10&offset=0'

# With country_code and party_id filter
curl --location 'http://localhost:6001/api/ocpi/tariffs?country_code=US&party_id=ABC'

# With date filtering
curl --location 'http://localhost:6001/api/ocpi/tariffs?date_from=2024-01-01T00:00:00Z&date_to=2024-12-31T23:59:59Z'

# Combined filters
curl --location 'http://localhost:6001/api/ocpi/tariffs?country_code=US&party_id=ABC&limit=10&offset=0&date_from=2024-01-01T00:00:00Z'
```

### Response Format
```json
{
  "data": [
    {
      "country_code": "US",
      "party_id": "ABC",
      "id": "tariff-001",
      "currency": "USD",
      "type": "REGULAR",
      "elements": [...],
      "last_updated": "2024-01-01T00:00:00Z"
    }
  ],
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 2. Get Single Tariff from Database

Returns a single tariff by tariff_id from the database.

### Endpoint
```
GET /api/ocpi/tariffs/:tariff_id
```

### cURL Command
```bash
# Basic request
curl --location 'http://localhost:6001/api/ocpi/tariffs/tariff-001'
```

### With Query Parameters (country_code and party_id for precise lookup)
```bash
curl --location 'http://localhost:6001/api/ocpi/tariffs/tariff-001?country_code=US&party_id=ABC'
```

### Response Format
```json
{
  "data": {
    "country_code": "US",
    "party_id": "ABC",
    "id": "tariff-001",
    "currency": "USD",
    "type": "REGULAR",
    "elements": [...],
    "last_updated": "2024-01-01T00:00:00Z"
  },
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 3. Get Single Tariff (OCPI 2.2.1 Compliant Format)

Returns a single tariff using OCPI 2.2.1 compliant URL format with country_code and party_id in the path.

### Endpoint
```
GET /api/ocpi/tariffs/:country_code/:party_id/:tariff_id
```

### cURL Command
```bash
curl --location 'http://localhost:6001/api/ocpi/tariffs/US/ABC/tariff-001'
```

### Response Format
```json
{
  "data": {
    "country_code": "US",
    "party_id": "ABC",
    "id": "tariff-001",
    "currency": "USD",
    "type": "REGULAR",
    "elements": [...],
    "last_updated": "2024-01-01T00:00:00Z"
  },
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 4. Fetch Tariffs from CPO (Outgoing Request)

Fetches all tariffs from the CPO, stores them in the database, and returns the OCPI payload.

### Endpoint
```
POST /api/ocpi/tariffs/fetch
```

### cURL Command
```bash
# Basic request
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/fetch'
```

### With Query Parameters (Pagination & Filtering)
```bash
# With limit and offset
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/fetch?limit=10&offset=0'

# With date filtering
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/fetch?date_from=2024-01-01T00:00:00Z&date_to=2024-12-31T23:59:59Z'

# With country_code and party_id filter
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/fetch?country_code=US&party_id=ABC'

# Combined filters
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/fetch?limit=10&offset=0&date_from=2024-01-01T00:00:00Z&country_code=US&party_id=ABC'
```

### Response Format
```json
{
  "data": [
    {
      "country_code": "US",
      "party_id": "ABC",
      "id": "tariff-001",
      "currency": "USD",
      "type": "REGULAR",
      "elements": [...],
      "last_updated": "2024-01-01T00:00:00Z"
    }
  ],
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Note:** This endpoint fetches tariffs from the CPO and automatically stores them in the database.

---

## 5. Fetch Single Tariff from CPO (Outgoing Request)

Fetches a single tariff from the CPO (if not in database), stores it, and returns the OCPI payload.

### Endpoint
```
POST /api/ocpi/tariffs/:tariff_id/fetch
```

### cURL Command
```bash
# Basic request
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/tariff-001/fetch'
```

### With Query Parameters (country_code and party_id for precise lookup)
```bash
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/tariff-001/fetch?country_code=US&party_id=ABC'
```

### Response Format
```json
{
  "data": {
    "country_code": "US",
    "party_id": "ABC",
    "id": "tariff-001",
    "currency": "USD",
    "type": "REGULAR",
    "elements": [...],
    "last_updated": "2024-01-01T00:00:00Z"
  },
  "status_code": 1000,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Note:** This endpoint first checks the database cache. If the tariff is not found, it fetches from the CPO and stores it in the database.

---

## Query Parameters Reference

### Common Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `limit` | number | Maximum number of results to return | `?limit=10` |
| `offset` | number | Number of results to skip (for pagination) | `?offset=0` |
| `country_code` | string | Filter by country code (ISO 3166-1 alpha-2) | `?country_code=US` |
| `party_id` | string | Filter by party ID | `?party_id=ABC` |
| `date_from` | string | Filter tariffs updated from this date (ISO 8601) | `?date_from=2024-01-01T00:00:00Z` |
| `date_to` | string | Filter tariffs updated until this date (ISO 8601) | `?date_to=2024-12-31T23:59:59Z` |

---

## Response Status Codes

| Status Code | Description |
|-------------|-------------|
| `1000` | Success |
| `2000` | Client error (e.g., invalid request) |
| `2001` | Unauthorized |
| `2003` | Not found |
| `3000` | Server error |

---

## Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "path": "/api/ocpi/tariffs"
}
```

---

## Notes

### OCPI Standard Endpoints (`/ocpi/tariffs`)
1. **Authentication**: All endpoints require OCPI authentication with `Authorization: Token <token>` header.
2. **OCPI 2.2.1 Compliance**: These endpoints strictly follow the OCPI 2.2.1 specification.
3. **Routes Available**:
   - `GET /ocpi/tariffs` - Get all tariffs
   - `GET /ocpi/tariffs/:country_code/:party_id/:tariff_id` - Get single tariff
   - `PUT /ocpi/tariffs/:country_code/:party_id/:tariff_id` - Create or update tariff
4. **Implementation**: Defined in `src/ocpi/ocpi-router.ts` (lines 114-123)

### Internal API Endpoints (`/api/ocpi/tariffs`)
1. **Incoming Endpoints** (GET): These endpoints return data from the local database only.
2. **Outgoing Endpoints** (POST /fetch): These endpoints fetch data from the CPO and store it in the database.
3. **Authentication**: Currently, the endpoints use `ocpiApiAuth` middleware which allows all requests. In production, you may want to add proper authentication.
4. **OCPI 2.2.1 Compliance**: The route `/tariffs/:country_code/:party_id/:tariff_id` follows the OCPI 2.2.1 specification exactly.
5. **Pagination**: When using `limit`, the response may include a `Link` header for pagination navigation.

---

## Example Workflow

### 1. Fetch tariffs from CPO and store in database
```bash
curl --location --request POST 'http://localhost:6001/api/ocpi/tariffs/fetch'
```

### 2. Get all stored tariffs from database
```bash
curl --location 'http://localhost:6001/api/ocpi/tariffs'
```

### 3. Get a specific tariff
```bash
curl --location 'http://localhost:6001/api/ocpi/tariffs/tariff-001'
```

### 4. Get a specific tariff using OCPI 2.2.1 compliant format
```bash
curl --location 'http://localhost:6001/api/ocpi/tariffs/US/ABC/tariff-001'
```

---

## Testing with Headers

### OCPI Standard Endpoints
```bash
curl --location 'http://localhost:6001/ocpi/tariffs' \
  --header 'Authorization: Token your-ocpi-token-here' \
  --header 'Content-Type: application/json'
```

### Internal API Endpoints
```bash
curl --location 'http://localhost:6001/api/ocpi/tariffs' \
  --header 'Content-Type: application/json'
```

**Note:** OCPI standard endpoints require `Authorization: Token <token>` header, while internal API endpoints currently allow all requests (authentication can be added in production).

