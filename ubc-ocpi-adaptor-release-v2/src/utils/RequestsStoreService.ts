import REQUESTS_STORE from './requests-store';
import { logger } from '../services/logger.service';

/**
 * Service for managing the global requests store
 * Used for stitching async request/response pairs (e.g., publish -> on_publish)
 */
export default class RequestsStoreService {
    /**
     * Sends a request and returns a promise that resolves when the actual response
     * is received via another request (e.g., webhook/callback).
     * 
     * @param params Configuration object
     * @param params.reqId Unique request ID to track the response (typically transaction_id)
     * @param params.data Request data to store
     * @param params.asyncFn Function that sends the initial request
     * @param params.timeout Optional timeout in milliseconds (default: 120000 = 2 minutes)
     * @returns Promise that resolves with the response received in another request
     */
    public static async getStitchedResponse(params: {
        reqId: string,
        data: any,
        asyncFn: () => Promise<any>,
        timeout?: number,
    }): Promise<any> {
        const {
            reqId,
            asyncFn,
            data,
            timeout = 120000, // Default 2 minutes timeout
        } = params;
        
        try {
            logger.debug(`🟡 [${reqId}] Starting stitched response in getStitchedResponse`, { timeout });

            if (!reqId) {
                logger.error(`🔴 [${reqId}] Error in getStitchedResponse: reqId is required`);
                throw new Error('reqId is required');
            }

            // Check if there's already a pending response for this reqId
            if (REQUESTS_STORE[reqId]?.resolver) {
                logger.error(`🔴 [${reqId}] Error in getStitchedResponse: Request with reqId ${reqId} is already pending`);
                throw new Error(`Request with reqId ${reqId} is already pending`);
            }

            // Create a promise that will be resolved when the actual response arrives
            // IMPORTANT: Store resolver BEFORE sending request to avoid race condition
            // where callback arrives before resolver is stored
            return new Promise((resolve, reject) => {
                // Set up timeout
                const timeoutHandle = setTimeout(() => {
                    logger.error(`🔴 [${reqId}] Request timed out in getStitchedResponse`, undefined, { timeout });
                    delete REQUESTS_STORE[reqId];
                    reject(new Error(`Request ${reqId} timed out after ${timeout}ms`));
                }, timeout);

                // Store both the request data and the resolver BEFORE sending request
                REQUESTS_STORE[reqId] = {
                    data,
                    resolver: {
                        resolve: (value: any) => {
                            logger.debug(`🟢 [${reqId}] Resolving stitched response in getStitchedResponse`);
                            clearTimeout(timeoutHandle);
                            delete REQUESTS_STORE[reqId];
                            resolve(value);
                        },
                        reject: (error: Error) => {
                            logger.error(`🔴 [${reqId}] Rejecting stitched response in getStitchedResponse`, error, { 
                                message: error.message
                            });
                            clearTimeout(timeoutHandle);
                            delete REQUESTS_STORE[reqId];
                            reject(error);
                        },
                        timeout: timeoutHandle,
                    },
                };

                logger.debug(`🟡 [${reqId}] Sending initial request in getStitchedResponse`);

                // Send the initial request (don't wait for final response)
                // This is done AFTER storing the resolver to prevent race conditions
                asyncFn()
                    .then((initialResponse) => {
                        logger.debug(`🟢 [${reqId}] Received initial response in getStitchedResponse`, { 
                            ackStatus: initialResponse?.message?.ack?.status 
                        });
                        // Check for immediate NACK
                        if (initialResponse?.message?.ack?.status === 'NACK') {
                            logger.error(`🔴 [${reqId}] NACK received in getStitchedResponse`);
                            // Clean up and reject
                            if (REQUESTS_STORE[reqId]?.resolver) {
                                REQUESTS_STORE[reqId].resolver.reject(new Error('NACK received from CDS'));
                            }
                        }
                        // If ACK, wait for callback to resolve the promise
                    })
                    .catch((error) => {
                        logger.error(`🔴 [${reqId}] Error in initial request in getStitchedResponse`, error, { 
                            message: 'Request failed'
                        });
                        // Clean up and reject on request failure
                        if (REQUESTS_STORE[reqId]?.resolver) {
                            REQUESTS_STORE[reqId].resolver.reject(error);
                        }
                    });
            });
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in getStitchedResponse`, e, { 
                message: e?.toString()
            });
            throw e;
        }
    }

    /**
     * Resolves a pending stitched response when the actual response is received
     * in another request (e.g., webhook/callback handler).
     * 
     * @param reqId The request ID that was used in getStitchedResponse (typically transaction_id)
     * @param response The response data received from the callback
     * @returns true if the response was resolved, false if no pending request was found
     */
    public static resolveStitchedResponse(reqId: string, response: any): boolean {
        try {
            logger.debug(`🟡 [${reqId}] Resolving stitched response in resolveStitchedResponse`);

            const entry = REQUESTS_STORE[reqId];
            
            if (!entry?.resolver) {
                logger.error(`🔴 [${reqId}] Error in resolveStitchedResponse`, undefined, { 
                    message: 'No pending request found' 
                });
                return false;
            }

            // Resolve the promise
            entry.resolver.resolve(response);
            logger.debug(`🟢 [${reqId}] Successfully resolved stitched response`);
            return true;
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in resolveStitchedResponse`, e, { 
                message: e?.toString()
            });
            return false;
        }
    }
}

