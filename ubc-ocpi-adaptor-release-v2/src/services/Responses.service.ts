import { HttpResponse } from "../types/responses";

export default class ResponsesService {
    static success<T>(data: T): HttpResponse<T> {
        return {
            httpStatus: 200,
            payload: data,
        };
    }

    static error<T>(data: T): HttpResponse<T> {
        return {
            httpStatus: 500,
            payload: data,
        };
    }
}