import { Context } from "../../../types/Context";

export type AppPublishResponsePayload = {
    context: Context;
    message: {
        results: {
            catalog_id: string;
            status: 'ACCEPTED' | 'REJECTED';
            item_count: number;
            warnings: {
                code: string;
                message: string;
            }[];
            errors?: {
                code: string;
                message: string;
                paths?: string[];
            }[];
        }[];
    };
};

