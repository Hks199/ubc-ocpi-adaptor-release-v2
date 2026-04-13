const GLOBAL_VARS = {
    // OCPI
    OCPI_HOST: process.env.OCPI_HOST || 'https://uat-bpp-opci-adaptor.ubc.nbsl.org.in',
    PRIVATE_KEY: process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    
    // UBC
    SHOULD_SIGN_CALLBACK_REQUESTS: process.env.SHOULD_SIGN_CALLBACK_REQUESTS || 'false',
    EV_CHARGING_UBC_BPP_ID: process.env.EV_CHARGING_UBC_BPP_ID || 'pulseenergy-ubc-local-bpp',
    EV_CHARGING_UBC_BPP_CLIENT_HOST: process.env.EV_CHARGING_UBC_BPP_CLIENT_HOST || 'http://host.docker.internal:7082',
    EV_CHARGING_UBC_UNIQUE_ID: process.env.EV_CHARGING_UBC_UNIQUE_ID || '76EU7ncBX74BMNTQJMcMYoTMSzU7k71owUF53fN4jdxmosxZrdjdDk',
    INTERNAL_PAYMENT_LINK_HOST: process.env.INTERNAL_PAYMENT_LINK_HOST || 'http://localhost:6001',
    ENABLE_CATALOG_PUBLISH: process.env.ENABLE_CATALOG_PUBLISH || 'false',
    BPP_URL: process.env.BPP_URL || 'https://uat-bpp-opci-adaptor.ubc.nbsl.org.in',
};

export default GLOBAL_VARS;