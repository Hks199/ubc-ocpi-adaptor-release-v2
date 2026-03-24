import Utils from "../../utils/Utils";
import { OCPIModuleID } from "../schema/modules/verisons/enums";

export default class OCPILogService {
    public static async addLog() {

    }


    // Helper functions for creating logs /*
    public static formCommand(method: string, module: OCPIModuleID | string, url: string = '', prefix: string = '', suffix: string = ''): string {
        let command = Utils.upperCaseFirstLetter(method);
        if (module.endsWith('s')) {
            module = module.slice(0, -1);
        }
        module = Utils.upperCaseFirstLetter(module);
        command = `${command}${module}`;

        url = url.replace(/_/g, '').toLowerCase();
        if (url.includes('startsession')) {
            if (url.endsWith('startsession')) {
                command = `StartSession${command}`;
            }
            else {
                command = `StartSession${command}Result`;
            }
        }
        else if (url.includes('stopsession')) {
            if (url.endsWith('stopsession')) {
                command = `StopSession${command}`;
            }
            else {
                command = `StopSession${command}Result`;
            }
        }
        else if (url.includes('cancelreservation')) {
            if (url.endsWith('cancelreservation')) {
                command = `CancelReservation${command}`;
            }
            else {
                command = `CancelReservation${command}Result`;
            }
        }
        else if (url.includes('reservenow')) {
            if (url.endsWith('reservenow')) {
                command = `ReserveNow${command}`;
            }
            else {
                command = `ReserveNow${command}Result`;
            }
        }
        else if (url.includes('unlockconnector')) {
            if (url.endsWith('unlockconnector')) {
                command = `UnlockConnector${command}`;
            }
            else {
                command = `UnlockConnector${command}Result`;
            }
        }
        



        return `${prefix}${command}${suffix}`;
    }
}