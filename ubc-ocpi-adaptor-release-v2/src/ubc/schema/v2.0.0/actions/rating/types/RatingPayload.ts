import { Context } from "../../../types/Context";
import { RatingCategory } from "../../../types/RatingCategory";


export type RatingFeedback = {
    comments?: string;
    tags?: string[];
};

export type UBCRatingRequestPayload = {
    context: Context,
    message: {
        id: string;
        value: number;
        best: number;
        worst: number;
        category: RatingCategory;
        feedback?: RatingFeedback;
    }
};

