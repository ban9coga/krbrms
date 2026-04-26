with matched_registration_items as (
  select
    riders.id as rider_id,
    registration_items.primary_category_id as intended_primary_category_id,
    row_number() over (
      partition by riders.id
      order by registration_items.created_at desc, registration_items.id desc
    ) as choice_rank
  from riders
  join registrations
    on registrations.event_id = riders.event_id
   and registrations.status = 'APPROVED'
  join registration_items
    on registration_items.registration_id = registrations.id
   and registration_items.status = 'APPROVED'
   and registration_items.primary_category_id is not null
   and registration_items.rider_name = riders.name
   and coalesce(registration_items.rider_nickname, '') = coalesce(riders.rider_nickname, '')
   and registration_items.date_of_birth = riders.date_of_birth
   and registration_items.gender = riders.gender
   and coalesce(registration_items.club, '') = coalesce(riders.club, '')
   and coalesce(registration_items.requested_plate_number, '') = coalesce(riders.plate_number, '')
   and coalesce(registration_items.requested_plate_suffix, '') = coalesce(riders.plate_suffix::text, '')
)
update riders
set primary_category_id = matched_registration_items.intended_primary_category_id
from matched_registration_items
where riders.id = matched_registration_items.rider_id
  and matched_registration_items.choice_rank = 1
  and riders.primary_category_id is distinct from matched_registration_items.intended_primary_category_id;
