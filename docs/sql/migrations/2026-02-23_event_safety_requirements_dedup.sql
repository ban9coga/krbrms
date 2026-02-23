-- Deduplicate event_safety_requirements and prevent future duplicates

-- 1) Remove duplicate rows (keep earliest created_at, then lowest id)
with ranked as (
  select
    id,
    row_number() over (
      partition by event_id, label, sort_order
      order by created_at asc, id asc
    ) as rn
  from event_safety_requirements
)
delete from event_safety_requirements
where id in (select id from ranked where rn > 1);

-- 2) Prevent duplicates going forward
create unique index if not exists uq_event_safety_requirements
  on event_safety_requirements(event_id, label, sort_order);
