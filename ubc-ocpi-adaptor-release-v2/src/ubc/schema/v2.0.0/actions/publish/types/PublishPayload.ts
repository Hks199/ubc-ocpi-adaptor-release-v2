import { BecknCatalog } from "../../../types/Catalog";
import { Context } from "../../../types/Context";


export type UBCPublishRequestPayload = {
    context: Context;
    message: {
        catalogs: BecknCatalog[];
    };
    error?: Record<string, never>;
};

