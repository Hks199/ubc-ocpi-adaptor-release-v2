import { BuyerFinderFeeEnum } from "../enums/BuyerFinderFeeEnum";

export type BuyerFinderFee = {
    feeType: BuyerFinderFeeEnum;
    feeValue: number;
}