-- Reconciled from the other developer's 0077 jurisdiction-reference seed.
-- Use 0078 because current main reserves 0077 for private website drafts.
-- These are identity/selection reference rows, NOT verified legal policies.
-- No operating authorization, publication or enrollment is granted.
WITH reference (code, country_code, region_code, name) AS (VALUES
  ('US-AL', 'US', 'AL', 'Alabama'),
  ('US-AK', 'US', 'AK', 'Alaska'),
  ('US-AZ', 'US', 'AZ', 'Arizona'),
  ('US-AR', 'US', 'AR', 'Arkansas'),
  ('US-CA', 'US', 'CA', 'California'),
  ('US-CO', 'US', 'CO', 'Colorado'),
  ('US-CT', 'US', 'CT', 'Connecticut'),
  ('US-DE', 'US', 'DE', 'Delaware'),
  ('US-FL', 'US', 'FL', 'Florida'),
  ('US-GA', 'US', 'GA', 'Georgia'),
  ('US-HI', 'US', 'HI', 'Hawaii'),
  ('US-ID', 'US', 'ID', 'Idaho'),
  ('US-IL', 'US', 'IL', 'Illinois'),
  ('US-IN', 'US', 'IN', 'Indiana'),
  ('US-IA', 'US', 'IA', 'Iowa'),
  ('US-KS', 'US', 'KS', 'Kansas'),
  ('US-KY', 'US', 'KY', 'Kentucky'),
  ('US-LA', 'US', 'LA', 'Louisiana'),
  ('US-ME', 'US', 'ME', 'Maine'),
  ('US-MD', 'US', 'MD', 'Maryland'),
  ('US-MA', 'US', 'MA', 'Massachusetts'),
  ('US-MI', 'US', 'MI', 'Michigan'),
  ('US-MN', 'US', 'MN', 'Minnesota'),
  ('US-MS', 'US', 'MS', 'Mississippi'),
  ('US-MO', 'US', 'MO', 'Missouri'),
  ('US-MT', 'US', 'MT', 'Montana'),
  ('US-NE', 'US', 'NE', 'Nebraska'),
  ('US-NV', 'US', 'NV', 'Nevada'),
  ('US-NH', 'US', 'NH', 'New Hampshire'),
  ('US-NJ', 'US', 'NJ', 'New Jersey'),
  ('US-NM', 'US', 'NM', 'New Mexico'),
  ('US-NY', 'US', 'NY', 'New York'),
  ('US-NC', 'US', 'NC', 'North Carolina'),
  ('US-ND', 'US', 'ND', 'North Dakota'),
  ('US-OH', 'US', 'OH', 'Ohio'),
  ('US-OK', 'US', 'OK', 'Oklahoma'),
  ('US-OR', 'US', 'OR', 'Oregon'),
  ('US-PA', 'US', 'PA', 'Pennsylvania'),
  ('US-RI', 'US', 'RI', 'Rhode Island'),
  ('US-SC', 'US', 'SC', 'South Carolina'),
  ('US-SD', 'US', 'SD', 'South Dakota'),
  ('US-TN', 'US', 'TN', 'Tennessee'),
  ('US-TX', 'US', 'TX', 'Texas'),
  ('US-UT', 'US', 'UT', 'Utah'),
  ('US-VT', 'US', 'VT', 'Vermont'),
  ('US-VA', 'US', 'VA', 'Virginia'),
  ('US-WA', 'US', 'WA', 'Washington'),
  ('US-WV', 'US', 'WV', 'West Virginia'),
  ('US-WI', 'US', 'WI', 'Wisconsin'),
  ('US-WY', 'US', 'WY', 'Wyoming'),
  ('US-DC', 'US', 'DC', 'District of Columbia'),
  ('US-AS', 'US', 'AS', 'American Samoa'),
  ('US-GU', 'US', 'GU', 'Guam'),
  ('US-MP', 'US', 'MP', 'Northern Mariana Islands'),
  ('US-PR', 'US', 'PR', 'Puerto Rico'),
  ('US-VI', 'US', 'VI', 'U.S. Virgin Islands')
)
INSERT INTO "jurisdictions" ("code","country_code","region_code","name")
SELECT reference.code,reference.country_code,reference.region_code,reference.name
FROM reference
WHERE NOT EXISTS (
  SELECT 1 FROM "jurisdictions" existing
  WHERE existing."country_code"=reference.country_code
    AND lower(existing."name")=lower(reference.name)
)
AND NOT EXISTS (
  SELECT 1 FROM "jurisdictions" same_code
  WHERE same_code."code"=reference.code
)
ON CONFLICT DO NOTHING;
