import { BecknAction } from "../enums/BecknAction"
import { BecknDomain } from "../enums/BecknDomain"

export type Context = {
    /** Omitted on `catalog_publish` per UBC TSD; included on BAP-facing actions. */
    domain?: BecknDomain,
    action: BecknAction
    version: string
    bap_id?: string
    bap_uri?: string
    bpp_id: string
    bpp_uri: string
    transaction_id: string
    message_id: string
    timestamp: string
    key?: string
    ttl?: string
}
