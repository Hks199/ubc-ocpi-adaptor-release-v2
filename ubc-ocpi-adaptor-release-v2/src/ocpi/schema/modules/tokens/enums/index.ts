// 12.4.1
export enum OCPIAllowedType {
    ALLOWED = 'ALLOWED',
    BLOCKED = 'BLOCKED',
    EXPIRED = 'EXPIRED',
    NO_CREDIT = 'NO_CREDIT',
    NOT_ALLOWED = 'NOT_ALLOWED',
}

// #OCPIv2.1.1
// 12.4.1
export enum OCPIv211Allowed {
    ALLOWED = 'ALLOWED',
    BLOCKED = 'BLOCKED',
    EXPIRED = 'EXPIRED',
    NO_CREDIT = 'NO_CREDIT',
    NOT_ALLOWED = 'NOT_ALLOWED',
}

// 12.4.4
export enum OCPITokenType {
    AD_HOC_USER = 'AD_HOC_USER',
    APP_USER = 'APP_USER',
    OTHER = 'OTHER',
    RFID = 'RFID'
}

// #OCPIv2.1.1
// 12.4.3
export enum OCPIv211TokenType {
    OTHER = 'OTHER',
    RFID = 'RFID'
}

// 12.4.5
export enum OCPIWhitelistType {
    ALWAYS = 'ALWAYS',
    ALLOWED = 'ALLOWED',
    ALLOWED_OFFLINE = 'ALLOWED_OFFLINE',
    NEVER = 'NEVER',
}
