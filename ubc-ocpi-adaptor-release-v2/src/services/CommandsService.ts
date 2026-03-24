import { HttpResponse } from '../types/responses';
import { ValidationError } from '../utils/errors';
import { databaseService } from '../services/database.service';
import {
    OCPIStartSession,
    OCPIStopSession,
} from '../ocpi/schema/modules/commands/types/requests';
import { OCPICommandResponseResponse } from '../ocpi/schema/modules/commands/types/responses';
import OCPIv221CommandsModuleOutgoingRequestService from '../ocpi/modules/v2.2.1/emsp/commands/OCPIv221CommandsModuleOutgoingRequestService';
import Utils from '../utils/Utils';
import { OCPITokenType, OCPIWhitelistType } from '../ocpi/schema/modules/tokens/enums';
import { OCPIProfileType } from '../ocpi/schema/modules/sessions/enums';
import { OCPIEnergyContract } from '../ocpi/schema/modules/tokens/types';
import { OCPIResponse } from '../ocpi/types';
import { OCPICommandType } from '../ocpi/schema/modules/commands/enums';
import { logger } from './logger.service';

/**
 * Admin Commands module
 *
 * Responsibility:
 *  - Accept high-level command parameters (location, EVSE, connector, etc.)
 *  - Resolve the target CPO partner via partner_id
 *  - Fetch CPO auth token from OCPIPartnerCredentials
 *  - Generate minimal OCPI Start/Stop command payloads using those params
 *  - Call the OCPI Commands outgoing service (EMSP → CPO)
 */
export type StartChargingCommandParams = {
    locationId: string;
    evseUid: string;
    connectorId: string;
    transactionId: string;
    partnerId: string;
    headers?: Record<string, string>;
};

export type StopChargingCommandParams = {
    sessionId: string;
    partnerId: string;
    headers?: Record<string, string>;
};

export default class CommandsService {

    /**
     * Build OCPIStartSession from high-level parameters and send to CPO.
     */
    public static async startSession(
        params: StartChargingCommandParams,
    ): Promise<HttpResponse<OCPIResponse<OCPICommandResponseResponse>>> {
        const { locationId, evseUid, connectorId, transactionId, partnerId, headers } = params;

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const commandsUrl = await Utils.getEMSPEndpoint('commands', 'RECEIVER');

        const token = await databaseService.prisma.token.findFirst({
            where: {
                partner_id: partnerId,
                valid: true,
            },
            orderBy: {
                created_at: 'desc',
            },
        });
        if (!token) {
            throw new ValidationError('Token not found');
        }

        const commandBody: OCPIStartSession = {
            // NOTE: response_url and token must be populated by the caller or
            // extended logic later; we set minimal placeholders here.
            response_url: `${commandsUrl}/${OCPICommandType.START_SESSION}/${transactionId}`,
            token: {
                country_code: token?.country_code,
                party_id: token.party_id,
                uid: token.uid,
                type: token.type as OCPITokenType,
                contract_id: token.contract_id,
                visual_number: token.visual_number ?? undefined,
                issuer: token.issuer, 
                group_id: token.group_id ?? undefined,
                valid: token.valid,
                whitelist: token.whitelist as OCPIWhitelistType,
                language: token.language ?? undefined,
                default_profile_type: token.default_profile_type as OCPIProfileType,
                energy_contract: token.energy_contract as OCPIEnergyContract,
                last_updated: token.last_updated.toISOString(),
            },
            location_id: locationId,
            evse_uid: evseUid,
            connector_id: connectorId,
            authorization_reference: transactionId,
        };

        try {
            const cpoResponse =
            await OCPIv221CommandsModuleOutgoingRequestService.sendStartSessionCommand(
                commandBody,
                creds.cpo_auth_token,
                partnerId,
                headers,
            );
            return cpoResponse;
        }
        catch (error) {
            logger.error(`Error sending start session command to CPO: ${error}`);
            throw new ValidationError('Error sending start session command to CPO');
        }

        
    }

    /**
     * Build OCPIStopSession from high-level parameters and send to CPO.
     */
    public static async stopSession(
        params: StopChargingCommandParams,
    ): Promise<HttpResponse<OCPIResponse<OCPICommandResponseResponse>>> {
        const { sessionId, partnerId, headers } = params;

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const commandsUrl = await Utils.getEMSPEndpoint('commands', 'RECEIVER');

        const commandBody: OCPIStopSession = {
            response_url: `${commandsUrl}/${OCPICommandType.STOP_SESSION}/${sessionId}`,
            session_id: sessionId,
        };

        const cpoResponse =
            await OCPIv221CommandsModuleOutgoingRequestService.sendStopSessionCommand(
                commandBody,
                creds.cpo_auth_token,
                partnerId,
                headers,
            );

        return {
            httpStatus: cpoResponse.httpStatus,
            payload: cpoResponse.payload,
        };
    }
}


