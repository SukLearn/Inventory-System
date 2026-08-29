ALTER TABLE product_events ADD COLUMN IF NOT EXISTS field_name text;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS old_value text;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS new_value text;
