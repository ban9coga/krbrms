with ranked as (
  select
    id,
    row_number() over (
      partition by rider_id
      order by created_at desc, id desc
    ) as rn
  from rider_extra_categories
)
delete from rider_extra_categories rec
using ranked
where rec.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists uq_rider_extra_category_rider
  on rider_extra_categories(rider_id);
