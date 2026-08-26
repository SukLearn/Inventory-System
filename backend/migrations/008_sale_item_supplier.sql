ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);
UPDATE sale_items si SET supplier_id = p.supplier_id FROM products p WHERE p.id = si.product_id AND si.supplier_id IS NULL;
CREATE INDEX IF NOT EXISTS sale_items_supplier_idx ON sale_items(supplier_id);
