import { logger } from '../../../services/logger.service';
import { SessionDbService } from '../../../db-services/SessionDbService';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import CancelActionHandler from '../../actions/handlers/CancelActionHandler';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { BecknPaymentStatus } from '../../schema/v2.0.0/enums/PaymentStatus';
import { Session } from '@prisma/client';
import { GenericPaymentTxnStatus } from '../../../types/Payment';

/**
 * Auto Cancellation Cron Service
 * Processes auto cancellation for sessions that were completed 30-60 minutes ago
 * based on payment status
 */
export class AutoCancellationCronService {
    /**
     * Process auto cancellation for sessions completed 30-60 minutes ago
     */
    public static async processAutoCancellation(): Promise<void> {
        try {
            const now = new Date();
            const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

            logger.debug('🔍 AutoCancellationCron: Fetching sessions', {
                data: {
                    from: sixtyMinutesAgo.toISOString(),
                    to: thirtyMinutesAgo.toISOString(),
                },
            });

            // Fetch sessions with status COMPLETED from 30-60 minutes ago
            const sessionsResult = await SessionDbService.getByFilters(
                {
                    where: {
                        status: ChargingSessionStatus.PENDING,
                        deleted: false,
                        updated_at: {
                            gte: sixtyMinutesAgo,
                            lte: thirtyMinutesAgo,
                        },
                    },
                },
                0,
                0,
                false
            );

            const sessions = sessionsResult.records || [];

            if (sessions.length === 0) {
                logger.debug('✅ AutoCancellationCron: No sessions found to process');
                return;
            }

            logger.info(`📋 AutoCancellationCron: Found ${sessions.length} session(s) to process`);

            let processedCount = 0;
            let successCount = 0;
            let cancelledCount = 0;
            let errorCount = 0;

            for (const session of sessions) {
                try {
                    processedCount++;
                    await this.processSession(session);
                    
                    // Determine if it was auto-cancelled or payment was cancelled
                    const paymentTxn = await PaymentTxnDbService.getByAuthorizationReference(
                        session.authorization_reference || ''
                    );
                    
                    if (paymentTxn?.status === BecknPaymentStatus.CANCELLED) {
                        cancelledCount++;
                    }
                    else {
                        successCount++;
                    }
                }
                catch (error) {
                    errorCount++;
                    logger.error(
                        `❌ AutoCancellationCron: Error processing session ${session.id}`,
                        error instanceof Error ? error : undefined,
                        {
                            data: {
                                sessionId: session.id,
                                authorizationReference: session.authorization_reference,
                            },
                        }
                    );
                }
            }

            logger.info('✅ AutoCancellationCron: Processing completed', {
                data: {
                    total: sessions.length,
                    processed: processedCount,
                    autoCancelled: successCount,
                    paymentCancelled: cancelledCount,
                    errors: errorCount,
                },
            });
        }
        catch (error) {
            logger.error('❌ AutoCancellationCron: Error in processAutoCancellation', error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * Process a single session
     */
    private static async processSession(session: Session): Promise<void> {
        if (!session.authorization_reference) {
            logger.warn(`⚠️ AutoCancellationCron: Session ${session.id} has no authorization_reference`);
            return;
        }

        // Get payment transaction
        const paymentTxn = await PaymentTxnDbService.getByAuthorizationReference(session.authorization_reference);

        if (!paymentTxn) {
            logger.warn(`⚠️ AutoCancellationCron: Payment transaction not found for session ${session.id}`, {
                data: {
                    authorizationReference: session.authorization_reference,
                },
            });
            return;
        }

        logger.debug(`🔍 AutoCancellationCron: Processing session ${session.id}`, {
            data: {
                sessionId: session.id,
                authorizationReference: session.authorization_reference,
                paymentStatus: paymentTxn.status,
                becknTransactionId: paymentTxn.beckn_transaction_id,
            },
        });

        // Check if payment status is COMPLETED (success)
        if (paymentTxn.status === GenericPaymentTxnStatus.Success) {
            // Payment is successful, call auto cancellation flow
            logger.info(`🔄 AutoCancellationCron: Payment completed, calling auto cancellation flow`, {
                data: {
                    sessionId: session.id,
                    becknTransactionId: paymentTxn.beckn_transaction_id,
                },
            });

            await CancelActionHandler.handleEVChargingUBCBppAutoCancelAction(paymentTxn.beckn_transaction_id);

            logger.info(`✅ AutoCancellationCron: Auto cancellation flow completed for session ${session.id}`);
        }
        else {
            // Payment is not completed, cancel session and payment
            logger.info(`🔄 AutoCancellationCron: Payment not completed, cancelling session and payment`, {
                data: {
                    sessionId: session.id,
                    paymentStatus: paymentTxn.status,
                },
            });

            // Update session status to CANCELLED
            await SessionDbService.update(session.id, {
                status: ChargingSessionStatus.CANCELLED,
            });

            // Update payment status to CANCELLED
            await PaymentTxnDbService.update(paymentTxn.id, {
                status: BecknPaymentStatus.CANCELLED,
            });

            logger.info(`✅ AutoCancellationCron: Session and payment cancelled for session ${session.id}`);
        }
    }
}
