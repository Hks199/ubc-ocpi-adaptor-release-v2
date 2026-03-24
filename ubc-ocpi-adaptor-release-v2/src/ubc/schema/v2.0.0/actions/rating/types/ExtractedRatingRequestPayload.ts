import { BecknRequestMetadata } from "../../select/types/ExtractedSelectRequestBody";
import { RatingCategory } from "../../../types/RatingCategory";

export type SubmitRatingRequestPayload = {
    location_id: string;
    rating: number;
    comments?: string;
    tags?: string[];
    auth_reference: string;
};

export type ExtractedRatingRequestPayload = {
    location_id: string;
    rating: number;
    comments: string;
    auth_reference: string;
    rating_category: RatingCategory;
    tags?: string[];
};

export type ExtractedRatingRequestBody = {
    metadata: BecknRequestMetadata;
    payload: ExtractedRatingRequestPayload;
};

