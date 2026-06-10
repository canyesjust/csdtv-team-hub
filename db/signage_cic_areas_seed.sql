-- Seed CIC signage areas (the CTE programs + shared spaces). Idempotent.
-- Run AFTER signage_sites_foundation.sql. Areas are scoped to the CIC site.

INSERT INTO public.signage_areas (name, slug, site_id, sort_order)
SELECT v.name, v.slug, (SELECT id FROM public.signage_sites WHERE slug = 'cic'), v.ord
FROM (VALUES
  -- Programs
  ('Business Leadership / Project Management', 'business-leadership', 10),
  ('Construction Management',                  'construction-management', 20),
  ('Cosmetology / Barbering',                  'cosmetology-barbering', 30),
  ('Criminal Justice',                         'criminal-justice', 40),
  ('Cybersecurity / Networking',               'cybersecurity-networking', 50),
  ('3D Animation',                             '3d-animation', 60),
  ('Emergency Medical Technician (EMT)',       'emt', 70),
  ('Engineering Pathway',                      'engineering', 80),
  ('Heavy Duty Mechanics / Diesel',            'diesel-mechanics', 90),
  ('Medical Assisting',                        'medical-assisting', 100),
  ('Medical Forensics',                        'medical-forensics', 110),
  ('Medical Innovations Pathway (MIP)',        'mip', 120),
  ('Nurse Assistant (CNA)',                    'cna', 130),
  ('Physical Therapy',                         'physical-therapy', 140),
  ('Programming / Software Development',        'software-development', 150),
  ('Welding Technician',                       'welding', 160),
  ('Video Productions',                        'video-productions', 170),
  -- Shared spaces
  ('Front Office',                             'front-office', 200),
  ('Auditorium',                              'auditorium', 210),
  ('Cafeteria',                               'cafeteria', 220),
  ('Commons Area',                            'commons', 230),
  ('Meeting Space',                           'meeting-space', 240),
  ('Collision Spaces',                        'collision', 250)
) AS v(name, slug, ord)
ON CONFLICT (slug) DO NOTHING;
