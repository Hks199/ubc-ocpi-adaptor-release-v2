/* eslint-disable @typescript-eslint/no-unused-vars */
import { randomUUID, randomBytes } from "crypto";
import { BecknDomain } from "../ubc/schema/v2.0.0/enums/BecknDomain";
import GLOBAL_VARS from "../constants/global-vars";
import { BecknAction } from "../ubc/schema/v2.0.0/enums/BecknAction";
import { Context } from "../ubc/schema/v2.0.0/types/Context";
import { Request } from "express";
import { OCPICredentialsRoleClass } from "../ocpi/schema/modules/credentials/types";
import { databaseService } from "../services/database.service";
import { OCPIPartner, OCPIPartnerCredentials } from "@prisma/client";

export default class Utils {
    public static upperCaseFirstLetter(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Convert a label with numeric suffix to alphabetic.
     * Example: Charger_2 -> Charger B, Charger_1 -> Charger A
     * Numbers 1-26 map to A-Z; 27+ use Excel-style (AA, AB, ...)
     */
    public static convertNumericSuffixToLetter(str: string): string {
        const match = str.match(/^(.+)_(\d+)$/);
        if (!match) return str;

        const [, prefix, numStr] = match;
        const num = parseInt(numStr, 10);
        if (num < 1) return str;

        let letter = '';
        let n = num;
        while (n > 0) {
            n -= 1;
            letter = String.fromCharCode(65 + (n % 26)) + letter;
            n = Math.floor(n / 26);
        }

        return `${prefix} ${letter}`;
    }

    /**
     * Generic helper to fetch an OCPI endpoint URL by module identifier and role.
     * Optionally filter by partner_id when known.
     * Example: getOcpiEndpoint('locations', 'SENDER', partnerId)
     */
    public static async getOcpiEndpoint(
        identifier: string,
        role: 'SENDER' | 'RECEIVER',
        partnerId?: string,
    ): Promise<string> {
        const prisma = databaseService.prisma;
        const endpoint = await prisma.oCPIPartnerEndpoint.findFirst({
            where: {
                module: identifier,
                role,
                ...(partnerId ? { partner_id: partnerId } : {}),
                deleted: false,
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        if (!endpoint || !endpoint.url) {
            throw new Error(
                `OCPI endpoint with identifier=${identifier} and role=${role} not configured in oCPIPartnerEndpoint`,
            );
        }

        return endpoint.url.replace(/\/+$/, '');
    }

    public static async getEMSPEndpoint(identifier: string, role: 'SENDER' | 'RECEIVER'): Promise<string> {
        const prisma = databaseService.prisma;
        const endpoint = await prisma.oCPIPartnerEndpoint.findFirst({
            where: {
                module: identifier,
                role,
                partner: {
                    role: 'EMSP',
                },
                deleted: false,
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        if (!endpoint || !endpoint.url) {
            throw new Error(
                `EMSP endpoint with identifier=${identifier} and role=${role} not configured in oCPIPartnerEndpoint`,
            );
        }

        return endpoint.url.replace(/\/+$/, '');
    }

    public static generateRandomString(len = 15): string {
        // ref: https://gist.github.com/6174/6062387
        const base = 8;
        const count = Math.ceil(len / base) + (len % base);
        let randomStrings = '';
        // TODO: optimize this
        for (let index = 0; index < count; index++) {
            randomStrings += Math.random().toString(36).substring(2);
        }
        return randomStrings.substring(0, len);
    }

    public static isUBCDomain(reqDetails: Request): boolean {
        return (reqDetails?.body?.metadata?.domain === BecknDomain.EVChargingUBC || reqDetails?.body?.context?.domain === BecknDomain.EVChargingUBC);
    }

    public static generateUUID(): string {
        return randomUUID();
    }

    /**
     * Generate a nano ID (similar to PostgreSQL nanoid function)
     * @param size - Length of the ID (default: 9)
     * @returns Random nano ID string
     */
    public static generateNanoId(size: number = 9): string {
        // URL-safe alphabet with exactly 64 characters (required for byte & 63)
        const urlAlphabet = 'ModuleSymbhasOwnPr0123456789ABCDEFGHNRVfgctiUvzKqYTJkLxpZXIjQWms';
        const bytes = randomBytes(size);
        let id = '';
        
        for (let i = 0; i < size; i++) {
            const byte = bytes[i];
            const pos = byte & 63; // Same as byte % 64 (0-63)
            id += urlAlphabet[pos];
        }
        
        return id;
    }

    // BPP */

    // BPP /*

    /**
     * The URL to which the request is made
     */
    public static getBPPClientHost(): string {
        return `${GLOBAL_VARS.EV_CHARGING_UBC_BPP_CLIENT_HOST}/bpp/caller`;
    }

    public static getSubscriberId(domain?: BecknDomain): string {
        return GLOBAL_VARS.EV_CHARGING_UBC_BPP_ID;
    }

    public static getBppId(): string {
        return GLOBAL_VARS.EV_CHARGING_UBC_BPP_ID;
    }

    public static getUniqueId(domain?: BecknDomain): string {
        return GLOBAL_VARS.EV_CHARGING_UBC_UNIQUE_ID;
    }

    /** Public BPP `/bpp/receiver` for catalogs — same base as {@link publish_callback_url} so CDS sees the same bpp_uri as in context. */
    public static getBppUri(): string {
        return this.publish_callback_url();
    }

    public static getBppUrl(): string {
        return `${GLOBAL_VARS.EV_CHARGING_UBC_BPP_CLIENT_HOST}/bap/receiver`;
    }

    public static bpp_url(): string {
        return `${GLOBAL_VARS.BPP_URL}/bpp/receiver`;
    }

    public static publish_gateway_url(): string {
        if (GLOBAL_VARS.ONIX_BPP_PLUGIN_URL) {
            return `${GLOBAL_VARS.ONIX_BPP_PLUGIN_URL.replace(/\/+$/, '')}/bpp/caller`;
        }

        return `${GLOBAL_VARS.CDS_BASE_URL}`.replace(/\/+$/, '');
    }

    /** CDS callback base + `/bpp/receiver`: public `BPP_URL` by default; optional `ONIX_BPP_PUBLIC_CALLBACK_URL` if ONIX is on another host. */
    public static publish_callback_url(): string {
        const publicOnix = GLOBAL_VARS.ONIX_BPP_PUBLIC_CALLBACK_URL?.replace(/\/+$/, '');
        if (publicOnix) {
            return `${publicOnix}/bpp/receiver`;
        }
        return this.bpp_url();
    }

    public static onix_bpp_caller_url(): string {
        if (GLOBAL_VARS.ONIX_BPP_PLUGIN_URL) {
            return `${GLOBAL_VARS.ONIX_BPP_PLUGIN_URL.replace(/\/+$/, '')}/bpp/caller`;
        }

        return this.getBppUrl();
    }

    public static cds_url(): string {
        return `${GLOBAL_VARS.CDS_BASE_URL}`;
    }

    public static getBPPContext(params: {
        action: BecknAction,
        version: string,
        domain: BecknDomain,
        bap_id?: string,
        bap_uri?: string,
        bpp_id?: string,
        bpp_uri?: string,
        transaction_id: string,
        message_id: string,
        timestamp?: string,
    }): Context {
        const { action, version, domain, bap_id, bap_uri, bpp_id, bpp_uri, transaction_id, message_id, timestamp } = params;

        const context: Context = {
            domain: domain,
            action: action,
            version: version,
            bpp_id: bpp_id || this.getBppId(),
            bpp_uri: bpp_uri || this.bpp_url(),
            transaction_id: transaction_id,
            message_id: message_id,
            timestamp: timestamp ?? new Date().toISOString(),
            ttl: "PT30S",
        };

        // Only include bap_id and bap_uri if they are provided
        if (bap_id) {
            context.bap_id = bap_id;
        }
        if (bap_uri) {
            context.bap_uri = bap_uri;
        }

        return context;
    }

    static async executeAsync(fn: any): Promise<void> {
        return fn();
    }

    public static async findPartnerCredentialsUsingCPOAuthToken(cpoAuthToken: string): Promise<OCPIPartnerCredentials | null> {
        const partnerCredentials =
            await databaseService.prisma.oCPIPartnerCredentials.findFirst({
                where: { cpo_auth_token: cpoAuthToken },
            });

        return partnerCredentials;
    }

    /**
     * Find OCPI partner credentials using the EMSP auth token.
     * emsp_auth_token is the token the CPO uses to call this EMSP.
     */
    public static async findPartnerCredentialsUsingEMSPAuthToken(
        emspAuthToken: string,
    ): Promise<OCPIPartnerCredentials | null> {
        console.log("emspAuthToken:",emspAuthToken);
        const partnerCredentials =
            await databaseService.prisma.oCPIPartnerCredentials.findFirst({
                where: { emsp_auth_token: emspAuthToken },
            });
        console.log("partnerCredentials : ", partnerCredentials);
        return partnerCredentials;
    }

    /**
     * Find the single EMSP partner configured in the system.
     * Assumes there is exactly one partner row with role = 'EMSP'.
     */
    public static async findEmspPartner(): Promise<OCPIPartner | null> {
        return databaseService.prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });
    }

    public static async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    
}
