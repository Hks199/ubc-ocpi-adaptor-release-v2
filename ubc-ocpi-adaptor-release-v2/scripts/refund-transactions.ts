/**
 * Generic script to manually refund payment transactions via Razorpay.
 *
 * Safety: Defaults to dry-run mode. Pass --execute to process real refunds.
 *
 * Usage:
 *   npx ts-node -P tsconfig.json scripts/refund-transactions.ts <txn_id_1> [txn_id_2] ...
 *   npx ts-node -P tsconfig.json scripts/refund-transactions.ts --execute <txn_id_1> [txn_id_2] ...
 *
 * Arguments:
 *   <txn_id>    One or more beckn_transaction_id values to refund
 *   --execute   Actually process refunds (default is dry-run)
 *
 * Environment:
 *   DATABASE_URL  Required. PostgreSQL connection string.
 */

import { databaseService } from '../src/services/database.service';
import PaymentTxnDbService from '../src/db-services/PaymentTxnDbService';
import RazorpayPaymentGatewayService from '../src/ubc/services/PaymentServices/Razorpay/index';
import { GenericPaymentTxnStatus } from '../src/types/BillDesk';

// Parse args
const args = process.argv.slice(2);
const isLive = args.includes('--execute');
const transactionIds = args.filter(a => !a.startsWith('--'));

if (transactionIds.length === 0) {
    console.error('Usage: npx ts-node -P tsconfig.json scripts/refund-transactions.ts [--execute] <beckn_transaction_id> ...');
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
}

async function refundTransaction(becknTransactionId: string): Promise<void> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Beckn Transaction ID: ${becknTransactionId}`);
    console.log('='.repeat(80));

    // 1. Find payment transaction by beckn_transaction_id
    const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
        where: { beckn_transaction_id: becknTransactionId },
    });

    if (!paymentTxn) {
        console.error(`  ERROR: Payment transaction not found for beckn_transaction_id: ${becknTransactionId}`);
        return;
    }

    console.log(`  Payment Txn ID:       ${paymentTxn.id}`);
    console.log(`  Auth Reference:       ${paymentTxn.authorization_reference}`);
    console.log(`  Amount Paid:          ₹${paymentTxn.amount}`);
    console.log(`  Status:               ${paymentTxn.status}`);
    console.log(`  Gateway Payment ID:   ${paymentTxn.payment_gateway_payment_id}`);
    console.log(`  Partner ID:           ${paymentTxn.partner_id}`);

    // 2. Validate current status
    if (paymentTxn.status === GenericPaymentTxnStatus.Refunded || paymentTxn.status === GenericPaymentTxnStatus.PartiallyRefunded) {
        console.log(`  SKIP: Already refunded (status: ${paymentTxn.status}).`);
        return;
    }

    const successStatuses = [GenericPaymentTxnStatus.Success, 'SUCCESS', 'COMPLETED'];
    if (!successStatuses.includes(paymentTxn.status)) {
        console.error(`  ERROR: Payment is not in successful status (current: ${paymentTxn.status}). Cannot refund.`);
        return;
    }

    if (!paymentTxn.payment_gateway_payment_id) {
        console.error(`  ERROR: No payment_gateway_payment_id found. Cannot process Razorpay refund.`);
        return;
    }

    // 3. Calculate refund amount
    const paidAmount = Number(paymentTxn.amount);
    let chargedAmount = 0;

    // Try to get session's final_amount if it exists
    const session = await databaseService.prisma.session.findFirst({
        where: { authorization_reference: paymentTxn.authorization_reference },
    });

    if (session?.final_amount && typeof session.final_amount === 'object') {
        const finalAmount = session.final_amount as Record<string, unknown>;
        if (finalAmount.total !== undefined && finalAmount.total !== null) {
            chargedAmount = Number(finalAmount.total);
        }
    }

    const refundAmount = paidAmount - chargedAmount;
    const refundAmountInPaise = Math.round(refundAmount * 100);

    console.log(`  Charged Amount:       ₹${chargedAmount.toFixed(2)}`);
    console.log(`  Refund Amount:        ₹${refundAmount.toFixed(2)} (${refundAmountInPaise} paise)`);

    if (refundAmount <= 0) {
        console.error(`  ERROR: Refund amount is ₹${refundAmount.toFixed(2)}. Nothing to refund.`);
        return;
    }

    if (!isLive) {
        console.log(`  [DRY RUN] Would refund ₹${refundAmount.toFixed(2)} via Razorpay for payment ${paymentTxn.payment_gateway_payment_id}`);
        return;
    }

    // 4. Process refund via Razorpay
    // We call createRefund with the INTERNAL payment_txn_id (UUID), not the Razorpay payment ID.
    // createRefund does getById() then uses payment_gateway_payment_id for the API call.
    console.log(`  Processing Razorpay refund...`);
    const refundResult = await RazorpayPaymentGatewayService.createRefund(
        paymentTxn.id,
        { amount: refundAmountInPaise },
    );

    if (!refundResult.success || !refundResult.refund) {
        console.error(`  ERROR: Refund failed - ${refundResult.error}`);
        if (refundResult.error_details) {
            console.error(`  Details:`, JSON.stringify(refundResult.error_details, null, 2));
        }
        return;
    }

    console.log(`  Refund ID:            ${refundResult.refund.id}`);
    console.log(`  Refund Status:        ${refundResult.refund.status}`);

    // 5. Update payment_txn status and store refund details
    const currentAdditionalProps = paymentTxn.additional_props as Record<string, unknown> | null;
    const updatedAdditionalProps = {
        ...(currentAdditionalProps || {}),
        refund: {
            refund_id: refundResult.refund.id,
            refund_status: refundResult.refund.status,
            refund_amount: refundAmount,
            charged_amount: chargedAmount,
            paid_amount: paidAmount,
            initiated_at: new Date().toISOString(),
            source: 'manual_script',
        },
    };

    await PaymentTxnDbService.update(paymentTxn.id, {
        additional_props: updatedAdditionalProps as any,
        status: GenericPaymentTxnStatus.Refunded,
    });

    console.log(`  Payment txn status updated to REFUNDED`);
    console.log(`  DONE`);
}

async function main(): Promise<void> {
    console.log(`Refund Script - ${isLive ? 'LIVE' : 'DRY RUN (pass --execute for live)'}`);
    console.log(`Date: ${new Date().toISOString()}`);
    console.log(`Transactions: ${transactionIds.length}`);

    try {
        await databaseService.connect();
        console.log('Database connected.');

        for (const txnId of transactionIds) {
            await refundTransaction(txnId);
        }
    }
    catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
    finally {
        await databaseService.disconnect();
        console.log('\nDatabase disconnected. Script complete.');
    }
}

main();
