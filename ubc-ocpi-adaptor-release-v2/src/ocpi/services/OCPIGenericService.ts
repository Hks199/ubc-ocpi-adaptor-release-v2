import { OCPI_GET_ALL_LIMIT, PUBLIC_OCPI_HOST } from "../constants";
import { OCPIRole } from "../schema/general/enum";
import { OCPIRequestHeaders } from "../schema/general/types/headers";
import { OCPIVersionNumber, OCPIModuleID } from "../schema/modules/verisons/enums";
import { OCPIVersionDetailResponse } from "../schema/modules/verisons/types/responses";
import OCPIOutgoingRequestService from "./OCPIOutgoingRequestService";

export default class OCPIGenericService {
    public static formQueryParams(dateFrom: string = '', dateTo: string = '', offset: number = 0, limit: number = OCPI_GET_ALL_LIMIT): string {
        let queryParams = `?offset=${offset}&limit=${limit}`;

        if (dateFrom) {
            queryParams += `&date_from=${dateFrom}`;
        }
        if (dateTo) {
            queryParams += `&date_to=${dateTo}`;
        }

        return queryParams;
    }

    public static getNextLink(response: any): string {
        let url = '';
        const responseHeaders = response.headers;
        if (responseHeaders && responseHeaders.link) {
            url = responseHeaders.link;
            if (url.startsWith('<')) {
                url = url.substring(1);
            }

            if (url.endsWith('>; rel="next"')) {
                url = url.replace('>; rel="next"', '');
            }

            url = url.replace('/?', '?');
        }

        return url;
    }

    public static getNextLinkV2(
        endpoint: string,
        response: any,
        totalFetched: number,
        maxLimit: number,
        dateFrom?: string,
        dateTo?: string,
        overrideLimit?: number,
        overrideTotalCount?: number,
    ): {
        url: string | null,
        offset?: number | null,
        limit?: number | null,
    } {
        let url: string;
        let limit: number = maxLimit;
        let offset: number;
        let totalCount: number | null = null;

        // If Override values are provided, ignore headers
        if (overrideLimit && overrideTotalCount) {

            // Return null if fetched greater than /equal to overrideTotalCount
            if (totalFetched >= overrideTotalCount) {
                return {
                    url: null,
                    offset: null,
                    limit: null,
                };
            }

            // Else use the override values
            offset = totalFetched;
            limit = overrideLimit;
            const queryParams = OCPIGenericService.formQueryParams(dateFrom, dateTo, offset, limit);
            url = `${endpoint}${queryParams}`;
            return {
                url: url,
                offset: offset,
                limit: limit,
            };
        }
        
        // Else, if no headers, return null
        if (!response?.headers) {
            return {
                url: null,
                offset: null,
                limit: null,
            };
        }

        // If the response headers includes the next link, use that
        if (response?.headers?.link) {
            url = response.headers.link;

            if (url.startsWith('<')) {
                url = url.substring(1);
            }

            if (url.endsWith('>; rel="next"')) {
                url = url.replace('>; rel="next"', '');
            }

            url = url.replace('/?', '?');

            // Get offset and limit from url
            const limitStart = url.indexOf('limit=');
            let limitEnd = url.indexOf('&', limitStart);
            if (limitEnd === -1) {
                limitEnd = url.length;
            }
            const limitStr = url.substring(limitStart + 6, limitEnd);
            const limitFromUrl = Number(limitStr);

            const offsetStart = url.indexOf('offset=');
            let offsetEnd = url.indexOf('&', offsetStart);
            if (offsetEnd === -1) {
                offsetEnd = url.length;
            }
            const offsetStr = url.substring(offsetStart + 7, offsetEnd);
            const offsetFromUrl = Number(offsetStr);

            if (Number.isNaN(limitFromUrl) || Number.isNaN(offsetFromUrl)) {
                throw new Error('Could not parse Link header');
            }

            const limitToUse = Math.min(limitFromUrl, maxLimit);

            url = url.replace(`limit=${limitStr}`, `limit=${limitToUse.toString()}`);

            return {
                url: url,
                offset: offsetFromUrl,
                limit: maxLimit,
            };
        }

        // Else use X-Limit and X-Total-Count
        // Get X-Limit if available
        let limitToUse = maxLimit;
        if (response?.headers['x-limit']) {
            limit = Number(response?.headers['x-limit']);
            if (!Number.isNaN(limit)) {
                limitToUse = Math.min(maxLimit, limit);
            }
        }

        // Get X-Total-Count if available
        if (response?.headers['x-total-count']) {
            totalCount = Number(response?.headers['x-total-count']);
            if (Number.isNaN(totalCount)) {
                totalCount = null;
            }
        }

        if (totalCount && limit && (totalCount > totalFetched)) {
            offset = totalFetched;
            const queryParams = OCPIGenericService.formQueryParams(dateFrom, dateTo, offset, limitToUse);
            url = `${endpoint}${queryParams}`;
            
            return {
                url: url,
                offset: offset,
                limit: limit,
            };
        }

        const currentFetched = response?.data?.data?.length;
        if (currentFetched === limit) {
            offset = totalFetched;
            const queryParams = OCPIGenericService.formQueryParams(dateFrom, dateTo, offset, limitToUse);
            url = `${endpoint}${queryParams}`;
            
            return {
                url: url,
                offset: offset,
                limit: limit,
            };
        }

        return {
            url: null,
            offset: null,
            limit: null,
        };
    }

    public static getOffsetFromURL(url: string): number {
        let offset = 0;
        // eslint-disable-next-line no-useless-escape
        const regex = /\?offset=([0-9]+)\&?/i;

        const matches = regex.exec(url);
        if (matches && matches.length > 1) {
            offset = Number(matches[1]);
        }

        return offset;
    }

    /**
     * deprecated
     */
    public static formNextLinkOld(basePath: string, identifier: string, offset: number, limit: number, dateTo: string, dateFrom: string, publicOCPIHost: string = PUBLIC_OCPI_HOST): string {
        let link = `<${publicOCPIHost}/${basePath}/${identifier}`;
        link += `?offset=${offset + 1}&limit=${limit}`;
        if (dateTo && dateFrom) {
            link += `&date_from=${dateFrom}&date_to=${dateTo}`;
        }
        link += '>; rel="next"';

        return link;
    }

    // Functions for correct implementation of pagination. /*
    // Offset refers to object numbers, not page numbers, so 20, 40, 60, rather than 1, 2, 3...
    public static convertOCPIOffsetLimitToPagePerPage(
        offset?: string,
        limit?: string,
        dateFromString?: string,
        dateToString?: string
    ): {
        page: number,
        perPage: number,
        dateFrom: Date | null,
        dateTo: Date | null,
    } {

        // Convert strings
        let offsetNum = 0;
        let limitNum = OCPI_GET_ALL_LIMIT;
        
        // or use parseInt(str, 10)?
        if (limit && !Number.isNaN(Number(limit))) {
            limitNum = Math.min(Number(limit), OCPI_GET_ALL_LIMIT);
        }

        if (offset && !Number.isNaN(Number(offset))) {
            offsetNum = Number(offset);
        }

        // Get limit and page number of db query
        const perPage = limitNum;
        const page = Math.round(offsetNum/limitNum);

        let dateFrom: Date | null = null;
        let dateTo: Date | null = null;
        const dateFromTimeStamp = Date.parse(dateFromString ?? '');
        const dateToTimeStamp = Date.parse(dateToString ?? '');

        if (Number.isNaN(dateFromTimeStamp) === false) {
            dateFrom = new Date(dateFromTimeStamp);
        }
        if (Number.isNaN(dateToTimeStamp) === false) {
            dateTo = new Date(dateToTimeStamp);
        }

        return {page, perPage, dateFrom, dateTo};
    }

    public static formNextLink(basePath: string, identifier: string, page: number, perPage: number, dateTo: string, dateFrom: string, publicOCPIHost: string = PUBLIC_OCPI_HOST): string {
        
        const offset = perPage * (page + 1);
        
        let link = `<${publicOCPIHost}/${basePath}/${identifier}`;
        link += `?offset=${offset}&limit=${perPage}`;
        if (dateTo && dateFrom) {
            link += `&date_from=${dateFrom}&date_to=${dateTo}`;
        }
        link += '>; rel="next"';

        return link;
    }
    // Functions for correct implementation of pagination. */


    public static getVersion(selectedVersionEndpoints: OCPIVersionDetailResponse): OCPIVersionNumber {
        if (selectedVersionEndpoints.version === OCPIVersionNumber.v2_0) {
            return OCPIVersionNumber.v2_0;
        }

        if (selectedVersionEndpoints.version === OCPIVersionNumber.v2_1_1 || selectedVersionEndpoints.version === OCPIVersionNumber.v2_1) {
            return OCPIVersionNumber.v2_1_1;
        }

        return OCPIVersionNumber.v2_2_1;
    }

    public static getGenericHeaders(headerValues: {
        token?: string,
        requestId: string,
        correlationId: string,
        url?: string,
    }): OCPIRequestHeaders {
        const {
            token,
            requestId,
            correlationId,
            url,
        } = headerValues;

        const headers: OCPIRequestHeaders = {};

        // Add OCPI unique message IDs if provided
        // v2.1.1 does not implement message IDs
        if (requestId && correlationId) {
            headers['X-Request-ID'] = requestId;
            headers['X-Correlation-ID'] = correlationId;
        }


        if (token && url) {
            headers.Authorization = OCPIOutgoingRequestService.getAuthorizationHeader(url, token);
        }
        return headers;
    }

    public static getCreatedOnFilter(dateFrom: string, dateTo: string): any {
        let createdOnFilter = null;
        if (dateFrom && dateTo) {
            createdOnFilter = {
                gte: dateFrom,
                lt: dateTo,
            };
        }
        else if (dateFrom) {
            createdOnFilter = {
                gte: dateFrom,
            };
        }
        else if (dateTo) {
            createdOnFilter = {
                lt: dateTo,
            };
        }

        return createdOnFilter;
    }

    public static compareDBAndClientData(DBData: any, clientData: any): boolean {
        const dbKeys = Object.keys(DBData);
        const clientKeys = Object.keys(clientData);

        if (dbKeys.length !== clientKeys.length) {
            return false;
        }

        let isSame = true;
        dbKeys.forEach((key) => {
            if (dbKeys[key as keyof typeof dbKeys] !== clientKeys[key as keyof typeof clientKeys]) {
                isSame = false;
            }
        });

        return isSame;
    }

    public static formOCPIPatchRequestPayload(keys: string[], OCPIObject: any): any {
        const reqPayload: any = {};

        keys.forEach(key => {
            if (key in OCPIObject) {
                reqPayload[key] = OCPIObject[key];
            }
        });

        return reqPayload;
    }

    public static getModuleFromURL(url: string): OCPIModuleID | string {
        if (url.toLowerCase().includes('version')) {
            return OCPIModuleID.Versions;
        }

        if (url.toLowerCase().includes('cdr')) {
            return OCPIModuleID.CDRs;
        }

        if (url.toLowerCase().includes('chargingprofile')) {
            return OCPIModuleID.ChargingProfiles;
        }

        if (url.toLowerCase().includes('command')) {
            return OCPIModuleID.Commands;
        }

        if (url.toLowerCase().includes('credential')) {
            return OCPIModuleID.CredentialsAndRegistration;
        }

        if (url.toLowerCase().includes('hubclientinfo')) {
            return OCPIModuleID.HubClientInfo;
        }

        if (url.toLowerCase().includes('location')) {
            return OCPIModuleID.Locations;
        }

        if (url.toLowerCase().includes('session')) {
            return OCPIModuleID.Sessions;
        }

        if (url.toLowerCase().includes('tariff')) {
            return OCPIModuleID.Tariffs;
        }

        if (url.toLowerCase().includes('token')) {
            return OCPIModuleID.Tokens;
        }

        if (url.toLowerCase().includes('rest-api')) {
            return 'RestApi';
        }

        return '';
    }

    public static ocpiAddLogAndSendAlert(log: any, role: OCPIRole = OCPIRole.CPO): void {

    }

    // public static async getOutgoingReqDetails(
    //     emspOCPIPlatformId: string,
    //     emspOCPIClientId: string,
    //     cpoOCPIClientId: string,
    //     addCpoOrEmspCCAndPartyId: 'cpo' | 'emsp' | null,
    //     ocpiObjectId: string | null, // if null, don't add object Id to url
    //     module: OCPIModuleID,
    //     role: OCPIInterfaceRole, // Role of the party receiving the request
    //     requestId?: string,
    //     correlationId?: string,
    // ): Promise<{
    //     reqHeaders: any,
    //     reqUrl: string,
    //     cpoPartyId: string,
    //     cpoCountryCode: string,
    //     emspPartyId: string,
    //     emspCountryCode: string,
    //     emspOCPIClient: OCPIClient,
    //     cpoOCPIClient: OCPIClient,
    // }> {

    //     // Get cpoOCPIClient details
    //     const cpoOCPIClient = await OCPIClientDbService.getById(cpoOCPIClientId);
    //     if (!cpoOCPIClient) {
    //         throw new Error(OCPIResponseStatusMessage.CPOPartyNotFound);
    //     }
    //     const cpoCountryCode = cpoOCPIClient.country_code;
    //     const cpoPartyId = cpoOCPIClient.party_id;

    //     // Get emspOCPIClient details
    //     const emspOCPIClient = await OCPIClientDbService.getById(emspOCPIClientId);
    //     if (!emspOCPIClient) {
    //         throw new Error(OCPIResponseStatusMessage.EMSPPartyNotFound);
    //     }
    //     const emspCountryCode = emspOCPIClient.country_code;
    //     const emspPartyId = emspOCPIClient.party_id;


    //     // Get the emspOCPIPlatform
    //     const emspOCPIPlatform = await OCPIPlatformDbService.getById(emspOCPIPlatformId);
    //     if (!emspOCPIPlatform) {
    //         throw new Error(OCPIResponseStatusMessage.OCPIPlatformNotFound);
    //     }
    //     const emspEndpoints = emspOCPIPlatform.selected_version_endpoints;

    //     // Get token by platform and OCPICredentialsTokenType.Outgoing
    //     const ocpiPlatformAuthSession = await OCPIPlatformAuthSessionDbService.getByInternalAndExternalClientIdsAndType(
    //         emspOCPIClientId,
    //         cpoOCPIClientId,
    //         OCPICredentialsTokenType.Outgoing,
    //     );

    //     // Check if the token exists
    //     if (!ocpiPlatformAuthSession?.token) {
    //         throw new Error(OCPIResponseStatusMessage.TokenNotFound);
    //     }

    //     // Get Token 
    //     const emspAuthToken = ocpiPlatformAuthSession.token;


    //     // FORM URL FOR REQUEST
    //     // Get tariffs endpoint for the eMSP
    //     const emspEndPoint = OCPIVersionService.getEndpointByInterfaceAndRole(
    //         emspEndpoints,
    //         role,
    //         module,
    //     );

    //     if (!emspEndPoint) {
    //         throw new Error(OCPIResponseStatusMessage.EndpointNotFound);
    //     }

    //     // Form URL
    //     let requestURL = emspEndPoint;
    //     if (addCpoOrEmspCCAndPartyId === 'cpo') {
    //         requestURL = emspEndPoint.concat('/', cpoCountryCode, '/', cpoPartyId, '/');
    //     }
    //     else if (addCpoOrEmspCCAndPartyId === 'emsp') {
    //         requestURL = emspEndPoint.concat('/', emspCountryCode, '/', emspPartyId, '/');
    //     }

    //     if (ocpiObjectId) {
    //         requestURL = requestURL.concat(ocpiObjectId);
    //     }


    //     // Form request headers
    //     const reqHeaders = {
    //         Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(requestURL, emspAuthToken),
    //         headers: OCPIGenericService.getGenericCPOHeader(
    //             requestId, correlationId,
    //             emspPartyId, emspCountryCode, // To
    //             cpoPartyId, cpoCountryCode,   // From
    //         ),
    //     };

    //     return {
    //         reqHeaders: reqHeaders,
    //         reqUrl: requestURL,
    //         cpoPartyId: cpoPartyId,
    //         cpoCountryCode: cpoCountryCode,
    //         emspPartyId: emspPartyId,
    //         emspCountryCode: emspCountryCode,
    //         emspOCPIClient: emspOCPIClient,
    //         cpoOCPIClient: cpoOCPIClient,
    //     };
    // }

}
