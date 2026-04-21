/**
 * Razorpay External Integration Service
 * Manages credentials and configuration for Razorpay payment gateway.
 * Primary source: OCPIPartner.additional_props.payment_services.Razorpay.
 * Fallback: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (and optional RAZORPAY_* env vars) when the partner row has no Razorpay block or incomplete keys.
 */
import { logger } from "../../../../services/logger.service";
import { RazorpayCredentials } from "../../../../types/Razorpay";
import OCPIPartnerDbService from "../../../../db-services/OCPIPartnerDbService";
import { OCPIPartnerAdditionalProps } from "../../../../types/OCPIPartner";

// Types
interface RazorpayCacheEntry {
    external_integration_id: string;
    credentials: RazorpayCredentials;
    partner_id: string;
}

interface CacheEntry {
    time: Date;
    razorpay?: RazorpayCacheEntry;
}

type CacheStore = {
    [partnerId: string]: CacheEntry;
};

/**
 * Optional deployment-wide Razorpay keys when OCPIPartner.additional_props.payment_services.Razorpay is absent.
 * Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the process environment (e.g. ECS/K8s secrets).
 */
export default class RazorpayInitializerService {
    private static cache: CacheStore = {};

    private static readEnvRazorpayCredentials(): Partial<RazorpayCredentials> | null {
        const KEY_ID = process.env.RAZORPAY_KEY_ID?.trim();
        const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET?.trim();
        if (!KEY_ID || !KEY_SECRET) {
            return null;
        }
        const feeRaw = process.env.RAZORPAY_FEE_PERCENTAGE?.trim();
        const parsedFee = feeRaw !== undefined && feeRaw !== '' ? Number(feeRaw) : undefined;
        return {
            KEY_ID,
            KEY_SECRET,
            API_URL: process.env.RAZORPAY_API_URL?.trim() || undefined,
            WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || undefined,
            FEE_PERCENTAGE: parsedFee !== undefined && !Number.isNaN(parsedFee) ? parsedFee : undefined,
        };
    }

    /** DB fields take precedence; env fills missing KEY_ID / KEY_SECRET / optional fields. */
    private static mergeCredentials(
        fromDb: Partial<RazorpayCredentials> | undefined,
        fromEnv: Partial<RazorpayCredentials> | null,
    ): RazorpayCredentials | null {
        const db = fromDb || {};
        const env = fromEnv || {};
        const KEY_ID = (db.KEY_ID || env.KEY_ID)?.trim();
        const KEY_SECRET = (db.KEY_SECRET || env.KEY_SECRET)?.trim();
        if (!KEY_ID || !KEY_SECRET) {
            return null;
        }
        const API_URL = db.API_URL || env.API_URL || 'https://api.razorpay.com/v1';
        const WEBHOOK_SECRET = db.WEBHOOK_SECRET ?? env.WEBHOOK_SECRET;
        const feeDb = db.FEE_PERCENTAGE;
        const feeEnv = env.FEE_PERCENTAGE;
        const FEE_PERCENTAGE =
            typeof feeDb === 'number' && !Number.isNaN(feeDb)
                ? feeDb
                : typeof feeEnv === 'number' && !Number.isNaN(feeEnv)
                    ? feeEnv
                    : 0.2;
        return { KEY_ID, KEY_SECRET, API_URL, WEBHOOK_SECRET, FEE_PERCENTAGE };
    }

    /**
     * Get Razorpay external integration parameters from OCPIPartner
     * Uses caching to avoid repeated database lookups
     * 
     * @param partnerId - Partner ID to get credentials from
     * @returns Razorpay credentials and configuration
     */
    public static async getRazorpayCredentials(
        partnerId: string
    ): Promise<RazorpayCacheEntry | null> {
        const cacheKey = partnerId;
        
        try {
            const expiryTime = 60 * 60 * 1000; // 60 minutes

            // Check if cached and not expired
            const cachedEntry = this.cache[cacheKey];
            if (cachedEntry && cachedEntry.time > new Date() && cachedEntry.razorpay) {
                return cachedEntry.razorpay;
            }

            const envPartial = this.readEnvRazorpayCredentials();
            let fromDbPartial: Partial<RazorpayCredentials> | undefined;

            const ocpiPartner = await OCPIPartnerDbService.getById(partnerId);
            if (!ocpiPartner) {
                logger.warn(`Razorpay: OCPI Partner not found for partnerId: ${partnerId}`);
            }
            else {
                const additionalProps = ocpiPartner.additional_props as OCPIPartnerAdditionalProps;
                const razorpayConfig = additionalProps?.payment_services?.Razorpay;
                if (razorpayConfig) {
                    fromDbPartial = {
                        KEY_ID: razorpayConfig.KEY_ID,
                        KEY_SECRET: razorpayConfig.KEY_SECRET,
                        API_URL: razorpayConfig.API_URL,
                        WEBHOOK_SECRET: razorpayConfig.WEBHOOK_SECRET,
                        FEE_PERCENTAGE: razorpayConfig.FEE_PERCENTAGE,
                    };
                }
            }

            const credentials = this.mergeCredentials(fromDbPartial, envPartial);
            if (!credentials) {
                logger.warn(
                    `Razorpay: No usable credentials for partnerId: ${partnerId} (set payment_services.Razorpay on the partner and/or RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in the environment)`,
                    {
                        partnerId,
                        hasPartnerRow: !!ocpiPartner,
                        hasPartnerRazorpayBlock: !!fromDbPartial,
                        hasEnvKeys: !!envPartial,
                    },
                );
                return null;
            }

            const usedEnvFallback = !!envPartial && (
                !fromDbPartial?.KEY_ID || !fromDbPartial?.KEY_SECRET
            );
            if (usedEnvFallback) {
                logger.info(
                    `Razorpay credentials resolved using environment fallback for partnerId: ${partnerId}`,
                );
            }
            else {
                logger.info(`Razorpay credentials loaded from partner config for partnerId: ${partnerId}`);
            }

            // Cache the credentials
            const cacheEntry: RazorpayCacheEntry = {
                external_integration_id: partnerId,
                credentials: credentials,
                partner_id: partnerId,
            };

            this.cache[cacheKey] = {
                time: new Date(Date.now() + expiryTime),
                razorpay: cacheEntry,
            };

            return cacheEntry;
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error(`Error in fetching Razorpay credentials`, err, { partnerId });
            return null;
        }
    }

    /**
     * Clear cache for a specific partner or all partners
     * @param partnerId - Optional partner ID to clear cache for
     */
    public static clearCache(partnerId?: string): void {
        if (partnerId) {
            delete this.cache[partnerId];
            logger.info(`Razorpay cache cleared for partnerId: ${partnerId}`);
        }
        else {
            this.cache = {};
            logger.info('Razorpay cache cleared for all partners');
        }
    }
}
