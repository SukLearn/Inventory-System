ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK(deposit_paid>=0);
