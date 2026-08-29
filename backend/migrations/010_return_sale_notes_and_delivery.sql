-- Preserve existing return details on their original sales and cancel delivery
-- when the returned order had not yet entered transit.
WITH return_lines AS (
  SELECT
    s.id AS sale_id,
    s.notes AS existing_notes,
    sm.created_at,
    'RETURN | ' || p.name || ' | Quantity: ' || sm.quantity::text ||
      ' | Notes: ' || COALESCE(NULLIF(sm.notes, ''), 'Customer return') AS line
  FROM stock_movements sm
  JOIN sale_items si ON si.id = sm.reference_id
  JOIN sales s ON s.id = si.sale_id
  JOIN products p ON p.id = sm.product_id
  WHERE sm.type = 'RETURN'
    AND sm.deleted_at IS NULL
), additions AS (
  SELECT
    sale_id,
    string_agg(line, E'\n' ORDER BY created_at) AS return_notes
  FROM return_lines
  WHERE existing_notes IS NULL OR strpos(existing_notes, line) = 0
  GROUP BY sale_id
)
UPDATE sales s
SET notes = CASE
      WHEN s.notes IS NULL OR btrim(s.notes) = '' THEN a.return_notes
      ELSE s.notes || E'\n' || a.return_notes
    END,
    delivery_status = CASE
      WHEN s.delivery_status NOT IN ('IN_TRANSIT', 'DELIVERED') THEN 'CANCELLED'
      ELSE s.delivery_status
    END,
    delivery_required = CASE
      WHEN s.delivery_status NOT IN ('IN_TRANSIT', 'DELIVERED') THEN false
      ELSE s.delivery_required
    END,
    updated_at = now()
FROM additions a
WHERE a.sale_id = s.id;

-- The old workflow used TAKEN_OUT between READY and IN_TRANSIT. The new
-- workflow starts transit directly, so preserve those orders at IN_TRANSIT.
UPDATE sales
SET delivery_status = 'IN_TRANSIT',
    delivery_required = true,
    updated_at = now()
WHERE delivery_status = 'TAKEN_OUT';
