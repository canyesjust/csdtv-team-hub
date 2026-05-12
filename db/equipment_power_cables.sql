-- Power cables: extra columns on equipment (run in Supabase SQL editor before using power-cable UI).
-- See docs/features/power-cables/power-cable-cursor-spec.md

alter table public.equipment add column if not exists is_power_cable boolean default false;
alter table public.equipment add column if not exists parent_equipment_id uuid references public.equipment(id) on delete set null;
alter table public.equipment add column if not exists power_input_connector text;
alter table public.equipment add column if not exists power_output_voltage text;
alter table public.equipment add column if not exists power_output_amperage text;
alter table public.equipment add column if not exists power_output_polarity text;
alter table public.equipment add column if not exists power_barrel_size text;
alter table public.equipment add column if not exists power_brand text;

create index if not exists idx_equipment_is_power_cable on public.equipment(is_power_cable) where is_power_cable = true;
create index if not exists idx_equipment_parent_id on public.equipment(parent_equipment_id);
