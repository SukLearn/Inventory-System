ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('SHOWROOM', 'WAREHOUSE')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO warehouses(name, slug, kind) VALUES
  ('Showroom', 'showroom', 'SHOWROOM'),
  ('Galovani', 'galovani', 'WAREHOUSE'),
  ('Isani', 'isani', 'WAREHOUSE')
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind;

CREATE TABLE IF NOT EXISTS product_location_stock (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);

INSERT INTO product_location_stock(product_id, warehouse_id, quantity)
SELECT p.id, w.id, p.current_quantity
FROM products p
CROSS JOIN warehouses w
WHERE w.slug='showroom'
ON CONFLICT (product_id, warehouse_id) DO NOTHING;

INSERT INTO product_location_stock(product_id, warehouse_id, quantity)
SELECT p.id, w.id, 0
FROM products p
CROSS JOIN warehouses w
ON CONFLICT (product_id, warehouse_id) DO NOTHING;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id);

UPDATE stock_movements
SET warehouse_id=(SELECT id FROM warehouses WHERE slug='showroom')
WHERE warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS product_location_stock_warehouse_idx
  ON product_location_stock(warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS stock_movements_warehouse_idx
  ON stock_movements(warehouse_id, created_at DESC);
