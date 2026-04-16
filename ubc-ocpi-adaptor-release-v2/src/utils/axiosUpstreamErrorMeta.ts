/**
 * Extract HTTP response fields from an Axios-like error for structured logs.
 * Keeps logs small and puts CDS/ONIX rejection bodies where operators look first.
 */
export function axiosUpstreamErrorMeta(err: unknown): Record<string, unknown> {
    const e = err as { response?: { status?: number; statusText?: string; data?: unknown } };
    const r = e?.response;
    if (!r) {
        return { upstreamResponseMissing: true };
    }
    const meta: Record<string, unknown> = {
        upstreamStatus: r.status,
        upstreamStatusText: r.statusText,
    };
    if (r.data !== undefined) {
        meta.upstreamResponse = r.data;
    }
    return meta;
}
