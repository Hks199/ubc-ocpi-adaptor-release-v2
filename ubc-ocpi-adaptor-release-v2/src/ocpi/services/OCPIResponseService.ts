import { HttpResponse } from "../../types/responses";
import { OCPIResponseStatusCode } from "../schema/general/enum";
import { OCPIResponsePayload } from "../schema/general/types/responses";

export default class OCPIResponseService {
    public static success<T>(data: T): HttpResponse<OCPIResponsePayload<T>> {
        return {
            httpStatus: 200,
            payload: {
                data: data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    static clientError<T>(data: T, statusCode: OCPIResponseStatusCode = OCPIResponseStatusCode.status_2000): HttpResponse<OCPIResponsePayload<T>> {
        // Map OCPI status codes to HTTP status codes per OCPI 2.2.1 spec
        let httpStatus = 400; // Default for client errors
        if (statusCode === OCPIResponseStatusCode.status_2001) {
            httpStatus = 401; // Unauthorized
        }
        else if (statusCode === OCPIResponseStatusCode.status_2003) {
            httpStatus = 404; // Not found
        }
        else if (statusCode === OCPIResponseStatusCode.status_2000) {
            httpStatus = 400; // Bad request
        }
        else if (statusCode === OCPIResponseStatusCode.status_2002) {
            httpStatus = 400; // Bad request
        }
        else if (statusCode === OCPIResponseStatusCode.status_2004) {
            httpStatus = 400; // Bad request
        }
        
        return {
            httpStatus,
            payload: {
                data: data,
                status_code: statusCode,
                timestamp: new Date().toISOString(),
            },
        };
    }

    static serverError<T>(data: T, statusCode: OCPIResponseStatusCode = OCPIResponseStatusCode.status_3000): HttpResponse<OCPIResponsePayload<T>> {
        return {
            httpStatus: 500,
            payload: {
                data: data,
                status_code: statusCode,
                timestamp: new Date().toISOString(),
            },
        };
    }

    static hubError<T>(data: T, statusCode: OCPIResponseStatusCode = OCPIResponseStatusCode.status_4000): HttpResponse<OCPIResponsePayload<T>> {
        return {
            httpStatus: 500,
            payload: {
                data: data,
                status_code: statusCode,
                timestamp: new Date().toISOString(),
            },
        };
    }
}