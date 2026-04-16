-- Demo OCPI partner + locations + EVSEs + connectors for local catalog_publish tests.
-- Removes existing rows for partner 00bd6fa2-17b3-4c97-af7c-20f0304130c5 (CASCADE), then re-inserts.
--
-- Apply (from project root, host):
--   docker exec -i ubc-postgres psql -U postgres -d ubc_ocpi_adaptor < scripts/seed-demo-catalog-publish-data.sql
--
-- Or copy-paste into psql inside the container.

BEGIN;

DELETE FROM ocpi_partner WHERE id = '00bd6fa2-17b3-4c97-af7c-20f0304130c5';

INSERT INTO ocpi_partner (id, name, country_code, party_id, versions_url, status, created_at, updated_at, deleted, role, additional_props)
VALUES (
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'Synthetic CPO',
  'IN',
  'CPO',
  'https://example.invalid/ocpi/versions',
  'ACTIVE',
  '2026-03-29 16:34:28.87',
  NOW(),
  false,
  'CPO',
  '{}'::jsonb
);

INSERT INTO tariff (
  id, country_code, party_id, ocpi_tariff_id, currency, last_updated, created_at, updated_at, partner_id, "eVSEConnectorId",
  ocpi_tariff_element, min_price
)
VALUES
  (
    'b0e0e0e0-e0e0-40e0-8001-000000000001',
    'IN', 'CPO', 'TARIFF1', 'INR',
    '2026-03-29 10:22:40.028', NOW(), NOW(),
    '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
    NULL,
    '[{"price_components":[{"type":"ENERGY","price":20,"step_size":1}]}]'::jsonb,
    '{"excl_vat": 20}'::jsonb
  ),
  (
    'b0e0e0e0-e0e0-40e0-8002-000000000002',
    'IN', 'CPO', 'TARIFF2', 'INR',
    '2026-03-29 10:22:40.028', NOW(), NOW(),
    '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
    NULL,
    '[{"price_components":[{"type":"ENERGY","price":25,"step_size":1}]}]'::jsonb,
    '{"excl_vat": 25}'::jsonb
  );

INSERT INTO location (
  id, ocpi_location_id, name, latitude, longitude, country_code, party_id, city, postal_code, state, country,
  address, time_zone, parking_type, related_locations, directions, operator, suboperator, owner,
  facilities, opening_times, images, energy_mix, charging_when_closed, publish, publish_allowed_to,
  last_updated, deleted, deleted_at, created_at, updated_at, partner_id, external_object_id
) VALUES
(
  'da75e802-13f4-489a-bf42-834e7966b951',
  'LOC1',
  'Station 1 - Hyderabad',
  '17.4435',
  '78.3772',
  'IN',
  'CPO',
  'Hyderabad',
  '500081',
  'Telangana',
  'IND',
  'Hitech City Road',
  'Asia/Kolkata',
  'PUBLIC',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  ARRAY[]::text[],
  '{}'::jsonb,
  '[]'::jsonb,
  NULL,
  NULL,
  true,
  '[]'::jsonb,
  '2026-03-29 10:22:40.027',
  false,
  NULL,
  '2026-03-29 16:34:28.87',
  NOW(),
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'Nmy2vhlMy'
),
(
  'c3845c71-7111-425f-ba8c-e5e593468e2d',
  'LOC2',
  'Station 2 - Bangalore',
  '12.9698',
  '77.7500',
  'IN',
  'CPO',
  'Bangalore',
  '560066',
  'Karnataka',
  'IND',
  'Whitefield Main Road',
  'Asia/Kolkata',
  'PRIVATE',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  ARRAY[]::text[],
  '{}'::jsonb,
  '[]'::jsonb,
  NULL,
  NULL,
  true,
  '[]'::jsonb,
  '2026-03-29 10:22:40.028',
  false,
  NULL,
  '2026-03-29 16:34:29.046',
  NOW(),
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'PeIbx0GPX'
);

INSERT INTO evse (
  id, location_id, uid, evse_id, status, status_schedule, capabilities, floor_level, latitude, longitude,
  physical_reference, directions, parking_restrictions, images, status_errorcode, status_errordescription,
  last_updated, deleted, deleted_at, created_at, updated_at, partner_id, external_object_id
) VALUES
(
  '0dfd9c9b-a2e4-4221-9e55-3a6c1109de95',
  'da75e802-13f4-489a-bf42-834e7966b951',
  'EVSE1',
  'IN*CPO*E1',
  'AVAILABLE',
  '[]'::jsonb,
  ARRAY['REMOTE_START_STOP','CHARGING_PROFILE_CAPABLE']::text[],
  NULL,
  '17.4435',
  '78.3772',
  NULL,
  '[]'::jsonb,
  ARRAY[]::text[],
  '[]'::jsonb,
  NULL,
  NULL,
  '2026-03-29 10:22:40.028',
  false,
  NULL,
  '2026-03-29 16:34:28.937',
  NOW(),
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'JuXFVXS0O'
),
(
  'e62c6691-00a5-4099-b99e-08d14299128b',
  'da75e802-13f4-489a-bf42-834e7966b951',
  'EVSE2',
  'IN*CPO*E2',
  'AVAILABLE',
  '[]'::jsonb,
  ARRAY['REMOTE_START_STOP']::text[],
  NULL,
  '17.4435',
  '78.3772',
  NULL,
  '[]'::jsonb,
  ARRAY[]::text[],
  '[]'::jsonb,
  NULL,
  NULL,
  '2026-03-29 10:22:40.028',
  false,
  NULL,
  '2026-03-29 16:34:28.999',
  NOW(),
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'UvkZ2fiRh'
),
(
  'd7e87818-a264-4182-83f3-b56c430cc681',
  'c3845c71-7111-425f-ba8c-e5e593468e2d',
  'EVSE3',
  'IN*CPO*E3',
  'AVAILABLE',
  '[]'::jsonb,
  ARRAY['REMOTE_START_STOP']::text[],
  NULL,
  '12.9698',
  '77.7500',
  NULL,
  '[]'::jsonb,
  ARRAY[]::text[],
  '[]'::jsonb,
  NULL,
  NULL,
  '2026-03-29 10:22:40.028',
  false,
  NULL,
  '2026-03-29 16:34:29.064',
  NOW(),
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'rkDxsxYiE'
);

INSERT INTO evse_connector (
  id, evse_id, connector_id, standard, format, qr_code, power_type, max_voltage, max_amperage, max_electric_power,
  terms_and_conditions, last_updated, deleted, deleted_at, created_at, updated_at, tariff_ids, partner_id,
  beckn_connector_id, ubc_catalog_id, ubc_publish_enabled, ubc_publish_info
) VALUES
(
  'ac97061e-5ab4-4995-9aad-a5c7b493a61d',
  '0dfd9c9b-a2e4-4221-9e55-3a6c1109de95',
  'C1',
  'IEC_62196_T2',
  'SOCKET',
  NULL,
  'AC_3_PHASE',
  415,
  32,
  NULL,
  NULL,
  '2026-03-29 10:22:40.028',
  false,
  NULL,
  '2026-03-29 16:34:28.979',
  NOW(),
  ARRAY['TARIFF1']::text[],
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'IND*TPC*Nmy2vhlMy*JuXFVXS0O*C1',
  'ea86985e-e1bd-4051-a3be-991f545e2a45',
  'true',
  '{}'::json
),
(
  '7b488329-eba3-4e05-af49-b311758bd8f3',
  'e62c6691-00a5-4099-b99e-08d14299128b',
  'C2',
  'IEC_62196_T2',
  'CABLE',
  NULL,
  'AC_3_PHASE',
  415,
  16,
  NULL,
  NULL,
  '2026-03-29 10:22:40.028',
  false,
  NULL,
  '2026-03-29 16:34:29.014',
  NOW(),
  ARRAY['TARIFF1']::text[],
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'IND*TPC*Nmy2vhlMy*UvkZ2fiRh*C2',
  'cdabd264-38c7-4131-97a6-f3db8c3cf79a',
  'true',
  '{}'::json
),
(
  '4acb5d26-b369-4e50-9e0c-b7c6585bb2ca',
  'd7e87818-a264-4182-83f3-b56c430cc681',
  'C3',
  'IEC_62196_T2',
  'CABLE',
  NULL,
  'DC',
  750,
  200,
  NULL,
  NULL,
  '2026-03-29 10:22:40.028',
  false,
  NULL,
  '2026-03-29 16:34:29.076',
  NOW(),
  ARRAY['TARIFF2']::text[],
  '00bd6fa2-17b3-4c97-af7c-20f0304130c5',
  'IND*TPC*PeIbx0GPX*rkDxsxYiE*C3',
  'd7c96948-516d-4f5b-bfd5-be5e4deb5705',
  'true',
  '{}'::json
);

COMMIT;
