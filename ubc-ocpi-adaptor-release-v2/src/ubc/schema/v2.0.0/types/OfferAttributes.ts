import { ObjectType } from "../enums/ObjectType";
import { BuyerFinderFee } from "./BuyerFinderFee";

// EV - OfferAttributes (ChargingOffer per provided context/type)
export type BecknOfferAttributes = {
    "@context": string; // context URL
    "@type": ObjectType.chargingOffer;
    buyerFinderFee?: BuyerFinderFee;
    idleFeePolicy?: {
        applicableQuantity: {
            unitCode: string;
            unitQuantity: number;
            unitText: string;
        };
        currency: string;
        value: number;
    };
    tariffModel?: string;
    offerType?: string;
    discountPercentage?: number;
};

