-- Delete all race results for event d3857847-99b3-4fee-9177-296b92bb7430
-- This script deletes all related data in the correct order

BEGIN;

SET search_path = public;

-- Event ID constant
DO $$
DECLARE
  v_event_id UUID := 'd3857847-99b3-4fee-9177-296b92bb7430'::UUID;
BEGIN

-- 1. Delete penalty approvals (depends on rider_penalties)
DELETE FROM rider_penalty_approvals
WHERE penalty_id IN (
  SELECT id FROM rider_penalties WHERE event_id = v_event_id
);

-- 2. Delete rider penalties
DELETE FROM rider_penalties WHERE event_id = v_event_id;

-- 3. Delete rider status updates (approval cascade will handle this)
DELETE FROM rider_status_updates WHERE event_id = v_event_id;

-- 4. Delete rider participation status
DELETE FROM rider_participation_status WHERE event_id = v_event_id;

-- 5. Delete rider safety checks
DELETE FROM rider_safety_checks WHERE event_id = v_event_id;

-- 6. Delete race awards
DELETE FROM race_awards WHERE event_id = v_event_id;

-- 7. Delete moto gate positions (depends on motos in event)
DELETE FROM moto_gate_positions 
WHERE moto_id IN (
  SELECT id FROM motos WHERE event_id = v_event_id
);

-- 8. Delete moto locks (depends on motos in event)
DELETE FROM moto_locks 
WHERE event_id = v_event_id;

-- 9. Delete race stage results (all stages including FINAL for this event's categories)
DELETE FROM race_stage_result
WHERE category_id IN (
  SELECT id FROM categories WHERE event_id = v_event_id
);

-- 10. Delete moto_riders associations for all motos in this event
DELETE FROM moto_riders
WHERE moto_id IN (
  SELECT id FROM motos WHERE event_id = v_event_id
);

-- 11. Delete results (main table) - happens cascade with motos
DELETE FROM results WHERE event_id = v_event_id;

-- 12. Audit log entries (optional - for historical record)
DELETE FROM audit_log WHERE event_id = v_event_id;

RAISE NOTICE 'Successfully deleted all race results for event %', v_event_id;
RAISE NOTICE 'Deleted motos cascade handling should clean up moto-level data';

END $$;

COMMIT;

-- Verification query (run separately to check):
-- SELECT 
--   (SELECT COUNT(*) FROM results WHERE event_id = 'd3857847-99b3-4fee-9177-296b92bb7430') as result_count,
--   (SELECT COUNT(*) FROM race_stage_result WHERE category_id IN (SELECT id FROM categories WHERE event_id = 'd3857847-99b3-4fee-9177-296b92bb7430')) as stage_result_count,
--   (SELECT COUNT(*) FROM rider_penalties WHERE event_id = 'd3857847-99b3-4fee-9177-296b92bb7430') as penalty_count,
--   (SELECT COUNT(*) FROM race_awards WHERE event_id = 'd3857847-99b3-4fee-9177-296b92bb7430') as awards_count,
--   (SELECT COUNT(*) FROM motos WHERE event_id = 'd3857847-99b3-4fee-9177-296b92bb7430') as motos_count;

