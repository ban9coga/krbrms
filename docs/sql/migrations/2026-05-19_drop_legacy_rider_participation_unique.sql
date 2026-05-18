drop index if exists uq_rider_participation_event_rider;

create unique index if not exists uq_rider_participation_event_moto_rider
  on rider_participation_status(event_id, moto_id, rider_id);

create index if not exists idx_rider_participation_moto
  on rider_participation_status(moto_id);
