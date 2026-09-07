CREATE TABLE IF NOT EXISTS invoice_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO invoice_codes(code,created_by,created_at,updated_at)
SELECT DISTINCT ON (movement.invoice_code)
  movement.invoice_code,movement.user_id,movement.created_at,movement.created_at
FROM stock_movements movement
WHERE movement.invoice_code IS NOT NULL
ORDER BY movement.invoice_code,movement.created_at
ON CONFLICT (code) DO NOTHING;

ALTER TABLE inventory_batches
  ADD CONSTRAINT inventory_batches_invoice_code_fk
  FOREIGN KEY (invoice_code) REFERENCES invoice_codes(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_invoice_code_fk
  FOREIGN KEY (invoice_code) REFERENCES invoice_codes(code)
  ON UPDATE CASCADE ON DELETE RESTRICT;
