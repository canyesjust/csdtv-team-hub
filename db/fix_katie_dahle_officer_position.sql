-- Katie Dahle is a board member but not an officer; Andrew Edtl is Vice President.
UPDATE public.lower_third_people
SET officer_position = NULL
WHERE display_name ILIKE 'Katie Dahle%'
  AND officer_position IS NOT NULL;
