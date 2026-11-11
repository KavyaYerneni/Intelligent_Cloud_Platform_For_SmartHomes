CREATE INDEX ai_inferences_event ON ai_inferences(tenant_id,event_id,id) WHERE status='OK';
CREATE INDEX ai_inferences_house_recent ON ai_inferences(tenant_id,house_id,created_at DESC) WHERE status='OK';
