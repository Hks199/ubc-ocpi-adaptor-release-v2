// 11.4.1
export enum OCPIDayOfWeek {
    MONDAY = 'MONDAY',
    TUESDAY = 'TUESDAY',
    WEDNESDAY = 'WEDNESDAY',
    THURSDAY = 'THURSDAY',
    FRIDAY = 'FRIDAY',
    SATURDAY = 'SATURDAY',
    SUNDAY = 'SUNDAY',
}

// 11.4.3
export enum OCPIReservationRestrictionType {
    RESERVATION = 'RESERVATION',
    RESERVATION_EXPIRES = 'RESERVATION_EXPIRES',
}

// 11.4.5
export enum OCPITariffDimensionType {
    ENERGY = 'ENERGY',
    FLAT = 'FLAT',
    PARKING_TIME = 'PARKING_TIME',
    TIME = 'TIME',
}

// 11.4.7
export enum OCPITariffType {
    AD_HOC_PAYMENT = 'AD_HOC_PAYMENT',
    PROFILE_CHEAP = 'PROFILE_CHEAP',
    PROFILE_FAST = 'PROFILE_FAST',
    PROFILE_GREEN = 'PROFILE_GREEN',
    REGULAR = 'REGULAR',
}
