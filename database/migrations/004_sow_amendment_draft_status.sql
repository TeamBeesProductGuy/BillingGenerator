ALTER TABLE sows DROP CONSTRAINT IF EXISTS sows_status_check;
ALTER TABLE sows
  ADD CONSTRAINT sows_status_check CHECK (status IN ('Draft', 'Signed', 'Expired', 'Terminated', 'Amendment Draft'));
