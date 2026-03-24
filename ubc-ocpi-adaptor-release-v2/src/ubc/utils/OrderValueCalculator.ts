import { BecknOrderValueResponse, BecknOrderValueComponents, GSTBreakup } from '../schema/v2.0.0/types/OrderValue';
import { OrderValueComponentsType } from '../schema/v2.0.0/enums/OrderValueComponentsType';
import { FinalAmount } from '../types/FinalAmount';
import { ServiceCharge } from '../types/ServiceCharge';
import { BuyerFinderFeeEnum } from '../schema/v2.0.0/enums/BuyerFinderFeeEnum';
import RazorpayPaymentGatewayService from '../services/PaymentServices/Razorpay';
import { BuyerFinderFee } from '../schema/v2.0.0/types/BuyerFinderFee';
import GenericPaymentService from '../services/PaymentServices/Generic';

// OCPIPrice type for CDR total_cost
type OCPIPrice = {
    excl_vat: number;
    incl_vat?: number;
};

/**
 * Calculates the final amount breakdown using the standard logic:
 * - charging_session_cost = provided input
 * - gst = provided input
 * - buyer_finder_fee = charging_session_cost * buyerFinderFeePercent%
 * - network_finder_fee = charging_session_cost * networkFinderFeePercent%
 * - total = charging_session_cost + gst + buyer_finder_fee + network_finder_fee
 * 
 * @param chargingSessionCost - Base charging session cost (excl VAT)
 * @param gst - GST amount
 * @param buyerFinderFeePercent - Buyer finder fee percentage (default: 0.9)
 * @param networkFinderFeePercent - Network finder fee percentage (default: 0.3)
 */
export function calculateFinalAmount(
    chargingSessionCost: number,
    gst: number,
    buyerFinderFee?: BuyerFinderFee,
    networkFinderFeePercent: number = 0.3
): FinalAmount {
    let buyerFinderCost: number = 0;
    let buyerFinderCostGST: number = 0;
    if (buyerFinderFee?.feeType === BuyerFinderFeeEnum.AMOUNT && buyerFinderFee.feeValue !== undefined && buyerFinderFee.feeValue >=0 ) {
        buyerFinderCost = buyerFinderFee.feeValue;
        buyerFinderCostGST = GenericPaymentService.calculateGSTOnAmount(buyerFinderCost);
    } 
    else if (buyerFinderFee?.feeType === BuyerFinderFeeEnum.PERCENTAGE && buyerFinderFee.feeValue !== undefined && buyerFinderFee.feeValue>=0) {
        buyerFinderCost = chargingSessionCost * (buyerFinderFee.feeValue / 100);
        buyerFinderCostGST = GenericPaymentService.calculateGSTOnAmount(buyerFinderCost);
    } 

    const networkFinderFee = chargingSessionCost * (networkFinderFeePercent / 100);
    const networkFinderCostGST = GenericPaymentService.calculateGSTOnAmount(networkFinderFee);
    const total = chargingSessionCost + gst + buyerFinderCost + networkFinderFee + networkFinderCostGST;

    return {
        charging_session_cost: Number(chargingSessionCost.toFixed(2)),
        gst: Number(gst.toFixed(2)),
        buyer_finder_fee: Number(buyerFinderCost.toFixed(2)),
        network_finder_fee: Number(networkFinderFee.toFixed(2)),
        total: Number(total.toFixed(2)),
        buyer_finder_cost_gst: Number(buyerFinderCostGST.toFixed(2)),
        network_finder_cost_gst: Number(networkFinderCostGST.toFixed(2)),
    };
}

/**
 * Builds order value response from final amount breakdown
 */
export function buildOrderValueFromFinalAmount(
    finalAmount: FinalAmount,
    currency: string,
    feePercentage: number = 0.2
): BecknOrderValueResponse & { gst_breakup: GSTBreakup } {
    const components: BecknOrderValueComponents[] = [];
    const gstBreakup: GSTBreakup = {};
    // Charging session cost
    components.push({
        type: OrderValueComponentsType.UNIT,
        value: finalAmount.charging_session_cost,
        currency: currency,
        description: 'Charging session cost',
    });

    // Buyer finder fee
    if (finalAmount.buyer_finder_fee > 0) {
    components.push({
        type: OrderValueComponentsType.FEE,
        value: finalAmount.buyer_finder_fee,
            currency: currency,
            description: 'Buyer finder fee',
        });

        gstBreakup.gst_on_buyer_finder_fee = Number((finalAmount.buyer_finder_cost_gst).toFixed(2));
    }

    // Network finder fee
    if (finalAmount.network_finder_fee > 0) {
    components.push({
        type: OrderValueComponentsType.FEE,
        value: finalAmount.network_finder_fee,
        currency: currency,
        description: 'Network finder fee',
        });

        gstBreakup.gst_on_network_finder_fee = Number((finalAmount.network_finder_cost_gst).toFixed(2));
    }

    // GST

    const { feeAmount, gstOnFeeAmount } = RazorpayPaymentGatewayService.upiIntentFee(finalAmount.total * 100, feePercentage);

    const paymentProcessingFee = Number((feeAmount / 100).toFixed(2));
    gstBreakup.gst_on_pg_processing_fee = Number((gstOnFeeAmount / 100).toFixed(2));
    gstBreakup.charging_session_cost = Number((finalAmount.gst).toFixed(2));

    const combinedGST = (gstBreakup?.charging_session_cost || 0) + (gstBreakup?.gst_on_buyer_finder_fee || 0) + (gstBreakup?.gst_on_network_finder_fee || 0) + (gstBreakup?.gst_on_pg_processing_fee || 0);
    const GSTOnServices = (gstBreakup?.gst_on_buyer_finder_fee || 0) + (gstBreakup?.gst_on_network_finder_fee || 0) + (gstBreakup?.gst_on_pg_processing_fee || 0);

    components.push({
        type: OrderValueComponentsType.TAX,
        value: combinedGST,
        currency: currency,
        description: 'GST',
    });

    components.push({
        type: OrderValueComponentsType.FEE,
        value: paymentProcessingFee,
        currency: currency,
        description: 'Payment processing fee',
    });

    return {
        currency: currency,
        value: (Math.round(finalAmount.total * 100) + Math.round(paymentProcessingFee * 100) + Math.round(GSTOnServices * 100)) / 100,
        components: components,
        gst_breakup: gstBreakup as GSTBreakup,
    };
}

/**
 * Calculates final amount from CDR total_cost (OCPIPrice format)
 * Optionally accepts service charge percentages from payment_txn
 */
export function calculateFinalAmountFromCDR(
    totalCost: OCPIPrice,
    serviceCharge?: ServiceCharge | null,
): FinalAmount {
    const chargingSessionCost = totalCost.excl_vat;
    const gst = totalCost.incl_vat ? (totalCost.incl_vat - totalCost.excl_vat) : 0;
    return calculateFinalAmount(chargingSessionCost, gst, serviceCharge?.buyer_finder_fee, serviceCharge?.network_fee);
}

