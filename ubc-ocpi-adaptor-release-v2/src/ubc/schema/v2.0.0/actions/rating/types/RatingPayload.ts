import { Context } from "../../../types/Context";
import { RatingCategory } from "../../../types/RatingCategory";


export type RatingFeedback = {
    comments?: string;
    tags?: string[];
};

/**
 * Beckn v2 style rating line (e.g. `beckn:RatingInput` in `message.ratings[]`).
 */
export type BecknRatingInput = {
    "@context"?: string;
    "@type"?: string;
    id?: string;
    ratingValue?: number;
    bestRating?: number;
    worstRating?: number;
    category?: string;
    feedback?: RatingFeedback;
};

/**
 * Legacy flat `message` (adaptor-internal) and/or Beckn `ratings` array.
 */
export type UBCRatingRequestMessage = {
    id?: string;
    value?: number;
    best?: number;
    worst?: number;
    category?: RatingCategory | string;
    feedback?: RatingFeedback;
    ratings?: BecknRatingInput[];
};

export type UBCRatingRequestPayload = {
    context: Context,
    message: UBCRatingRequestMessage,
};
