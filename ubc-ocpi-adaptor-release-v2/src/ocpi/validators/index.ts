import { z } from 'zod';

// Common OCPI Validators
export const ocpiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
    z.object({
        status_code: z.number(),
        status_message: z.string().optional(),
        data: dataSchema.optional(),
        timestamp: z.string().optional(),
    });

export const coordinatesSchema = z.object({
    latitude: z.string(),
    longitude: z.string(),
});

export const locationSchema = z.object({
    id: z.string(),
    type: z.enum(['ON_STREET', 'PARKING_GARAGE', 'PARKING_LOT', 'UNDERGROUND_GARAGE', 'OTHER']),
    name: z.string().optional(),
    address: z.string(),
    city: z.string(),
    postal_code: z.string(),
    country: z.string(),
    coordinates: coordinatesSchema,
    related_locations: z.array(z.any()).optional(),
    evses: z.array(z.any()).optional(),
    directions: z
        .array(
            z.object({
                language: z.string(),
                text: z.string(),
            })
        )
        .optional(),
    operator: z
        .object({
            name: z.string(),
            website: z.string().url().optional(),
        })
        .optional(),
    suboperator: z
        .object({
            name: z.string(),
            website: z.string().url().optional(),
        })
        .optional(),
    owner: z
        .object({
            name: z.string(),
            website: z.string().url().optional(),
        })
        .optional(),
    facilities: z.array(z.string()).optional(),
    time_zone: z.string(),
    opening_times: z.any().optional(),
    charging_when_closed: z.boolean().optional(),
    images: z.array(z.any()).optional(),
    energy_mix: z.any().optional(),
    last_updated: z.string(),
});

export const tariffSchema = z.object({
    country_code: z.string(),
    party_id: z.string(),
    id: z.string(),
    currency: z.string(),
    type: z.enum(['AD_HOC_PAYMENT', 'PROFILE_CHEAPEST', 'PROFILE_FASTEST', 'REGULAR']),
    tariff_alt_text: z
        .array(
            z.object({
                language: z.string(),
                text: z.string(),
            })
        )
        .optional(),
    tariff_alt_url: z.string().url().optional(),
    min_price: z
        .object({
            excl_vat: z.number(),
            incl_vat: z.number(),
        })
        .optional(),
    max_price: z
        .object({
            excl_vat: z.number(),
            incl_vat: z.number(),
        })
        .optional(),
    elements: z.array(z.any()),
    start_date_time: z.string().optional(),
    end_date_time: z.string().optional(),
    energy_mix: z.any().optional(),
    last_updated: z.string(),
});

export const sessionSchema = z.object({
    id: z.string(),
    start_date_time: z.string(),
    end_date_time: z.string().optional(),
    kwh: z.number(),
    auth_id: z.string(),
    auth_method: z.enum(['AUTH_REQUEST', 'COMMAND', 'WHITELIST']),
    location: z.object({
        id: z.string(),
        name: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        postal_code: z.string().optional(),
        country: z.string(),
        coordinates: coordinatesSchema.optional(),
        evse: z
            .object({
                uid: z.string(),
                evse_id: z.string().optional(),
                connector_id: z.string().optional(),
            })
            .optional(),
    }),
    meter_id: z.string().optional(),
    currency: z.string(),
    charging_periods: z.array(z.any()).optional(),
    total_cost: z.number().optional(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'INVALID', 'PENDING']),
    last_updated: z.string(),
});

export const cdrSchema = z.object({
    id: z.string(),
    start_date_time: z.string(),
    end_date_time: z.string(),
    auth_id: z.string(),
    auth_method: z.enum(['AUTH_REQUEST', 'COMMAND', 'WHITELIST']),
    location: z.object({
        id: z.string(),
        name: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        postal_code: z.string().optional(),
        country: z.string(),
        coordinates: coordinatesSchema.optional(),
        evse: z
            .object({
                uid: z.string(),
                evse_id: z.string().optional(),
                connector_id: z.string().optional(),
            })
            .optional(),
    }),
    meter_id: z.string().optional(),
    currency: z.string(),
    tariffs: z.array(z.any()).optional(),
    charging_periods: z.array(z.any()),
    total_cost: z.object({
        excl_vat: z.number(),
        incl_vat: z.number(),
    }),
    total_energy: z.number(),
    total_time: z.number().optional(),
    total_parking_time: z.number().optional(),
    remark: z.string().optional(),
    credit: z.boolean().optional(),
    credit_reference_id: z.string().optional(),
    invoice_reference_id: z.string().optional(),
    last_updated: z.string(),
});

export const tokenSchema = z.object({
    uid: z.string(),
    type: z.enum(['AD_HOC_USER', 'APP_USER', 'OTHER', 'RFID']),
    auth_id: z.string(),
    issuer: z.string(),
    valid: z.boolean(),
    whitelist: z.enum(['ALWAYS', 'ALLOWED', 'ALLOWED_OFFLINE', 'NEVER']),
    language: z.string().optional(),
    last_updated: z.string(),
});

export const credentialsSchema = z.object({
    token: z.string(),
    url: z.string().url(),
    business_details: z.object({
        name: z.string(),
        logo: z.any().optional(),
    }),
    party_id: z.string(),
    country_code: z.string(),
});
