export type URL = string;

// 16.3
export type OCPIDisplayText = {
    language: string,
    text: string,
}

// 16.5
export type OCPIPrice = {
    excl_vat: number,
    incl_vat?: number,
}

export type ISODateTime = string; // new Date().toISOString()