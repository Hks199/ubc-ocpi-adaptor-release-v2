import { logger } from '../../services/logger.service';
import { OCPICommand, OCPICommandResponse, OCPIResponse } from '../types';

export class CommandsModule {
    async handleCommand(
        command: OCPICommand,
        locationId: string,
        evseUid?: string,
        connectorId?: string,
        reservationId?: string
    ): Promise<OCPIResponse<OCPICommandResponse>> {
        try {
            logger.info('Handling command', {
                command,
                locationId,
                evseUid,
                connectorId,
                reservationId,
            });

            // In a real implementation, this would interact with the charging station
            // For now, return ACCEPTED
            const response: OCPICommandResponse = {
                result: 'ACCEPTED',
            };

            return {
                status_code: 1000,
                data: response,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error: any) {
            logger.error('Error handling command', error, { command, locationId });
            throw error;
        }
    }
}

export const commandsModule = new CommandsModule();
