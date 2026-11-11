# Implemented and deferred

## Implemented local prototype

- Real AI component (docs/components/ai-model.md): inference service running the team's trained YAMNet-based audio classifier; live microphone clips become model events and, through the alert rules, alerts; model registry with checksum verification; AI models page with live monitoring, model card, enable/disable, test console and label mapping; dataset replay agent; held-out evaluation script; Docker deployment.
- Redesigned UI (docs/UI_DESIGN.md): attention-ranked overview with map and house drawer, split alert queue/detail with lifecycle stepper, house/room tree with device drawer, data operations with storage-state drawer, and a simulator with live rule preview. Accessible dialogs replace browser prompts. Server-side device search/filters with totals.
- Four connected React component screens with API-backed data, map/table alternative, drill-down, loading/error/empty states, scoped context, live reconnection and stale indication.
- Local expiring authentication, server role/tenant/house checks, device credentials, scope-checked WebSocket subscriptions, audit logs and bounded input/query sizes.
- House/room/device creation, metadata/configuration edits, guarded archive, unique serials, heartbeat validation and offline expiry, desired/reported configuration versions, allowlisted commands and simulator acknowledgments.
- Corrected event schema, idempotency, configured severity thresholds, grouping, assignment, exact lifecycle guards, optimistic concurrency, immutable event evidence and simulated notification retry records.
- PostgreSQL migrations/constraints/transactions and MongoDB indexes/90-day routine telemetry TTL, durable intake jobs, retry/quarantine, recovery UI, event history and CSV page export.
- Local Compose path, host development commands, CLI/UI simulator, unit/API/integration/browser test sources, four component demonstration scripts and EC2 deployment handoff.

## Deferred or limited — do not claim these as complete

- AWS provisioning and deployment verification are owned by the user. IoT Core MQTT/certificates/shadows, SQS, SNS, Cognito/MFA, S3 media, CloudWatch/CloudTrail, ALB/Auto Scaling, RDS/Atlas managed-service configuration are not integrated.
- AI: no training pipeline in the app (training stays in the team's notebooks), no model upload through the UI, and no GPU deployment. The appliance classifier is not deployed (no model file was provided). The audio clip itself is not stored, only the classification and its provenance.
- Tenant/user invitation, suspension and cross-tenant staff administration UI; contact/subscription/privacy-policy management; per-tenant configurable severity/retention policy UI.
- Uptime percentage reports, historical trend charts, groupBy summary semantics, cursor pagination and full-dataset exports. Current history uses bounded stable page ordering; data summary supplies event/alert counts only.
- Separate device configuration delivery transport: simulator reads desired config from heartbeat response. Physical hardware restart/mute execution is not implemented or claimed.
- Internal classifier/notification HTTP endpoints from logical design are internal functions, not exposed services. Notification targets are simulated labels, not real recipients.
- Raw audio/video, resident records, device log/sound feature collections and long-term alert evidence retention policy. Mongo event/AI evidence is retained; routine telemetry and heartbeat history expire after 90 days. Live delivery log is pruned after 24 hours; audit and alert history retention policy is still to be chosen.
- Complete production-grade database least-privilege grants/RLS, encryption/key management, failover, backup restoration rehearsal and security review.
- Performance/availability targets (p95, 50 concurrent users, 99.5% availability, RPO/RTO) have not been established by load/availability testing. Cloud deployment tests cannot pass locally.
- Video recording/upload, slides and final report are not created by this implementation task. Use the provided recording checklists and record your own demonstrations.

The provided designs describe a broader cloud target than this local prototype. The traceability matrix distinguishes implemented paths, supporting tests, partial features and cloud-deferred work. Actual test execution is listed separately in VALIDATION.md.
