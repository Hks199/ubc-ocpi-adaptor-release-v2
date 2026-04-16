/** Public BPP base URL (ingress). MOCK_BPP uses uat-bpp-opci-adapter host; bpp_id follows BPP_URL hostname when EV_CHARGING_UBC_BPP_ID unset. */
const BPP_URL = process.env.BPP_URL || 'https://uat-bpp-opci-adapter.ubc.nbsl.org.in';

function bppHostnameFromUrl(url: string): string {
    try {
        return new URL(url).hostname;
    } 
    catch {
        return 'uat-bpp-opci-adapter.ubc.nbsl.org.in';
    }
}

const GLOBAL_VARS = {
    // OCPI
    OCPI_HOST: process.env.OCPI_HOST || 'https://uat-bpp-opci-adapter.ubc.nbsl.org.in',
    PRIVATE_KEY: process.env.PRIVATE_KEY || '',
    
    // UBC — bpp_id should match MOCK_BPP subscriber_id and ONIX adapter.yaml networkParticipant
    SHOULD_SIGN_CALLBACK_REQUESTS: process.env.SHOULD_SIGN_CALLBACK_REQUESTS || 'false',
    EV_CHARGING_UBC_BPP_ID: process.env.EV_CHARGING_UBC_BPP_ID || bppHostnameFromUrl(BPP_URL),
    EV_CHARGING_UBC_BPP_CLIENT_HOST: process.env.EV_CHARGING_UBC_BPP_CLIENT_HOST,
    EV_CHARGING_UBC_UNIQUE_ID: process.env.EV_CHARGING_UBC_UNIQUE_ID || '76EU8AV7JusA4x7bLLTRLsiPJUmuFXgjoZggE3KV767ZKocKZX9WqH',
    INTERNAL_PAYMENT_LINK_HOST: process.env.INTERNAL_PAYMENT_LINK_HOST || 'http://localhost:6001',
    ENABLE_CATALOG_PUBLISH: process.env.ENABLE_CATALOG_PUBLISH || 'false',
    BPP_URL,
    ONIX_BPP_PUBLIC_CALLBACK_URL: process.env.ONIX_BPP_PUBLIC_CALLBACK_URL || '',
    ONIX_BPP_PLUGIN_URL: process.env.ONIX_BPP_PLUGIN_URL || '',
    CDS_BASE_URL: process.env.CDS_BASE_URL || 'https://uat-cds.ubc.nbsl.org.in/cds',
};

export default GLOBAL_VARS;
