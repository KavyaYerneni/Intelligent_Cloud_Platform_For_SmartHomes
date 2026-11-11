# Requirements traceability

Read against all five supplied Word designs, including API tables, rules, state tables and embedded diagrams. Function/rule IDs below are from the individual designs; FR/NFR IDs are from the overall design. `Implemented` describes a code path, not proof of successful execution; see VALIDATION.md for actual results. Demo steps refer to the component guides.

| Requirement | Owner/component | Implementation | Verification source | Demo |
|---|---|---|---|---|
| F-D-01 / FR-15 scoped summary | Yaswanth | backend/dashboard.js snapshot, frontend/views/dashboard/Overview.jsx | dashboard unit; ui attention.test.js; e2e overview step | Dashboard 1–2 |
| F-D-02, B-D-04 versioned live events | Yaswanth | backend/live.js durable sequence; frontend/lib/useLive.js | integration socket assertion | Dashboard 3 |
| F-D-03 / FR-16 map markers | Yaswanth | frontend/views/dashboard/HouseMap.jsx; backend houseHealth | dashboard unit; browser/manual | Dashboard 2–3 |
| F-D-04 / B-D-03 stale/reconnect | Yaswanth | useLive heartbeat timeout/backoff/snapshot | manual failure demo | Dashboard 4 |
| F-D-05 drill-down | Yaswanth | map/table selection; device/alert/timeline views | browser scenario/manual | Dashboard 2 |
| B-D-01 scoped records | Shared/Yaswanth | security.house/inScope, snapshot query scope | unit scope + integration outsider/owner; e2e owner test | Dashboard 5 |
| B-D-02 health precedence | Yaswanth | domain.houseHealth | dashboard.test.js | Dashboard 3 |
| Preferences API | Yaswanth | preferences table, GET/PUT, map view save | manual | Dashboard 2 |
| Shared rule catalog (ALERT_RULES, COMMANDS, DEVICE_TYPES) | Kavya/Siddharth | domain.js tables; GET /api/v1/catalog | ui-support catalog test; rules-parity | Alerts 1, Devices 5 |
| Server-side device filters, totals, room counts | Siddharth | GET /devices q/status/type/roomId/total; rooms deviceCount/onlineCount | ui-support integration | Devices 2–3 |
| Live log retention | Srija/shared | migration 002, processing.pruneLiveEvents | code review; not separately tested | Data 2 |
| Loading/empty/error/unauthorized | Yaswanth/shared UI | frontend/ui/Feedback.jsx state components, lib/useLoad.js | browser/manual | Dashboard 4–5 |
| F-I-01 / B-I-01 / FR-04–07 | Siddharth | inventory house/room/device creation, credentials | integration duplicate/scope; ui-support existingDeviceId; e2e registration + duplicate | Devices 1–3 |
| F-I-02 / FR-08 versioned config | Siddharth | configurations table, desired/reported versions | manual simulator | Devices 4 |
| F-I-03 / B-I-02 / FR-09 heartbeat | Siddharth | heartbeat route, worker expiry | unit timestamp, integration replay | Devices 3, 6 |
| F-I-04 / B-I-03 commands | Siddharth | allowlist, idempotency, state checks, ACK API | API integration extensions/manual | Devices 5 |
| F-I-05 / B-I-04 archive | Siddharth | guarded soft archive, credential revocation | integration archived heartbeat | Devices 7 |
| House/room management | Siddharth | creation/edit/archive APIs, UI house edit/archive | integration creation/manual | Devices 1–2 |
| F-A-01 / FR-11 event validation | Kavya | domain.eventSchema, alerts.acceptEvent | data unit + integration | Alerts 1 |
| F-A-02 / B-A-01/02 severity | Kavya | domain.classify simulated/rule adapter | alerts unit boundaries; ui rules-parity.test.js | Alerts 1–2 |
| F-A-03 / B-A-03 / FR-12 grouping | Kavya | processing device lock + grouping window | integration replay; grouping tests | Alerts 2 |
| F-A-04 / B-A-04 / FR-13 lifecycle | Kavya | checkTransition, SQL row lock/version, audit | alerts unit; ui lifecycle.test.js; e2e acknowledge/investigate/resolve | Alerts 3–5 |
| B-A-05 escalation | Kavya | escalate/state routes + notification record | unit guard/manual | Alerts 4 |
| F-A-05 / FR-14 durable publish | Kavya/shared | transactional live log, notification job attempts | socket integration/manual failure | Alerts 6 |
| Assignment, allowed actions, notes | Kavya | scoped active assignee, allowedActions DTO | integration/manual | Alerts 3–5 |
| Permitted reopening | Kavya | new matching event after resolution creates new alert; no manual reopen | integration manual reopen denial | Alerts 5 |
| F-DATA-01 envelope normalization | Srija | Zod schema, accepted timestamp normalization | data unit + integration | Data 1 |
| F-DATA-02 / B-DATA-01/02 persist/idempotency | Srija | SQL durable intake; Mongo unique upsert; atomic alert finalization | real-store integration | Data 2 |
| F-DATA-03 / B-DATA-03 history | Srija | required house and <=31d range, page max100 | unit bounds + API history | Data 1 |
| F-DATA-04 / B-DATA-04 reconcile | Srija | retries/backoff/quarantine, tenant reconcile lock | partial-write integration + manual outage | Data 3–4 |
| F-DATA-05 health | Srija | data.health stores/indexes/lag/backlog | manual dependency failure | Data 3 |
| Relational integrity/migrations | Srija | 001_initial.sql composite FKs/uniques/checks, migrate.js | migrations + integration | Data 2 |
| Mongo indexes/retention | Srija | db.indexes, 90d TTL telemetry/status | live index inspection/manual | Data 2 |
| Authorized operations UI | Srija | views/data/DataOps.jsx operator tabs and server role checks | integration technician denial | Data 5 |
| CSV export | Srija | authorized displayed-page export, spreadsheet formula escaping | manual | Data 1 |
| FR-01/02 authentication/RBAC | Shared | local JWT/password hashes, per-request current profile, house scopes | security unit/API tests | All sign-in and denial |
| FR-11 AI events: type, confidence, model version, source | Kavya | backend/ai.js audio adapter, ml/ inference service, AI_LABEL_MAP | unit ai.test.js; integration ai.test.js; e2e ai.spec.js | AI demo 4-5 |
| AIModel entity (SD 4.1.1): name, version, checksum, enabled | Kavya/Srija | ml manifest + SHA-256 check, ai_model_settings (migration 003), AI models page | ml test_registry; integration model management | AI demo 1, 6 |
| C3 §2.2 classifier adapter | Kavya | ml/ /classify, backend/ml.js client, 503 + retry instead of UNKNOWN (DECISIONS 19) | integration failure test; ml test_api | AI demo 7 |
| Rubric: AI UI, model management, deployment | Kavya | frontend/views/ai, operator enable/disable, ml/Dockerfile + compose + DEPLOYMENT.md | e2e ai.spec.js; ui ai.test.jsx | AI demo 1-7 |
| Model evaluation | Kavya | ml/evaluate.py (held out via training-recordings.txt), evaluation.json on model card | not run here (dataset not available); reported metrics shown with caveat | AI demo 1 |
| FR-03 tenant management | Shared | tenant table/status guard and seeded tenants only | schema inspection | Deferred admin UI |
| FR-10 authenticated MQTT | Siddharth/shared | HTTP device-auth substitute only | HTTP integration | AWS MQTT deferred |
| FR-17 reports/history | Srija/Yaswanth | history/summary/page CSV implemented; uptime/trends partial | history integration | Data 1; reports deferred |
| FR-18 operations | Shared/Srija | local API/data health; AWS instance/queue metrics deferred | manual | Data 3 |
| FR-19 audit | Shared | audit writes for login, config, inventory, lifecycle, denials | integration history | Alerts 5/Data 5 |
| FR-20 data lifecycle | Srija | routine TTL, evidence kept; configurable lifecycle UI deferred | index inspection | Data 2 |
| NFR-01/02 latency | Shared | asynchronous worker and live poll intended to meet targets | Load/latency tests not yet run | Not established |
| NFR-03/04 availability/scaling | Shared/cloud | row-lock workers + durable live polling | EC2/ALB failure test deferred | Hosting handoff |
| NFR-05/06 security/privacy | Shared | local role/scope/audit/size controls, synthetic data | tests; production review deferred | Denial demos |
| NFR-07 retry/idempotency | Srija/Kavya | durable retries, bounded quarantine | unit/integration/manual outage | Data 3–4 |
| NFR-08 RPO/RTO | Shared/cloud | deployment backup/restore instructions only | Restore rehearsal deferred | Hosting handoff |
| NFR-09 maintainability | Shared | modules, migrations, health, env, versioned contracts | build/unit/API checks | Component explanation |
| NFR-10/11 usability/compatibility | UI owners | responsive layout, labeled forms, focus styling, three-step navigation | e2e (Chromium); screenshots reviewed at 1440 and 820 px; Safari/Edge not tested | Recording checklist |
| NFR-12 observability | Shared | correlation IDs, audit, retry/lag counts, error logs | API assertions/manual | Data 5 |

The API usage examples that omit deviceId/correlationId/schemaVersion are abbreviated illustrations, not sufficient ingestion bodies. The implementation uses the complete corrected envelope. The individual design's explicit state table takes precedence over its shortened storyboard. See DECISIONS.md for these and the durable staging change.
