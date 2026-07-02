# Payment Flow — Complete Guide

This document explains how payment works in the UBC OCPI Adaptor, including the full Beckn booking flow, how real Razorpay UPI payments are generated, and how a **fake/dummy payment URL** is used during UAT testing when no payment gateway is configured.

---

## Payment Flow Overview

```
User (via BAP)          UBC OCPI Adaptor (BPP)        Razorpay / CPO PG
      |                         |                            |
   search                       |                            |
   select ─────────────────────>|                            |
      |          on_select      |                            |
      |<─────────────────────── |                            |
      |                         |                            |
   init ────────────────────── >|                            |
      |    (booking intent)     |─── create payment txn ─── |
      |                         |                            |
      |                         |<─── payment_link ─────────|
      |<── on_init + paymentURL ─|                            |
      |                         |                            |
   [User pays via UPI link]     |                            |
      |                         |<─── payment webhook ──────|
      |                         |     (or UAT auto-complete)|
      |                         |                            |
      | ── status (or push) ───>|                            |
      |<─ on_status (COMPLETED) |                            |
      |                         |                            |
      | ──── confirm ───────── >|                            |
      |                         |─── StartSession → CPO     |
      |<── on_confirm ──────── ─|                            |
      |                         |                            |
   [Charger starts]             |                            |
      |                         |                            |
   [CPO sends CDR/Session end]  |                            |
      |<── on_status(COMPLETED) ─|                            |
```

---

## Step-by-Step Payment Flow

### Step 1 — `select` (User picks a connector and offer)

The BAP sends a `select` request when the user taps on a charger and selects a charging option (e.g., 10 kWh for ₹200).

**Beckn Action:** `POST /ubc/select`

**Request Body:**
```json
{
  "context": {
    "domain": "beckn.one:deg:ev-charging",
    "action": "select",
    "version": "2.0.0",
    "bap_id": "example-bap.com",
    "bap_uri": "https://example-bap.com/bap/receiver",
    "bpp_id": "uat-bpp-opci-adapter.ubc.nbsl.org.in",
    "bpp_uri": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/bpp/receiver",
    "transaction_id": "txn-abc-123",
    "message_id": "msg-def-456",
    "timestamp": "2026-07-01T06:00:00Z",
    "ttl": "PT30S"
  },
  "message": {
    "order": {
      "@context": "...",
      "@type": "beckn:EVChargingOrder",
      "beckn:orderItems": [
        {
          "beckn:orderedItem": "IND*TPC*i95OHf9ev*G9M6erpcu*C1",
          "beckn:quantity": {
            "unitCode": "KWH",
            "unitQuantity": 10
          }
        }
      ],
      "beckn:orderAttributes": {
        "buyerFinderFee": {
          "feeType": "percent",
          "feeValue": 0
        }
      }
    }
  }
}
```

**`on_select` Response (BPP → BAP):** The adaptor returns the quoted price, connector details, and available offers.

---

### Step 2 — `init` (User confirms booking and payment is created)

This is the most important payment step. When the BAP sends `init`, the adaptor:

1. Creates a **PaymentTxn** record in the database.
2. Generates a **UPI payment link** via Razorpay (or a dummy URL in UAT).
3. Returns the `on_init` response with the payment URL.

**Beckn Action:** `POST /ubc/init`

**Request Body:**
```json
{
  "context": {
    "domain": "beckn.one:deg:ev-charging",
    "action": "init",
    "version": "2.0.0",
    "bap_id": "example-bap.com",
    "bap_uri": "https://example-bap.com/bap/receiver",
    "bpp_id": "uat-bpp-opci-adapter.ubc.nbsl.org.in",
    "bpp_uri": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/bpp/receiver",
    "transaction_id": "txn-abc-123",
    "message_id": "msg-ghi-789",
    "timestamp": "2026-07-01T06:01:00Z",
    "ttl": "PT30S"
  },
  "message": {
    "order": {
      "@context": "...",
      "@type": "beckn:EVChargingOrder",
      "beckn:buyer": {
        "beckn:id": "usr-001",
        "beckn:displayName": "Ravi Kumar",
        "beckn:email": "ravi@example.com",
        "beckn:telephone": "+919876543210",
        "beckn:address": "123 MG Road, Bangalore",
        "beckn:taxID": "ABCDE1234F"
      },
      "beckn:orderItems": [
        {
          "beckn:orderedItem": "IND*TPC*i95OHf9ev*G9M6erpcu*C1",
          "beckn:quantity": {
            "unitCode": "KWH",
            "unitQuantity": 10
          }
        }
      ],
      "beckn:orderValue": {
        "currency": "INR",
        "value": 200,
        "components": [
          { "type": "UNIT", "value": 200 }
        ]
      },
      "beckn:payment": {
        "beckn:beneficiary": "BPP",
        "beckn:amount": { "currency": "INR", "value": 200 }
      }
    }
  }
}
```

**`on_init` Response (BPP → BAP):** Contains the payment URL for the user to pay.

```json
{
  "context": {
    "domain": "beckn.one:deg:ev-charging",
    "action": "on_init",
    ...
  },
  "message": {
    "order": {
      "beckn:id": "authorization-reference-uuid",
      "beckn:payment": {
        "beckn:id": "payment-txn-db-uuid",
        "beckn:amount": { "currency": "INR", "value": 200 },
        "beckn:beneficiary": "BPP",
        "beckn:paymentStatus": "INITIATED",
        "beckn:paymentURL": "https://rzp.io/l/ev-charge-abc123",
        "beckn:txnRef": "authorization-reference-uuid",
        "beckn:acceptedPaymentMethod": ["BANK_TRANSFER", "UPI", "WALLET"]
      }
    }
  }
}
```

---

### Step 2.5 — Payment Status Verification (`status` / `on_status`)

Before proceeding to `confirm`, the payment status must be verified. This can happen in two ways:

#### Option A: Unsolicited / Asynchronous `on_status` Callback (BPP → BAP)
Once the payment is completed (via webhook, synthetic UAT auto-completion, or scheduled callback), the adaptor proactively sends an unsolicited `on_status` request to the BAP to notify it that the payment status is now `COMPLETED`.

**Beckn Action:** `POST /ubc/on_status` (or forwarded to BAP receiver)

**Payload Example:**
```json
{
  "context": {
    "version": "2.0.0",
    "action": "on_status",
    "domain": "beckn.one:deg:ev-charging",
    "bap_id": "example-bap.com",
    "bap_uri": "https://example-bap.com/bap/receiver",
    "bpp_id": "uat-bpp-opci-adapter.ubc.nbsl.org.in",
    "bpp_uri": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/bpp/receiver",
    "transaction_id": "txn-abc-123",
    "message_id": "new-msg-uuid",
    "timestamp": "2026-07-01T06:02:00Z"
  },
  "message": {
    "order": {
      "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
      "@type": "beckn:Order",
      "beckn:id": "authorization-reference-uuid",
      "beckn:orderStatus": "PENDING",
      "beckn:seller": {
        "beckn:id": "IN*TPC"
      },
      "beckn:buyer": {
        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
        "@type": "beckn:Buyer",
        "beckn:id": "usr-001",
        "beckn:displayName": "Ravi Kumar",
        "beckn:email": "ravi@example.com",
        "beckn:telephone": "+919876543210"
      },
      "beckn:orderItems": [
        {
          "beckn:orderedItem": "IND*TPC*i95OHf9ev*G9M6erpcu*C1",
          "beckn:quantity": {
            "unitCode": "KWH",
            "unitQuantity": 10
          },
          "beckn:price": {
            "currency": "INR",
            "value": 200
          }
        }
      ],
      "beckn:orderValue": {
        "currency": "INR",
        "value": 200
      },
      "beckn:payment": {
        "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld",
        "@type": "beckn:Payment",
        "beckn:id": "payment-txn-db-uuid",
        "beckn:amount": { "currency": "INR", "value": 200 },
        "beckn:beneficiary": "BPP",
        "beckn:paymentStatus": "COMPLETED",
        "beckn:paymentURL": "https://rzp.io/l/ev-charge-abc123",
        "beckn:txnRef": "authorization-reference-uuid",
        "beckn:paidAt": "2026-07-01T06:01:50Z"
      }
    }
  }
}
```

#### Option B: Active Polling/Query `status` Request (BAP → BPP)
Alternatively, the BAP can actively poll the BPP to query the current status of the order and payment.

**Beckn Action:** `POST /ubc/status`

**Request Payload:**
```json
{
  "context": {
    "version": "2.0.0",
    "action": "status",
    "domain": "beckn.one:deg:ev-charging",
    "bap_id": "example-bap.com",
    "bap_uri": "https://example-bap.com/bap/receiver",
    "bpp_id": "uat-bpp-opci-adapter.ubc.nbsl.org.in",
    "bpp_uri": "https://uat-bpp-opci-adapter.ubc.nbsl.org.in/bpp/receiver",
    "transaction_id": "txn-abc-123",
    "message_id": "msg-xyz-987",
    "timestamp": "2026-07-01T06:02:10Z"
  },
  "message": {
    "order": {
      "beckn:id": "authorization-reference-uuid",
      "beckn:payment": {
        "beckn:txnRef": "authorization-reference-uuid",
        "beckn:beneficiary": "BPP"
      },
      "beckn:fulfillment": {
        "beckn:id": "fulfillment-authorization-reference-uuid"
      }
    }
  }
}
```

**BPP Response (`on_status`):**
In response to the `status` request, the BPP fetches the payment status from the `PaymentTxn` database and the connector/session status from the EVSE/Session databases, and returns an `on_status` payload containing:
1. `beckn:orderStatus`: Current state of the order (`PENDING`, `INPROGRESS`, `COMPLETED`, `CANCELLED` derived from the active session).
2. `beckn:payment.beckn:paymentStatus`: `COMPLETED` if paid, or `PENDING`/`INITIATED` if not yet paid.
3. `beckn:fulfillment.beckn:deliveryAttributes`: Contains the real-time `connectorStatus` and `sessionStatus`.

---

### Step 3 — `confirm` (User pays and confirms booking)

Once the BAP receives an `on_status` showing `"beckn:paymentStatus": "COMPLETED"`, it sends a `confirm` request to start the charging session.

**Beckn Action:** `POST /ubc/confirm`

**Request Body:**
```json
{
  "context": {
    "action": "confirm",
    "transaction_id": "txn-abc-123",
    "message_id": "msg-jkl-012",
    ...
  },
  "message": {
    "order": {
      "beckn:id": "authorization-reference-uuid",
      "beckn:payment": {
        "beckn:txnRef": "authorization-reference-uuid",
        "beckn:paymentStatus": "COMPLETED"
      }
    }
  }
}
```

**`on_confirm` Response:** Contains the session ID and charging start confirmation.

---

### Step 4 — `on_status(COMPLETED)` (Charging ends, billing complete)

After charging ends, the CPO sends a CDR (Charge Detail Record) to the adaptor. The adaptor then sends an `on_status` with `paymentStatus: COMPLETED` to the BAP.

---

## How the Fake / Dummy Payment URL Works (UAT Mode)

During UAT testing, you may not have real Razorpay credentials configured. In this case, the adaptor generates a **dummy payment URL** that looks like a real UPI link but does nothing:

```
https://pay.ubc.test/upi?ref=<authorization_reference>
```

### Logic Flow for Generating the Payment Link

```
init received
      |
      v
createPaymentTxnDetails()
      |
      v
generatePaymentLink()
      |
      +-- Is payment_service_provider = "CPO"?
      |        YES → call CPO's generate_payment_link URL
      |        NO  → use Razorpay
      |
      +-- Is Razorpay configured?
               YES → create Razorpay order → get real UPI link
               NO  → shouldUseSyntheticRazorpayWhenNoCredentials() = true
                         |
                         v
                   Use dummy URL:
                   https://pay.ubc.test/upi?ref=<uuid>
```

### How Auto-Status Works with Dummy URL

The adaptor detects when a dummy URL was used by checking `isUatBypassPaymentUrlForAutoStatus(paymentURL)`. When the dummy URL is detected:

1. Immediately after `on_init` is sent, the adaptor fires an `on_status(COMPLETED)` automatically.
2. This simulates the user having "paid" without going through a real payment gateway.
3. The `PaymentTxn` status is updated to `SUCCESS` in the database.
4. The session flow can continue normally to `confirm`.

```
init received
      |
      v
on_init sent (with dummy URL https://pay.ubc.test/upi?ref=abc)
      |
      | setImmediate (non-blocking)
      v
isUatBypassPaymentUrlForAutoStatus("https://pay.ubc.test/upi?ref=abc") = true
      |
      v
PaymentTxn updated to SUCCESS
      |
      v
on_status(COMPLETED) auto-sent to BAP
```

**Code Location:** `src/ubc/actions/handlers/InitActionHandler.ts` — `handleEVChargingUBCBppInitAction()`

---

## Payment with Real Razorpay

When `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are configured, the flow uses Razorpay to generate a real UPI payment link:

1. A Razorpay order is created with the amount in paise (INR × 100).
2. A UPI payment link is generated for the order.
3. The link is stored in `PaymentTxn.payment_link`.
4. After the user pays, Razorpay sends a **webhook** to the adaptor at `/internal/on-status/payment-completed/:authRef`.
5. The adaptor updates the `PaymentTxn` status and sends `on_status(COMPLETED)` to the BAP.

### Required Environment Variables for Razorpay

```bash
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-razorpay-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
```

### Manual Trigger (UAT without Webhook)

In UAT, if Razorpay is configured but webhooks are not, you can manually trigger the payment-completed status:

**Endpoint:** `POST /internal/on-status/payment-completed/:authRef`

```http
POST /internal/on-status/payment-completed/authorization-reference-uuid
```

This updates the `PaymentTxn` and triggers `on_status(COMPLETED)` to the BAP.

---

## Payment with CPO-Owned Payment Gateway

Some CPOs have their own payment system. When the partner is configured with `payment_service_provider: "CPO"`, the adaptor calls the CPO's own URL to generate a payment link.

**Configure in partner `additional_props` (PostgreSQL):**

```json
{
  "payment_service_provider": "CPO",
  "communication_urls": {
    "generate_payment_link": {
      "url": "https://cpo.example.com/payment/generate-link",
      "auth_token": "Bearer cpo-payment-api-token"
    }
  }
}
```

**Request the adaptor sends to the CPO:**

```http
POST https://cpo.example.com/payment/generate-link
Authorization: Bearer cpo-payment-api-token
Content-Type: application/json

{
  "amount": 200,
  "authorization_reference": "auth-ref-uuid"
}
```

**Expected CPO Response:**

```json
{
  "payment_link": "https://cpo.example.com/pay?ref=auth-ref-uuid",
  "authorization_reference": "auth-ref-uuid"
}
```

---

## Database Records Created During Payment Flow

| Table | When Created | Purpose |
|-------|-------------|---------|
| `PaymentTxn` | On `init` | Stores amount, payment link, status, and txn reference |
| `Session` | On `init` | Stores connector, energy, and buyer details for OCPI session |

**`PaymentTxn` Status Lifecycle:**

```
INITIATED → (user pays) → SUCCESS → (charging starts via confirm) → (CDR received from CPO)
```

---

## Automatic Callback for CPO Test Mode

For partners with `callback_on_status_api.enabled: true`, the adaptor can be configured to automatically send `on_status(COMPLETED)` after a fixed delay (configurable per-partner) without requiring a real Razorpay webhook:

```json
{
  "callback_on_status_api": {
    "enabled": true,
    "callback_time": 120
  }
}
```

- `callback_time`: Number of **seconds** to wait after `on_init` before sending `on_status(COMPLETED)`.
- This is useful for CPOs that have their own payment gateway but do not support real-time webhooks.

---

## Summary of All Payment Scenarios

| Scenario | How Payment Link Is Generated | How `on_status(COMPLETED)` Is Triggered |
|----------|------------------------------|----------------------------------------|
| **UAT (no credentials)** | Dummy URL `https://pay.ubc.test/upi?ref=...` | Automatically, immediately after `on_init` |
| **Razorpay (real)** | Real Razorpay UPI link | Razorpay webhook → `/internal/on-status/...` |
| **Razorpay (UAT, no webhook)** | Real Razorpay UPI link | Manual call to `/internal/on-status/...` |
| **CPO-owned PG** | CPO generates and returns link | CPO sends CDR via OCPI → adaptor auto-sends `on_status` |
| **CPO test mode** | Dummy URL | After `callback_time` seconds via `setTimeout` |

---

## How Payments are Settled with the CPO

Depending on the configuration of the CPO Partner, funds collected from the user are routed/given to the respected CPO via three primary mechanisms:

### 1. Settlement Accounts (`paymentAttributes`)
When the BAP requests an initialization, the BPP checks if a `settlement_account` is configured for the respective CPO partner in the database. If present, the BPP includes these details in the `on_init` response payload under `beckn:paymentAttributes.settlementAccounts`.

The BAP (consumer app) or the gateway network uses this information to route funds directly to the CPO's VPA or Bank Account.

#### Configure CPO Settlement Account (in partner `additional_props`):
```json
{
  "settlement_account": {
    "accountHolderName": "TPC Charging Network Pvt Ltd",
    "accountNumber": "987654321012",
    "ifscCode": "ICIC0001234",
    "bankName": "ICICI Bank",
    "vpa": "tpc@icici"
  }
}
```

### 2. CPO-Owned Payment Gateways
If the CPO is configured with `"payment_service_provider": "CPO"`, the payment link is generated by calling the CPO's own backend API. The user pays directly on the CPO's gateway, meaning the CPO receives 100% of the funds directly in real-time, eliminating the need for subsequent settlements.

### 3. Razorpay Settlement / Transfers (BPP Merchant Account)
If the BPP handles payment using its own Razorpay gateway:
1. Payments initially accumulate in the BPP's Razorpay Merchant account.
2. The BPP platform administrator settles funds with the CPOs offline (weekly/monthly) or automatically by using **Razorpay Route/Transfers** to split and route payouts directly to the CPO's linked bank account based on the transaction metadata.
