-- Generated SQL Seed for Australian Locations
-- Generated at: 2026-07-01T07:48:28.613Z
-- Source: sample_locations.csv

-- 1. Populate Regions
INSERT INTO public.location_regions (state, region_name, region_type, source) VALUES
  ('SA', 'City of Salisbury', 'app_region', 'national_import_pipeline'),
  ('VIC', 'Cardinia Shire', 'app_region', 'national_import_pipeline'),
  ('VIC', 'City of Casey', 'app_region', 'national_import_pipeline'),
  ('VIC', 'City of Greater Dandenong', 'app_region', 'national_import_pipeline'),
  ('VIC', 'City of Melbourne', 'app_region', 'national_import_pipeline'),
  ('NSW', 'City of Sydney', 'app_region', 'national_import_pipeline'),
  ('WA', 'City of Perth', 'app_region', 'national_import_pipeline'),
  ('SA', 'City of Adelaide', 'app_region', 'national_import_pipeline'),
  ('TAS', 'City of Hobart', 'app_region', 'national_import_pipeline'),
  ('ACT', 'Canberra', 'app_region', 'national_import_pipeline'),
  ('QLD', 'Brisbane City', 'app_region', 'national_import_pipeline'),
  ('NT', 'Darwin', 'app_region', 'national_import_pipeline')
ON CONFLICT (state, region_name, region_type) DO NOTHING;

-- 2. Populate Suburbs (Linking to Region IDs dynamically)
WITH regions AS (
  SELECT id, state, region_name FROM public.location_regions WHERE source = 'national_import_pipeline'
)
INSERT INTO public.location_suburbs (suburb, state, postcode, region_id, region_name, display_name, latitude, longitude, source, source_record_id) VALUES
  ('Ingle Farm', 'SA', '5098', (SELECT id FROM regions WHERE state = 'SA' AND region_name = 'City of Salisbury'), 'City of Salisbury', 'Ingle Farm SA 5098', -34.821, 138.636, 'national_import_pipeline', NULL),
  ('Salisbury', 'SA', '5108', (SELECT id FROM regions WHERE state = 'SA' AND region_name = 'City of Salisbury'), 'City of Salisbury', 'Salisbury SA 5108', -34.767, 138.633, 'national_import_pipeline', NULL),
  ('Salisbury Downs', 'SA', '5108', (SELECT id FROM regions WHERE state = 'SA' AND region_name = 'City of Salisbury'), 'City of Salisbury', 'Salisbury Downs SA 5108', -34.781, 138.611, 'national_import_pipeline', NULL),
  ('Salisbury East', 'SA', '5109', (SELECT id FROM regions WHERE state = 'SA' AND region_name = 'City of Salisbury'), 'City of Salisbury', 'Salisbury East SA 5109', -34.779, 138.665, 'national_import_pipeline', NULL),
  ('Pakenham', 'VIC', '3810', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Pakenham VIC 3810', -38.071, 145.485, 'national_import_pipeline', NULL),
  ('Koo Wee Rup', 'VIC', '3981', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Koo Wee Rup VIC 3981', -38.196, 145.491, 'national_import_pipeline', NULL),
  ('Officer', 'VIC', '3809', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Officer VIC 3809', -38.062, 145.419, 'national_import_pipeline', NULL),
  ('Beaconsfield', 'VIC', '3807', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'Cardinia Shire'), 'Cardinia Shire', 'Beaconsfield VIC 3807', -38.05, 145.383, 'national_import_pipeline', NULL),
  ('Berwick', 'VIC', '3806', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'City of Casey'), 'City of Casey', 'Berwick VIC 3806', -38.031, 145.347, 'national_import_pipeline', NULL),
  ('Clyde', 'VIC', '3978', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'City of Casey'), 'City of Casey', 'Clyde VIC 3978', -38.136, 145.344, 'national_import_pipeline', NULL),
  ('Cranbourne', 'VIC', '3977', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'City of Casey'), 'City of Casey', 'Cranbourne VIC 3977', -38.099, 145.283, 'national_import_pipeline', NULL),
  ('Narre Warren', 'VIC', '3805', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'City of Casey'), 'City of Casey', 'Narre Warren VIC 3805', -38.026, 145.305, 'national_import_pipeline', NULL),
  ('Dandenong', 'VIC', '3175', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'City of Greater Dandenong'), 'City of Greater Dandenong', 'Dandenong VIC 3175', -37.981, 145.215, 'national_import_pipeline', NULL),
  ('Melbourne', 'VIC', '3000', (SELECT id FROM regions WHERE state = 'VIC' AND region_name = 'City of Melbourne'), 'City of Melbourne', 'Melbourne VIC 3000', -37.814, 144.963, 'national_import_pipeline', NULL),
  ('Sydney', 'NSW', '2000', (SELECT id FROM regions WHERE state = 'NSW' AND region_name = 'City of Sydney'), 'City of Sydney', 'Sydney NSW 2000', -33.868, 151.209, 'national_import_pipeline', NULL),
  ('Perth', 'WA', '6000', (SELECT id FROM regions WHERE state = 'WA' AND region_name = 'City of Perth'), 'City of Perth', 'Perth WA 6000', -31.95, 115.86, 'national_import_pipeline', NULL),
  ('Adelaide', 'SA', '5000', (SELECT id FROM regions WHERE state = 'SA' AND region_name = 'City of Adelaide'), 'City of Adelaide', 'Adelaide SA 5000', -34.928, 138.6, 'national_import_pipeline', NULL),
  ('Hobart', 'TAS', '7000', (SELECT id FROM regions WHERE state = 'TAS' AND region_name = 'City of Hobart'), 'City of Hobart', 'Hobart TAS 7000', -42.882, 147.327, 'national_import_pipeline', NULL),
  ('Canberra', 'ACT', '2600', (SELECT id FROM regions WHERE state = 'ACT' AND region_name = 'Canberra'), 'Canberra', 'Canberra ACT 2600', -35.28, 149.13, 'national_import_pipeline', NULL),
  ('Brisbane', 'QLD', '4000', (SELECT id FROM regions WHERE state = 'QLD' AND region_name = 'Brisbane City'), 'Brisbane City', 'Brisbane QLD 4000', -27.469, 153.025, 'national_import_pipeline', NULL),
  ('Darwin', 'NT', '0800', (SELECT id FROM regions WHERE state = 'NT' AND region_name = 'Darwin'), 'Darwin', 'Darwin NT 0800', -12.463, 130.844, 'national_import_pipeline', NULL)
ON CONFLICT (suburb, state, postcode) DO UPDATE
SET
  region_id = EXCLUDED.region_id,
  region_name = EXCLUDED.region_name,
  display_name = EXCLUDED.display_name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  source = EXCLUDED.source,
  is_verified = true,
  is_active = true;

