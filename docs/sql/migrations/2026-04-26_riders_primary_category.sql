alter table if exists riders
  add column if not exists primary_category_id uuid references categories(id) on delete set null;

create index if not exists idx_riders_primary_category on riders(primary_category_id);

with matched_primary as (
  select
    riders.id as rider_id,
    categories.id as category_id,
    row_number() over (
      partition by riders.id
      order by
        case
          when categories.gender = riders.gender then 0
          when categories.gender = 'MIX' then 1
          else 2
        end,
        coalesce(categories.year_max, categories.year) asc,
        coalesce(categories.year_min, categories.year) asc
    ) as choice_rank
  from riders
  join categories
    on categories.event_id = riders.event_id
   and categories.enabled = true
   and riders.birth_year between coalesce(categories.year_min, categories.year) and coalesce(categories.year_max, categories.year)
   and (categories.gender = riders.gender or categories.gender = 'MIX')
  where riders.primary_category_id is null
)
update riders
set primary_category_id = matched_primary.category_id
from matched_primary
where riders.id = matched_primary.rider_id
  and matched_primary.choice_rank = 1
  and riders.primary_category_id is null;
