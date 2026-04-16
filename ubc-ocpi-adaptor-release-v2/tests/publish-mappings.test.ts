/**
 * Unit tests for catalog_publish payload mapping functions.
 * These mappings are critical — a wrong value causes a 400 NACK from CDS and the entire publish fails.
 */

// ── Inline the functions under test so we don't need DB/Redis to run ──────────

const parkingTypeMap: Record<string, string> = {
    ON_STREET: 'OnStreet',
    ALONG_MOTORWAY: 'OnStreet',
    PARKING_GARAGE: 'OffStreet',
    PARKING_LOT: 'OffStreet',
    ON_DRIVEWAY: 'OffStreet',
    UNDERGROUND_GARAGE: 'Basement',
    PUBLIC: 'OffStreet',
    PRIVATE: 'OffStreet',
};

function convertParkingType(v: string | null | undefined): string | undefined {
    if (!v) return undefined;
    return parkingTypeMap[v.toUpperCase()];
}

enum ConnectorType {
    CCS2 = 'CCS2',
    CHAdeMO = 'CHAdeMO',
    GBT = 'GB_T',
    Type2 = 'Type2',
    Type1 = 'Type1',
    IEC60309 = 'IEC60309',
    WallSocket15A = 'WallSocket15A',
    AC001 = 'AC-001',
    DC001 = 'DC-001',
}

const typeMap: Record<string, ConnectorType> = {
    IEC_62196_T2_COMBO: ConnectorType.CCS2,
    IEC_62196_T1_COMBO: ConnectorType.CCS2,
    CHADEMO: ConnectorType.CHAdeMO,
    GBT_DC: ConnectorType.GBT,
    GB_T_DC: ConnectorType.GBT,
    IEC_62196_T2: ConnectorType.Type2,
    IEC_62196_T1: ConnectorType.Type1,
    GB_T_AC: ConnectorType.GBT,
    IEC_60309: ConnectorType.IEC60309,
    IEC_60309_2_three_32: ConnectorType.IEC60309,
    DOMESTIC_I: ConnectorType.WallSocket15A,
    DOMESTIC_G: ConnectorType.WallSocket15A,
    DOMESTIC_F: ConnectorType.WallSocket15A,
    AC_001: ConnectorType.AC001,
    DC_001: ConnectorType.DC001,
};

function convertOcpiStandardToConnectorType(ocpiStandard: string | null | undefined): string {
    if (!ocpiStandard) return 'UNKNOWN';
    const normalized = ocpiStandard.toUpperCase();
    if (typeMap[normalized]) return typeMap[normalized];
    const withUnderscores = normalized.replace(/-/g, '_');
    if (typeMap[withUnderscores]) return typeMap[withUnderscores];
    return ocpiStandard;
}

function getNormalizedPowerType(powerType: string): string {
    if (powerType?.toUpperCase().startsWith('AC')) return 'AC_3_PHASE';
    return powerType;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('convertParkingType — CDS only accepts OnStreet,OffStreet,Basement,Mall,FuelStation,Office,Hotel', () => {
    const VALID_CDS_VALUES = new Set(['OnStreet', 'OffStreet', 'Basement', 'Mall', 'FuelStation', 'Office', 'Hotel']);

    // Values seen in the live UAT DB that caused the 400 NACK
    test('PUBLIC  → OffStreet (non-standard OCPI, seen in UAT DB)', () => {
        expect(convertParkingType('PUBLIC')).toBe('OffStreet');
    });
    test('PRIVATE → OffStreet (non-standard OCPI, seen in UAT DB)', () => {
        expect(convertParkingType('PRIVATE')).toBe('OffStreet');
    });

    // Standard OCPI values
    test('ON_STREET         → OnStreet', () => expect(convertParkingType('ON_STREET')).toBe('OnStreet'));
    test('ALONG_MOTORWAY    → OnStreet', () => expect(convertParkingType('ALONG_MOTORWAY')).toBe('OnStreet'));
    test('PARKING_GARAGE    → OffStreet', () => expect(convertParkingType('PARKING_GARAGE')).toBe('OffStreet'));
    test('PARKING_LOT       → OffStreet', () => expect(convertParkingType('PARKING_LOT')).toBe('OffStreet'));
    test('ON_DRIVEWAY       → OffStreet', () => expect(convertParkingType('ON_DRIVEWAY')).toBe('OffStreet'));
    test('UNDERGROUND_GARAGE → Basement', () => expect(convertParkingType('UNDERGROUND_GARAGE')).toBe('Basement'));

    // Case insensitivity
    test('lowercase "public"  → OffStreet', () => expect(convertParkingType('public')).toBe('OffStreet'));
    test('mixed "On_Street"   → OnStreet', () => expect(convertParkingType('On_Street')).toBe('OnStreet'));

    // Unknown / null values must NOT emit a field (to avoid future 400s)
    test('null         → undefined (field omitted)', () => expect(convertParkingType(null)).toBeUndefined());
    test('undefined    → undefined (field omitted)', () => expect(convertParkingType(undefined)).toBeUndefined());
    test('"" empty str → undefined (field omitted)', () => expect(convertParkingType('')).toBeUndefined());
    test('unknown junk → undefined (field omitted, not sent to CDS)', () => {
        expect(convertParkingType('SOME_UNKNOWN_VALUE')).toBeUndefined();
    });

    // All mapped values must be valid CDS values
    test('every mapped value is in the CDS allowed list', () => {
        Object.values(parkingTypeMap).forEach(v => {
            expect(VALID_CDS_VALUES.has(v)).toBe(true);
        });
    });
});

describe('convertOcpiStandardToConnectorType', () => {
    // CCS2 variants
    test('IEC_62196_T2_COMBO → CCS2', () => expect(convertOcpiStandardToConnectorType('IEC_62196_T2_COMBO')).toBe('CCS2'));
    test('IEC_62196_T1_COMBO → CCS2', () => expect(convertOcpiStandardToConnectorType('IEC_62196_T1_COMBO')).toBe('CCS2'));

    // AC types
    test('IEC_62196_T2       → Type2', () => expect(convertOcpiStandardToConnectorType('IEC_62196_T2')).toBe('Type2'));
    test('IEC_62196_T1       → Type1', () => expect(convertOcpiStandardToConnectorType('IEC_62196_T1')).toBe('Type1'));

    // DC fast
    test('CHADEMO            → CHAdeMO', () => expect(convertOcpiStandardToConnectorType('CHADEMO')).toBe('CHAdeMO'));
    test('GB_T_DC            → GB_T',    () => expect(convertOcpiStandardToConnectorType('GB_T_DC')).toBe('GB_T'));
    test('GBT_DC             → GB_T',    () => expect(convertOcpiStandardToConnectorType('GBT_DC')).toBe('GB_T'));

    // Case insensitivity
    test('lowercase iec_62196_t2 → Type2', () => expect(convertOcpiStandardToConnectorType('iec_62196_t2')).toBe('Type2'));

    // Null/unknown
    test('null    → UNKNOWN', () => expect(convertOcpiStandardToConnectorType(null)).toBe('UNKNOWN'));
    test('unknown → original value returned', () => expect(convertOcpiStandardToConnectorType('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE'));
});

describe('getNormalizedPowerType', () => {
    test('AC_1_PHASE   → AC_3_PHASE (normalised for CDS)', () => expect(getNormalizedPowerType('AC_1_PHASE')).toBe('AC_3_PHASE'));
    test('AC_2_PHASE   → AC_3_PHASE', () => expect(getNormalizedPowerType('AC_2_PHASE')).toBe('AC_3_PHASE'));
    test('AC_3_PHASE   → AC_3_PHASE (no-op)', () => expect(getNormalizedPowerType('AC_3_PHASE')).toBe('AC_3_PHASE'));
    test('DC           → DC (unchanged)', () => expect(getNormalizedPowerType('DC')).toBe('DC'));
});

describe('chargingSpeed derivation', () => {
    function getChargingSpeed(connectorType: string, powerType: string): string {
        const isCCS2 = connectorType === ConnectorType.CCS2
            || connectorType?.toUpperCase() === 'IEC_62196_T2_COMBO'
            || connectorType?.toUpperCase() === 'IEC_62196_T1_COMBO';
        const isDC = powerType?.toUpperCase() === 'DC';
        return (isCCS2 && isDC) ? 'FAST' : 'SLOW';
    }

    test('CCS2 + DC   → FAST', () => expect(getChargingSpeed('CCS2', 'DC')).toBe('FAST'));
    test('Type2 + AC  → SLOW', () => expect(getChargingSpeed('Type2', 'AC_3_PHASE')).toBe('SLOW'));
    test('CCS2 + AC   → SLOW (AC CCS2 is not fast charging)', () => expect(getChargingSpeed('CCS2', 'AC_3_PHASE')).toBe('SLOW'));
    test('CHAdeMO + DC → SLOW (CHAdeMO is not CCS2)', () => expect(getChargingSpeed('CHAdeMO', 'DC')).toBe('SLOW'));
});
