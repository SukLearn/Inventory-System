ALTER TABLE reservations ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS business_date date;
UPDATE sales SET business_date = created_at::date WHERE business_date IS NULL;
ALTER TABLE sales ALTER COLUMN business_date SET DEFAULT current_date;
ALTER TABLE sales ALTER COLUMN business_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS sales_business_date_idx ON sales(business_date DESC);
