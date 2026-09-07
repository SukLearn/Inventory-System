ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'TRANSPORT';

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid REFERENCES warehouses(id);

CREATE INDEX IF NOT EXISTS stock_movements_destination_warehouse_idx
  ON stock_movements(destination_warehouse_id, created_at DESC)
  WHERE destination_warehouse_id IS NOT NULL;

INSERT INTO categories(name) VALUES
  ('Dullap - კარადა'),
  ('Noptiera - ტუმბო'),
  ('Pat - საწოლი'),
  ('TV Plasma'),
  ('Canapea'),
  ('Masa'),
  ('Masuta'),
  ('Scaun'),
  ('Bufet'),
  ('ბატუტი'),
  ('Comoda'),
  ('დივანი'),
  ('სარკე'),
  ('მატრასი'),
  ('Vitrina'),
  ('ყუთი'),
  ('Bancuta - პუფი'),
  ('სავარძელი'),
  ('საწერი მაგიდა'),
  ('Diedestal'),
  ('ბალიშები'),
  ('სამზარეულო')
ON CONFLICT (name) DO UPDATE SET is_active=true;
