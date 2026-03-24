import { OCPITariff, OCPIv211Tariff } from ".";
import { OCPIResponsePayload } from "../../../general/types/responses";

export type OCPITariffsResponse = OCPIResponsePayload & {
    data?: OCPITariff[],
}

export type OCPITariffResponse = OCPIResponsePayload & {
    data?: OCPITariff,
}

// #OCPIv2.1.1
export type OCPIv211TariffsResponse = OCPIResponsePayload & {
    data?: OCPIv211Tariff[],
}

export type OCPIv211TariffResponse = OCPIResponsePayload & {
    data?: OCPIv211Tariff,
}
