CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  supplier_id uuid REFERENCES suppliers(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  action_date date NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED')),
  created_by uuid NOT NULL REFERENCES users(id),
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_reservations_pending_idx
  ON inventory_reservations(status, action_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_reservations_product_idx
  ON inventory_reservations(product_id, status);
