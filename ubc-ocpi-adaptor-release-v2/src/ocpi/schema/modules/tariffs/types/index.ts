import { ISODateTime } from "../../../general/types";
import { OCPIDisplayText, OCPIPrice, URL } from "../../../general/types";
import { OCPIEnergyMix } from "../../locations/types";
import { OCPIDayOfWeek, OCPIReservationRestrictionType, OCPITariffDimensionType, OCPITariffType } from "../enums";

// 11.4.2
export type OCPIPriceComponent = {
    type: OCPITariffDimensionType,
    price: number,
    vat?: number,
    step_size: bigint,
}

// #OCPIv2.1.1
// 11.4.2
export type OCPIv211PriceComponent = {
    type: OCPITariffDimensionType,
    price: number,
    step_size: bigint,
    vat?: number,
}

// 11.4.6
export type OCPITariffRestrictions = {
    start_time?: string,
    end_time?: string,
    start_date?: string,
    end_date?: string,
    min_kwh?: number,
    max_kwh?: number,
    min_current?: number,
    max_current?: number,
    min_power?: number,
    max_power?: number,
    min_duration?: bigint,
    max_duration?: bigint,
    day_of_week?: OCPIDayOfWeek[],
    reservation?: OCPIReservationRestrictionType,
}

// #OCPIv2.1.1
// 11.4.5
export type OCPIv211TariffRestrictions = {
    start_time?: string,
    end_time?: string,
    start_date?: string,
    end_date?: string,
    min_kwh?: number,
    max_kwh?: number,
    min_power?: number,
    max_power?: number,
    min_duration?: bigint,
    max_duration?: bigint,
    day_of_week?: OCPIDayOfWeek[],
}

// 11.4.4
export type OCPITariffElement = {
    price_components: OCPIPriceComponent[],
    restrictions?: OCPITariffRestrictions,
}

// #OCPIv2.1.1
// 11.4.4
export type OCPIv211TariffElement = {
    price_components: OCPIv211PriceComponent[],
    restrictions?: OCPIv211TariffRestrictions,
}

// 11.3.1
export type OCPITariff = {
    country_code: string,
    party_id: string,
    id: string,
    currency: string,
    type?: OCPITariffType,
    tariff_alt_text?: OCPIDisplayText[],
    tariff_alt_url?: URL,
    min_price?: OCPIPrice,
    max_price?: OCPIPrice,
    elements: OCPITariffElement[],
    start_date_time?: ISODateTime,
    end_date_time?: ISODateTime,
    energy_mix?: OCPIEnergyMix,
    last_updated: ISODateTime,
}

// #OCPIv2.1.1
// 11.3.1
export type OCPIv211Tariff = {
    id: string,
    currency: string,
    tariff_alt_text?: OCPIDisplayText[],
    tariff_alt_url?: URL,
    elements: OCPIv211TariffElement[],
    energy_mix?: OCPIEnergyMix,
    last_updated: ISODateTime,
}

export type OCPIv211PatchTariff = {
    id?: string,
    currency?: string,
    tariff_alt_text?: OCPIDisplayText[],
    tariff_alt_url?: URL,
    elements?: OCPIv211TariffElement[],
    energy_mix?: OCPIEnergyMix,
    last_updated?: ISODateTime,
}

export type OCPIPatchTariff = {
    country_code?: string,
    party_id?: string,
    id?: string,
    currency?: string,
    type?: OCPITariffType,
    tariff_alt_text?: OCPIDisplayText[],
    tariff_alt_url?: URL,
    min_price?: OCPIPrice,
    max_price?: OCPIPrice,
    elements?: OCPITariffElement[],
    start_date_time?: ISODateTime,
    end_date_time?: ISODateTime,
    energy_mix?: OCPIEnergyMix,
    last_updated?: ISODateTime,
}

export type TariffProfileOCPIProps = {
    currency?: string,
    type?: OCPITariffType,
    tariff_alt_text?: OCPIDisplayText[],
    tariff_alt_url?: URL,
    min_price?: OCPIPrice,
    max_price?: OCPIPrice,
    elements?: OCPITariffElement[],
    start_date_time?: ISODateTime,
    end_date_time?: ISODateTime,
    energy_mix?: OCPIEnergyMix,
}