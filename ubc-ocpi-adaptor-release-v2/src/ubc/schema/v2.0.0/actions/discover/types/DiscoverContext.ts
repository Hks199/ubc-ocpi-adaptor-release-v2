import { Context } from "../../../types/Context";

// Context with schema_context support
export type UBCDiscoverContext = Omit<Context, 'action' | 'bpp_id' | 'bpp_uri' | 'key' | 'ttl' | 'schema_context'> & {
};
