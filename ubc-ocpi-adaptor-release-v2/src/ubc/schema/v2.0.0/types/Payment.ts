import { AcceptedPaymentMethod } from "../enums/AcceptedPaymentMethod";
import { ObjectType } from "../enums/ObjectType";
import { BecknPaymentStatus } from "../enums/PaymentStatus";
import { BecknAmount } from "./Amount";

// Settlement account for BAP or BPP (v0.9)
export type SettlementAccount = {
    beneficiaryType: "BAP" | "BPP";
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    vpa?: string; // UPI VPA
};

// Payment settlement attributes (v0.9)
export type PaymentSettlement = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/PaymentSettlement/v1/context.jsonld"
    "@type": "PaymentSettlement";
    settlementAccounts: SettlementAccount[];
};

// Payment for init request (v0.9) - has paymentAttributes but no id/paymentURL/txnRef
export type BecknPaymentInit = {
    "@context": string;
    "@type": ObjectType.payment;
    "beckn:amount": BecknAmount;
    "beckn:beneficiary": string; // e.g. "BPP"
    "beckn:paymentStatus": BecknPaymentStatus; // e.g. "INITIATED"
    "beckn:paymentAttributes"?: PaymentSettlement;
};

// Full payment response (v0.9) - for on_init response
export type BecknPayment = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-v2/refs/heads/core-v2.0.0-rc/schema/core/v2/context.jsonld"
    "@type": ObjectType.payment;
    "beckn:id": string;
    "beckn:amount": BecknAmount;
    "beckn:paymentURL": string; // e.g. "https://payments.bluechargenet-aggregator.io/pay?transaction_id=$transaction_id&amount=$amount"
    "beckn:txnRef": string; // PSP/gateway/bank transaction reference
    "beckn:beneficiary": string; // e.g. "BPP"
    "beckn:acceptedPaymentMethod"?: AcceptedPaymentMethod[]; // e.g. ["BANK_TRANSFER", "UPI", "WALLET"]
    "beckn:paymentStatus": BecknPaymentStatus; // e.g. "INITIATED"
    "beckn:paidAt"?: string; // e.g. "2025-01-27T10:05:00Z"
    "beckn:paymentAttributes"?: PaymentSettlement; // v0.9: added settlement accounts
};

// Confirm payment (v0.9) - has paidAt for completed payment
export type BecknPaymentConfirm = {
    "@context": string;
    "@type": ObjectType.payment;
    "beckn:id": string;
    "beckn:amount": BecknAmount;
    "beckn:paymentURL": string;
    "beckn:txnRef": string;
    "beckn:paidAt"?: string;
    "beckn:beneficiary": string;
    "beckn:paymentStatus": BecknPaymentStatus;
};
