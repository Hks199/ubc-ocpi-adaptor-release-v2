import { Support } from "../../../types/Support";
import { Context } from "../../../types/Context";

// v0.9: OnSupport message with simplified support object (no @context/@type)
export type OnSupportMessage = {
    support: Support
};

export type UBCOnSupportRequestPayload = {
    context: Context,
    message: OnSupportMessage,
};

