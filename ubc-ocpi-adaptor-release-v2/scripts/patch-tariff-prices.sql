-- Non-destructive: set OCPI energy prices for demo tariffs (fixes beckn offer price 0 → CDS 400).
UPDATE tariff
SET ocpi_tariff_element = '[{"price_components":[{"type":"ENERGY","price":20,"step_size":1}]}]'::jsonb,
    min_price = '{"excl_vat": 20}'::jsonb
WHERE ocpi_tariff_id = 'TARIFF1';

UPDATE tariff
SET ocpi_tariff_element = '[{"price_components":[{"type":"ENERGY","price":25,"step_size":1}]}]'::jsonb,
    min_price = '{"excl_vat": 25}'::jsonb
WHERE ocpi_tariff_id = 'TARIFF2';
