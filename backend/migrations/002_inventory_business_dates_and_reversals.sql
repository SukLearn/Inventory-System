ALTER TABLE products DROP COLUMN IF EXISTS minimum_stock;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS deletion_reason text;

UPDATE stock_movements SET business_date = created_at::date WHERE business_date IS NULL AND type = 'IMPORT';
CREATE INDEX IF NOT EXISTS stock_movements_business_date_idx ON stock_movements(business_date DESC);
