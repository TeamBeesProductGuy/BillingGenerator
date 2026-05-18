-- Recalculate existing SOW totals with the corrected effective-month rule.
-- A date range ending on or before the monthly anniversary does not add an extra month;
-- only dates after the anniversary round up to the next effective month.

UPDATE sows s
SET total_value = COALESCE(t.total_value, 0),
    updated_at = NOW()
FROM (
  SELECT
    si.sow_id,
    ROUND(SUM(
      COALESCE(si.amount, 0)
      * COALESCE(si.quantity, 1)
      * GREATEST(
          (
            (EXTRACT(YEAR FROM COALESCE(si.valid_to, s2.effective_end)::date) - EXTRACT(YEAR FROM COALESCE(si.valid_from, s2.effective_start)::date)) * 12
            + (EXTRACT(MONTH FROM COALESCE(si.valid_to, s2.effective_end)::date) - EXTRACT(MONTH FROM COALESCE(si.valid_from, s2.effective_start)::date))
            + CASE
                WHEN EXTRACT(DAY FROM COALESCE(si.valid_to, s2.effective_end)::date) > EXTRACT(DAY FROM COALESCE(si.valid_from, s2.effective_start)::date)
                THEN 1
                ELSE 0
              END
          ),
          1
        )
    ), 2) AS total_value
  FROM sow_items si
  JOIN sows s2 ON s2.id = si.sow_id
  GROUP BY si.sow_id
) t
WHERE s.id = t.sow_id;
