import winston from 'winston';
import { getLoggerConfig } from '../config/logger.config';

class LoggerService {
    private logger: winston.Logger;
    private correlationId?: string;

    constructor() {
        this.logger = winston.createLogger(getLoggerConfig());
    }

    setCorrelationId(id: string): void {
        this.correlationId = id;
    }

    private getMeta(): Record<string, any> {
        const meta: Record<string, any> = {};
        if (this.correlationId) {
            meta.correlationId = this.correlationId;
        }
        return meta;
    }

    error(message: string, error?: Error, meta?: Record<string, any>): void {
        try {
            const allMeta = { ...this.getMeta(), ...meta };
            if (error) {
                allMeta.error = {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                };
            }
            else {
                // Add call stack for error logs even when no error object is provided
                allMeta.callstack = new Error().stack;
            }
            this.logger.error(message, allMeta);
        }
        catch (e) {
            // Silently fail - logger should never throw errors
            console.error('Logger error method failed:', e);
        }
    }

    warn(message: string, meta?: Record<string, any>): void {
        try {
            const allMeta = { ...this.getMeta(), ...meta };
            // Add call stack for warning logs
            allMeta.callstack = new Error().stack;
            this.logger.warn(message, allMeta);
        }
        catch (e) {
            // Silently fail - logger should never throw errors
            console.error('Logger warn method failed:', e);
        }
    }

    info(message: string, meta?: Record<string, any>): void {
        try {
            this.logger.info(message, { ...this.getMeta(), ...meta });
        }
        catch (e) {
            // Silently fail - logger should never throw errors
            console.error('Logger info method failed:', e);
        }
    }

    debug(message: string, meta?: Record<string, any>): void {
        try {
            this.logger.debug(message, { ...this.getMeta(), ...meta });
        }
        catch (e) {
            // Silently fail - logger should never throw errors
            console.error('Logger debug method failed:', e);
        }
    }
}

export const logger = new LoggerService();
