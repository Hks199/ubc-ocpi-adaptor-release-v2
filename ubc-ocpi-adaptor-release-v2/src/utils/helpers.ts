import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
    return uuidv4();
}

export function generateCorrelationId(): string {
    return uuidv4();
}

export function sanitizeString(str: string): string {
    return str.trim().replace(/\s+/g, ' ');
}

export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const attempt = async () => {
            try {
                const result = await fn();
                resolve(result);
            }
            catch (error) {
                attempts++;
                if (attempts >= maxRetries) {
                    reject(error);
                }
                else {
                    await delay(delayMs * attempts);
                    attempt();
                }
            }
        };

        attempt();
    });
}
