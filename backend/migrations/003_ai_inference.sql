-- Model management is per tenant: an operator enables, disables or picks the
-- version of a model for their own community only. No row = enabled with the
-- newest loaded version.
CREATE TABLE ai_model_settings (
  tenant_id text NOT NULL REFERENCES tenants,
  model_name text NOT NULL,
  version text,
  enabled boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, model_name)
);
-- One row per inference attempt, including failures that never became events,
-- for the live monitoring statistics on the AI models page.
CREATE TABLE ai_inferences (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants,
  house_id text,
  device_id text,
  event_id text,
  model_name text,
  model_version text,
  label text,
  event_type text,
  confidence double precision CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  latency_ms double precision,
  audio_seconds double precision,
  status text NOT NULL CHECK (status IN ('OK', 'FAILED', 'REJECTED', 'TEST')),
  error_code text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_inferences_recent ON ai_inferences (tenant_id, created_at DESC);
