
import axios from "axios";
import { logger } from "../../services/logger.service";
import { BecknDomain } from "../schema/v2.0.0/enums/BecknDomain";
import BecknLoggingService from "./BecknLoggingService";
import Utils from "../../utils/Utils";
import GLOBAL_VARS from "../../constants/global-vars";
import { createAuthorizationHeader } from "../../utils/auth";
import { response } from "express";

// Used to send requests to the BAP's beckn-provider
export default class BppOnixRequestService {
    static async sendPostRequest(requestConfig: any, domain?: BecknDomain): Promise<any> {
        const {
            url,
            headers,
            data = {},
        } = requestConfig;

        let logData = {
            url,
            data,
            headers: {},
        };

        // for logging
        const reqId = Utils.generateRandomString(6);

        try {
            logger.debug(`🟡 [${reqId}] Starting BppOnixRequestService.sendPostRequest`, { data: logData });

            let reqHeaders = {
                ...headers,
            };

            if (GLOBAL_VARS.SHOULD_SIGN_CALLBACK_REQUESTS === 'true') {
                reqHeaders = {
                    ...reqHeaders,
                    authorization: await createAuthorizationHeader(data, domain),
                };
            }

            reqHeaders['Content-Type'] = 'application/json';

            logData.headers = reqHeaders;

            BecknLoggingService.log({
                reqId: reqId,
                url: url,
                method: 'POST',
                headers: reqHeaders,
                payload: data,
                action: 'bpp.out.request',
            });

            const responselogMetaData = {
                transactionId: data?.context?.transaction_id || '',
                messageId: data?.context?.message_id || '',
                domain: data?.context?.domain || '',
                action: data?.context?.action || '',
            }   

            logger.debug(`🟡 [${reqId}] Sending BppOnixRequestService.sendPostRequest`, { data: logData });

            return axios.post(url, data, {
                headers: reqHeaders,
                // timeout: 3000,
            })
                .then((response) => {
                    logger.debug(`🟢 [${reqId}] Received BppOnixRequestService.sendPostRequest response`, { data: logData });

                    BecknLoggingService.log({
                        reqId: reqId,
                        url: url,
                        method: 'POST',
                        headers: reqHeaders,
                        payload: response.data,
                        action: 'bpp.out.response',
                        logMetaData: responselogMetaData,
                    });

                    return response.data;
                })
                .catch((e: any) => {
                    logger.error(`🔴 [${reqId}] Error in BppOnixRequestService.sendPostRequest: ${e?.toString()}`, e, {
                        data: logData,
                    });

                    return Promise.reject(e);
                });
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error drafting request in BppOnixRequestService.sendPostRequest: ${e?.toString()}`, e, {
                data: logData,
            });
            throw e;
        }
    }
    
}

