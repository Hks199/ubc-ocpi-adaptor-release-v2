import { FeedbackForm } from "../../../types/FeedbackForm";

export type SubmitRatingResponsePayload = {
    success: boolean;
    message?: string;
    feedbackForm?: FeedbackForm;
    session_id?: string; // Session ID to use as submission_id in feedbackForm
};

export type ExtractedOnRatingResponsePayload = {
    metadata: {
        domain: string;
    };
    payload: SubmitRatingResponsePayload;
};

