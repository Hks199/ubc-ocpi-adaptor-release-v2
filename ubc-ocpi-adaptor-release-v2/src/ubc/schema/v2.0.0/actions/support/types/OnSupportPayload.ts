import { Support } from "../../../types/Support";
import { Context } from "../../../types/Context";

export type SupportFeedback = {
    "@context"?: string;
    "@type"?: string;
    supportStatus?: string;
    comments?: string;
};

export type OnSupportMessage = {
    support: Support;
    feedback?: SupportFeedback;
};

export type UBCOnSupportRequestPayload = {
    context: Context;
    message: OnSupportMessage;
    error?: any;
};

