/**
 * Internal / UAT-only HTTP triggers (not part of Beckn OCPI contract).
 * Guarded: non-production by default, or ALLOW_INTERNAL_ON_STATUS_TRIGGER=true.
 */
import { Router, Request, Response } from 'express';
import { appConfig } from '../../config/app.config';
import { logger } from '../../services/logger.service';
import OnStatusActionHandler from '../../ubc/actions/handlers/OnStatusActionHandler';

const router = Router();

function isInternalOnStatusTriggerAllowed(): boolean {
    if (process.env.ALLOW_INTERNAL_ON_STATUS_TRIGGER?.trim().toLowerCase() === 'true') {
        return true;
    }
    const env = appConfig.nodeEnv;
    return env === 'development' || env === 'test';
}

/**
 * Simulate Razorpay payment completion for UAT: sends unsolicited on_status with payment COMPLETED
 * (same path as webhook). authRef = order beckn:id / authorization_reference from on_init.
 */
router.post('/on-status/payment-completed/:authRef', async (req: Request, res: Response) => {
    if (!isInternalOnStatusTriggerAllowed()) {
        res.status(403).json({
            success: false,
            error: 'Forbidden: set ALLOW_INTERNAL_ON_STATUS_TRIGGER=true, or run with NODE_ENV=development|test',
        });
        return;
    }

    const authRef = (req.params.authRef || '').trim();
    if (!authRef) {
        res.status(400).json({ success: false, error: 'Missing authRef' });
        return;
    }

    logger.info('Internal trigger: payment-completed on_status', { authorization_reference: authRef });

    const ok = await OnStatusActionHandler.sendOnStatusWithCompletedPayment(authRef);
    if (!ok) {
        res.status(500).json({
            success: false,
            error: 'Failed to send on_status (unknown authorization_reference or downstream error — see logs)',
            authorization_reference: authRef,
        });
        return;
    }

    res.status(200).json({
        success: true,
        authorization_reference: authRef,
        message: 'on_status with COMPLETED payment forwarded to ONIX',
    });
});

export default router;
