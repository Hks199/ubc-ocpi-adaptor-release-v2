/**
 * Razorpay External Integration Service
 * Manages credentials and configuration for Razorpay payment gateway
 * Gets credentials from OCPIPartnerAdditionalProps
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

export default class RazorpayInitializerService {
    private static cache: CacheStore = {};

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

            // Fetch from database using OCPIPartnerDbService
            const ocpiPartner = await OCPIPartnerDbService.getById(partnerId);
            
            if (!ocpiPartner) {
                logger.warn(`Razorpay: OCPI Partner not found for partnerId: ${partnerId}`);
                return null;
            }

            const additionalProps = ocpiPartner.additional_props as OCPIPartnerAdditionalProps;
            const razorpayConfig = additionalProps?.payment_services?.Razorpay;

            const envKeyId = process.env.RAZORPAY_KEY_ID?.trim();
            const envKeySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
            const envApiUrl = process.env.RAZORPAY_API_URL?.trim() || 'https://api.razorpay.com/v1';

            // Map DB + env: env fills missing partner keys (UAT / ops without DB payment_services block)
            const credentials: RazorpayCredentials = {
                KEY_ID: (razorpayConfig?.KEY_ID || envKeyId || '') as string,
                KEY_SECRET: (razorpayConfig?.KEY_SECRET || envKeySecret || '') as string,
                API_URL: razorpayConfig?.API_URL || envApiUrl || 'https://api.razorpay.com/v1',
                WEBHOOK_SECRET: razorpayConfig?.WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET?.trim(),
                FEE_PERCENTAGE: razorpayConfig?.FEE_PERCENTAGE ?? 0.2,
            };

            if (!credentials.KEY_ID || !credentials.KEY_SECRET) {
                if (!razorpayConfig) {
                    logger.warn(
                        `Razorpay: No partner Razorpay block and no RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET for partnerId: ${partnerId}`
                    );
                }
                else {
                    logger.error(`Razorpay: Missing required credentials (partner + env) for partnerId: ${partnerId}`, undefined, {
                        partnerId,
                        hasKeyId: !!credentials.KEY_ID,
                        hasKeySecret: !!credentials.KEY_SECRET,
                    });
                }
                return null;
            }

            if (razorpayConfig) {
                logger.info(`Razorpay credentials loaded (partner config, env may supplement) for partnerId: ${partnerId}`);
            }
            else {
                logger.info(`Razorpay credentials loaded from environment for partnerId: ${partnerId}`);
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
