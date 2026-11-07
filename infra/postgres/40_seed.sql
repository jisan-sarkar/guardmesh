INSERT INTO inventory_items (sku, location_id, available, version)
VALUES
  ('sku-1', 'loc-a', 100, 1),
  ('sku-2', 'loc-a', 50, 1)
ON CONFLICT (sku) DO NOTHING;
