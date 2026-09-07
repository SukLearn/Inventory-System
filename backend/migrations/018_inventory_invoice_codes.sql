ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS invoice_code text;

CREATE INDEX IF NOT EXISTS stock_movements_invoice_code_idx
  ON stock_movements(invoice_code, product_id)
  WHERE type='IMPORT' AND deleted_at IS NULL AND invoice_code IS NOT NULL;
