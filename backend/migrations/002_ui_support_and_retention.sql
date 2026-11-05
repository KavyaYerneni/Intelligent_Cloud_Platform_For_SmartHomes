-- Worker cursor used by persistHeartbeats (previously created at runtime every second).
CREATE TABLE IF NOT EXISTS worker_cursor (name text PRIMARY KEY, cursor bigint NOT NULL);
INSERT INTO worker_cursor VALUES ('heartbeat', 0) ON CONFLICT DO NOTHING;
-- Inventory screens filter and count devices per house and room.
CREATE INDEX IF NOT EXISTS devices_house ON devices(tenant_id, house_id, status);
CREATE INDEX IF NOT EXISTS devices_room ON devices(room_id);
-- Alert queue ordering and per-house lookups.
CREATE INDEX IF NOT EXISTS alerts_queue ON alerts(tenant_id, state, severity, created_at DESC);
-- live_events is a short-lived delivery log; pruning uses created_at.
CREATE INDEX IF NOT EXISTS live_events_age ON live_events(created_at);
