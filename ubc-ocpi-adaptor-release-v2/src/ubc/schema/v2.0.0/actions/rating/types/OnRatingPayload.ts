import { Context } from "../../../types/Context";
import { FeedbackForm } from "../../../types/FeedbackForm";


export type RatingMessage = {
    received: boolean;
    feedbackForm?: FeedbackForm;
};

export type UBCOnRatingRequestPayload = {
    context: Context,
    message: RatingMessage,
};

