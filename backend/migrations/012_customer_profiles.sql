ALTER TABLE customers ADD COLUMN IF NOT EXISTS surname text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS nationality text;

CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales(customer_id);
CREATE INDEX IF NOT EXISTS reservations_customer_idx ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON audit_logs(entity_type,entity_id,created_at DESC);
