/* eslint-disable consistent-return */
import axios from 'axios';
import { logger } from '../services/logger.service';

export async function registryLookup(registryUri: string, lookupParameter: Record<string, string>): Promise<Record<string, string>[]> {
    try {
        const response = await axios.post(`${registryUri}/lookup`, lookupParameter);
        const subscribers: Record<string, string>[] = [];
        response.data.forEach((data: Record<string, string>) => {
            try {
                subscribers.push({
                    subscriber_id: data.subscriber_id,
                    subscriber_url: data.subscriber_url,
                    type: data.type,
                    signing_public_key: data.signing_public_key,
                    valid_until: data.valid_until,
                });
            }
            catch (error) {
                console.log(data);
                console.log(error);
            }
        });
        return subscribers;
    }
    catch (err) {
        console.log(err);
        return [];
    }
}


export async function getSubscriberDetails(registryUri: string, subscriberId: string, uniqueKeyId: string) {
    try {
        const subscribers = await registryLookup(registryUri, {
            subscriber_id: subscriberId,
            unique_key_id: uniqueKeyId,
        });
        
        if (subscribers?.length === 0) {
            throw new Error('No subscriber found');
        }
        
        return subscribers?.[0];
    }
    catch (err:any) {
        logger.error('Error in getSubscriberDetails', err);
        throw new Error('Error in getSubscriberDetails');
    }
}
