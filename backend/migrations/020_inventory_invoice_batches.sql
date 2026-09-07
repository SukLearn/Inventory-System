CREATE TABLE IF NOT EXISTS inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_movement_id uuid NOT NULL UNIQUE REFERENCES stock_movements(id),
  product_id uuid NOT NULL REFERENCES products(id),
  supplier_id uuid REFERENCES suppliers(id),
  invoice_code text NOT NULL,
  import_date date NOT NULL,
  imported_quantity integer NOT NULL CHECK (imported_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_batch_locations (
  batch_id uuid NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (batch_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS inventory_batch_changes (
  movement_id uuid NOT NULL REFERENCES stock_movements(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity integer NOT NULL CHECK (quantity <> 0),
  PRIMARY KEY (movement_id, batch_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS inventory_batches_invoice_idx
  ON inventory_batches(invoice_code, import_date DESC);
CREATE INDEX IF NOT EXISTS inventory_batches_product_idx
  ON inventory_batches(product_id, import_date, created_at);
CREATE INDEX IF NOT EXISTS inventory_batch_locations_warehouse_idx
  ON inventory_batch_locations(warehouse_id, batch_id);

INSERT INTO inventory_batches(
  source_movement_id,product_id,supplier_id,invoice_code,import_date,
  imported_quantity,created_at
)
SELECT movement.id,movement.product_id,movement.supplier_id,
  movement.invoice_code,
  COALESCE(movement.business_date,movement.created_at::date),
  movement.quantity,movement.created_at
FROM stock_movements movement
WHERE movement.type='IMPORT'
  AND movement.deleted_at IS NULL
  AND movement.invoice_code IS NOT NULL
  AND movement.quantity > 0
ON CONFLICT (source_movement_id) DO NOTHING;

-- Existing installations did not preserve invoice provenance during transfers.
-- Allocate current stock deterministically to the newest import batches (FIFO
-- consumption leaves the newest stock) without changing physical totals.
WITH batch_ranges AS (
  SELECT batch.id batch_id,batch.product_id,batch.imported_quantity,
    sum(batch.imported_quantity) OVER (
      PARTITION BY batch.product_id
      ORDER BY batch.import_date DESC,batch.created_at DESC,batch.id
    ) batch_end
  FROM inventory_batches batch
), location_ranges AS (
  SELECT stock.product_id,stock.warehouse_id,stock.quantity,
    sum(stock.quantity) OVER (
      PARTITION BY stock.product_id
      ORDER BY warehouse.kind,warehouse.name,warehouse.id
    ) location_end
  FROM product_location_stock stock
  JOIN warehouses warehouse ON warehouse.id=stock.warehouse_id
  WHERE stock.quantity > 0
), allocations AS (
  SELECT batch.batch_id,location.warehouse_id,
    GREATEST(
      0,
      LEAST(batch.batch_end,location.location_end)
        - GREATEST(
            batch.batch_end-batch.imported_quantity,
            location.location_end-location.quantity
          )
    )::integer quantity
  FROM batch_ranges batch
  JOIN location_ranges location ON location.product_id=batch.product_id
)
INSERT INTO inventory_batch_locations(batch_id,warehouse_id,quantity)
SELECT batch_id,warehouse_id,quantity
FROM allocations
WHERE quantity > 0
ON CONFLICT (batch_id,warehouse_id) DO NOTHING;

INSERT INTO inventory_batch_changes(movement_id,batch_id,warehouse_id,quantity)
SELECT batch.source_movement_id,location.batch_id,location.warehouse_id,
  location.quantity
FROM inventory_batch_locations location
JOIN inventory_batches batch ON batch.id=location.batch_id
ON CONFLICT DO NOTHING;
