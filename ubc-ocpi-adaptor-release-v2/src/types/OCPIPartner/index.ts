import { RazorpayCredentials } from '../Razorpay';

export enum PaymentServiceProvider {
    Razorpay = 'RAZORPAY',
    CPO = 'CPO',
}

export interface SettlementAccount {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    vpa: string;
}

export type OCPIPartnerAdditionalProps = {
    communication_urls?: {
        generate_payment_link?: {
            url: string;
            auth_token: string;
        };
        submit_rating?: {
            url: string;
            auth_token: string;
        };
        webhook_callback?: {
            url: string;
        };
    };
    support?: {
        name: string;
        phone: string;
        email: string;
        url: string;
        hours: string;
        channels: string[];
    };
    payment_service_provider?: PaymentServiceProvider;
    payment_services?: {
        Razorpay?: RazorpayCredentials;
    };
    callback_on_status_api?: {
        enabled: boolean;
        callback_time: number; // seconds
    };
    beneficiary?: "BPP" | "BAP";
    settlement_account?: SettlementAccount; // BPP settlement account for paymentAttributes
    mock_rating_request?: boolean; // If true, mock the rating response instead of calling backend,
    test_mode?: boolean; // If true, the partner is in test mode
    stop_charging_delay?: number; // If true, the partner is in test mode
    ubc_party_id?: string; // UBC party ID // TPC
};
