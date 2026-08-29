-- Index foreign keys and filters used by the main sales, returns, reservations,
-- delivery, and reporting queries. PostgreSQL does not create these indexes
-- automatically for foreign keys.
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx
  ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_id_idx
  ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx
  ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS sale_refunds_sale_id_idx
  ON sale_refunds(sale_id);
CREATE INDEX IF NOT EXISTS sale_refunds_sale_item_id_idx
  ON sale_refunds(sale_item_id);
CREATE INDEX IF NOT EXISTS stock_movements_reference_idx
  ON stock_movements(reference_id, type)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reservations_active_expiry_idx
  ON reservations(expires_at)
  WHERE status = 'ACTIVE' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_supplier_idx
  ON products(supplier_id);
CREATE INDEX IF NOT EXISTS sales_delivery_status_idx
  ON sales(delivery_status);
