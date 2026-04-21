import { ObjectType } from "../enums/ObjectType";
import { BuyerFinderFee } from "./BuyerFinderFee";

// EV - OfferAttributes (ChargingOffer per provided context/type)
export type BecknOfferAttributes = {
    "@context": string; // context URL
    "@type": ObjectType.chargingOffer;
    buyerFinderFee?: BuyerFinderFee;
    /** UBC TSD order: currency, value, applicableQuantity */
    idleFeePolicy?: {
        currency: string;
        value: number;
        applicableQuantity: {
            unitCode: string;
            unitQuantity: number;
            unitText: string;
        };
    };
    tariffModel?: string;
    offerType?: string;
    discountPercentage?: number;
};

