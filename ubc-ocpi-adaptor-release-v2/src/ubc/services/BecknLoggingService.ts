import BecknLogDbService from "../../db-services/BecknLogDbService";
import { logger } from "../../services/logger.service";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default class BecknLoggingService {
    public static async log(data: {
        reqId?: string,
        url?: string,
        method?: string,
        payload: any,
        headers?: any,
        action: string,
        logMetaData?: {
            transactionId?: string,
            messageId?: string,
            domain?: string,
            action?: string,
        },
    }): Promise<void> {
        logger.debug(`🟡 Starting BecknLoggingService.log`, { data: data });
        logger.info(`Beckn Log`, {
            data: data,
        });

        const transactionId = data?.payload?.context?.transaction_id || data?.payload?.metadata?.beckn_transaction_id || data?.logMetaData?.transactionId || '';
        const messageId = data?.payload?.context?.message_id || data?.logMetaData?.messageId || '';
        const domain = data?.payload?.context?.domain || data?.payload?.metadata?.domain || data?.logMetaData?.domain || '';
        const action = data?.payload?.context?.action ? `${data.action}.${data.payload.context.action}` : data.url?.split('/').pop() ? `${data.action}.${data.url.split('/').pop()}` : data.action || data?.logMetaData?.action || '';

        BecknLogDbService.create({
            data: {
                action: action,
                domain: domain,
                transaction_id: transactionId,
                message_id: messageId,
                payload: data.payload,
                additional_props: {
                    reqId: data?.reqId || '',
                    url: data?.url || '',
                    method: data?.method || '',
                }
            },
        })
            .catch((error) => {
                logger.error('Error logging Beckn log', error as Error, {
                    data: data,
                });
            });

        return;
    }
}
