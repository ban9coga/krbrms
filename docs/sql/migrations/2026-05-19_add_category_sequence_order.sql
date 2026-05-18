alter table categories
  add column if not exists sequence_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by event_id
      order by year_min asc nulls last, gender asc, created_at asc nulls last, id asc
    ) as next_sequence
  from categories
  where sequence_order is null
)
update categories c
set sequence_order = ranked.next_sequence
from ranked
where c.id = ranked.id;

create index if not exists categories_event_sequence_order_idx
  on categories(event_id, sequence_order);
