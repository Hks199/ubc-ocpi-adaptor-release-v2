export default class GenericPaymentService {
    public static calculateGSTOnAmount(amount: number): number {
        const gstOnAmount = 2 * Math.round(9 * amount / 100);
        return Number(gstOnAmount.toFixed(2));
    }
}