ALTER TABLE reservations ADD COLUMN IF NOT EXISTS selling_price numeric(12,2) CHECK (selling_price >= 0);
UPDATE reservations r SET selling_price = p.selling_price FROM products p WHERE p.id = r.product_id AND r.selling_price IS NULL;
