-- Cover foreign-key lookups and list/report filters that are used throughout
-- the product, reservation, inventory, and activity pages.
CREATE INDEX IF NOT EXISTS products_category_idx
  ON products(category_id);
CREATE INDEX IF NOT EXISTS product_images_product_primary_idx
  ON product_images(product_id,is_primary DESC,created_at);
CREATE INDEX IF NOT EXISTS product_events_product_created_idx
  ON product_events(product_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reservations_product_idx
  ON reservations(product_id);
CREATE INDEX IF NOT EXISTS reservations_supplier_idx
  ON reservations(supplier_id);
CREATE INDEX IF NOT EXISTS reservations_status_idx
  ON reservations(status);
CREATE INDEX IF NOT EXISTS stock_movements_supplier_idx
  ON stock_movements(supplier_id);
CREATE INDEX IF NOT EXISTS stock_movements_active_type_created_idx
  ON stock_movements(type,created_at DESC)
  WHERE deleted_at IS NULL;
