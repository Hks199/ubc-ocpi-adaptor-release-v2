/**
 * Final amount breakdown structure stored in session.final_amount
 * This represents the complete cost breakdown for a charging session
 */
export type FinalAmount = {
    charging_session_cost: number;
    gst: number;
    buyer_finder_fee: number;
    network_finder_fee: number;
    total: number;
    buyer_finder_cost_gst: number;
    network_finder_cost_gst: number;
};

