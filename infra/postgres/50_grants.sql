DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'orders_app') THEN
    CREATE ROLE orders_app LOGIN PASSWORD 'orders-change-me-local-only';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory_app') THEN
    CREATE ROLE inventory_app LOGIN PASSWORD 'inventory-change-me-local-only';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'security_app') THEN
    CREATE ROLE security_app LOGIN PASSWORD 'security-change-me-local-only';
  END IF;
END $$;

GRANT CONNECT ON DATABASE guardmesh TO orders_app, inventory_app, security_app;
GRANT USAGE ON SCHEMA public TO orders_app, inventory_app, security_app;

GRANT SELECT, INSERT, UPDATE ON orders, orders_outbox, orders_inbox TO orders_app;
GRANT SELECT, INSERT, UPDATE ON inventory_items, reservations, inventory_inbox, inventory_outbox TO inventory_app;
GRANT SELECT, INSERT, UPDATE ON security_events, security_inbox, security_alerts TO security_app;
