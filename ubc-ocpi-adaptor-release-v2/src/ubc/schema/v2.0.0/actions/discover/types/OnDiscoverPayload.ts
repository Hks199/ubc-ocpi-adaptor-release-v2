import { BecknCatalog } from "../../../types/Catalog";
import { UBCDiscoverContext } from "./DiscoverContext";

// Response payload for on_discover action
export type UBCOnDiscoverResponsePayload = {
    context: UBCDiscoverContext;
    message: {
        catalogs: BecknCatalog[];
    };
};
