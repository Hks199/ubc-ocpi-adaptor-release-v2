export type HttpResponse<P = any, H = Record<string, string>> = {
    payload: P,
    httpStatus?: number;
    headers?: H,
}