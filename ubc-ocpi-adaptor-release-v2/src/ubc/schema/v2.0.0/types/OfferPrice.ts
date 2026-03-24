// Price -- includes applicableQuantity type
export type BecknOfferPrice = {
    currency: string;
    value: number;
    applicableQuantity: {
        unitText: string;
        unitCode: string;
        unitQuantity: number;
    };
};

