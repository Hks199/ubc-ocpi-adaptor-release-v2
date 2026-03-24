/**
 * Promise resolvers for pending stitched responses
 */
type PromiseResolver = {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout?: ReturnType<typeof setTimeout>;
};

/**
 * Request entry that can store either:
 * - Just request data (for regular requests)
 * - Request data + promise resolvers (for pending stitched responses)
 */
type RequestEntry = {
    data: any;
    resolver?: PromiseResolver;
};

/**
 * Global in-memory store for HTTP requests
 * Stores requests indexed by their request ID (transaction_id or message_id)
 * For pending stitched responses, also includes promise resolvers
 */
type RequestsStore = {
    [reqId: string]: RequestEntry;
};

const REQUESTS_STORE: RequestsStore = {};

export default REQUESTS_STORE;

