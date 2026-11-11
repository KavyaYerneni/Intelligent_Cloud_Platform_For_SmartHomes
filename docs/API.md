# Version 1 API contracts

Base `/api/v1`. User routes require `Authorization: Bearer <token>`. Provisioned devices use `Authorization: Device <credential>` for heartbeat, ingestion, command reads and acknowledgments only. No client tenant ID is accepted; tenant and house scope come from verified identity. Device credentials are random, hashed in PostgreSQL, shown once and revocable. Local simulator actions require technician/operator and `SIMULATOR_ENABLED=true`.

JSON errors: `{code,message,fieldErrors:[{field,message}],correlationId,timestamp}` with 400 validation, 401 unauthenticated, 403 role/scope, 404 missing accessible resource, 409 identity/version/state conflict, 413 body too large, and 500/503 dependency failure. Cross-scope failures do not disclose resource existence. `X-Correlation-Id` is returned; event requests additionally require `correlationId` in their body. Requests are limited to 64 KiB and rate limited.

## Authentication

`POST /auth/login {email,password}` returns `{token,user}`; signed JWT expires in one hour. `GET /auth/me` returns current active profile. `GET /users` lists tenant users for operator/responder assignment. Browser token lives only in memory; page reload requires sign-in. Local auth substitutes for Cognito; MFA, invite/reset and federation are deferred.

## Dashboard and inventory

| Method | Route | Input / result |
|---|---|---|
| GET | /dashboard/summary | Optional houseIds comma list; optional from/to together. Totals, nested house/device/alert DTOs, recentEvents, summaryVersion, generatedAt |
| GET | /houses/status | houseId, health status, page/pageSize; map-ready items |
| GET | /houses/:houseId/timeline | Required from/to; optional type/page; event history |
| GET/PUT | /dashboard/preferences | `{center:[lat,lng],zoom,filters}` saved per user |
| GET | /dashboard/health | Dependency and live transport status |
| GET/POST | /houses | Create `{name,address,lat,lng,timezone?}` -> 201 |
| PATCH | /houses/:id | Editable metadata/status plus expectedVersion |
| GET/POST | /houses/:id/rooms | Create `{name,roomType}` -> 201 |
| PATCH | /rooms/:id | `{name?,status?,expectedVersion}`; archive guard |
| POST | /rooms/:roomId/devices | `{type,serialNo,name,capabilities,firmwareVersion?}` -> 201 |
| GET | /devices | Optional houseId, page/pageSize; items |
| GET/PATCH | /devices/:id | Detail with commands/configurations; patch `{name?,roomId?,config?,status?,reason?,expectedVersion}` |
| POST | /devices/:id/credentials | `{}` rotates; `{revoke:true}` revokes |
| POST | /devices/:id/heartbeat | `{deviceId?,timestamp,firmware,metrics?,reportedVersion?}`; desiredConfig and desiredVersion returned |
| POST | /devices/:id/commands | `{command,parameters}` with Idempotency-Key; 202 command record |
| GET | /devices/:id/commands | Device-scoped command records |
| POST | /devices/:id/commands/:commandId/ack | `{state:"ACKED"|"FAILED"}` |

Allowed device types: camera, microphone, sensor, appliance, gateway. Serial uniqueness is within tenant. Configuration increments immutable version; ONLINE follows a heartbeat acknowledging the desired version. Heartbeats must advance lastSeen and fall within accepted time bounds. Supported commands: test, restart, mute (microphone/appliance only), refresh_config. Parameters may include durationSeconds 1–300. Commands expire after 60 seconds. Archive requires a reason, retains records and revokes credentials. House/room archive requires archived children. Device moves are limited to active rooms of the same house.

## Event ingestion and alerts

`POST /events` returns 202 `{eventId,processingState,correlationId}`. `POST /data/telemetry` uses the same complete envelope with `type:"telemetry"`.

```json
{
  "schemaVersion": "1.0",
  "eventId": "evt-demo-001",
  "correlationId": "corr-demo-001",
  "houseId": "H001",
  "deviceId": "D001",
  "type": "smoke_alarm",
  "occurredAt": "REPLACE_WITH_CURRENT_UTC_ISO_TIMESTAMP",
  "source": "simulator",
  "confidence": 0.94,
  "modelVersion": "v1",
  "payload": {"synthetic": true, "durationMs": 1860}
}
```

Use `Idempotency-Key: evt-demo-001`. Identical content replay returns the existing state; changed content under the same ID/key is 409. IDs and keys are tenant-scoped. Timestamp age <=24 hours; future skew <=60 seconds. Supported types: smoke_alarm, human_help_sound, unusual_sound, normal_appliance_sound, telemetry. Confidence 0..1 is mandatory for classified sounds and may be null for deterministic/telemetry events. Model source is reserved for an authenticated future adapter; ordinary local users cannot claim it.

| Method | Route | Input / result |
|---|---|---|
| GET | /events/:eventId | Reference, Mongo detail, simulated/rule provenance |
| GET | /alerts | houseId, severity, state, page/pageSize; priority-sorted items with allowedActions |
| GET | /alerts/:id | Evidence, audit history, delivery attempts, allowedActions |
| PATCH | /alerts/:id/state | `{targetState,note,expectedVersion}` |
| POST | /alerts/:id/assign | `{assigneeId,note,expectedVersion}`; active scoped responder/operator |
| POST | /alerts/:id/escalate | `{reason,target,expectedVersion}`; persists delivery request |

ACTIVE → ACKNOWLEDGED → INVESTIGATING → RESOLVED. ACTIVE, ACKNOWLEDGED and INVESTIGATING may escalate; ESCALATED may resolve. Investigation needs assignment or note. HIGH/CRITICAL resolution needs a nonblank note. Every state update is version checked and audited. Owners may acknowledge only; technicians cannot transition alerts. New events after resolution create a new alert, preserving the old response history.

## Data operations

`GET /data/events?houseId=H001&from=<ISO>&to=<ISO>&deviceId=&type=&page=1&pageSize=25` requires from < to, maximum 31 days, pageSize <=100. Empty optional filters should be omitted. SQL references are queryable while pending; detail becomes available after the worker completes Mongo persistence.

- `GET /data/devices/:deviceId/history`: from/to, page/pageSize; event references plus Mongo heartbeat history.
- `GET /data/houses/:houseId/summary`: from/to; grouped event counts and alert totals.
- `POST /data/ai-results`: operator-only immutable simulated result `{eventId,label,confidence,modelVersion}`; existing result returns 409.
- `GET /data/health`: operator-only store connectivity, index presence, lag, backlog, quarantine count.
- `GET /data/reconciliation`: operator-only pending/quarantined records.
- `POST /data/reconcile`: `{correlationId,limit:25,retryQuarantined:false}`; tenant-scoped bounded retry, 409 concurrent reconcile.
- `GET /audit`: operator-only paginated tenant audit.

## WebSocket

Connect `/ws/monitoring`, `/ws/alerts`, or `/ws/device-status`, then send `{token:"<JWT>",houseIds:["H001"]}` within five seconds. These aliases currently share the scoped event stream. Authentication is in the first frame to avoid logging query-string tokens. Requested houses are individually authorized. Session/role changes are checked during streaming. Invalid subscription closes 1008.

CONNECTED includes durable log version; refresh REST snapshot immediately afterward. Notifications contain `{type,eventId,version,houseId,occurredAt,correlationId,payload}`. HEARTBEAT frames prove transport liveness. Discard older versions, reconnect with capped exponential backoff and reload snapshot. The server polls committed PostgreSQL live_events; state and notification rows commit together, so a push never announces rolled-back state. Reconnect uses snapshot recovery rather than indefinite per-client queues. Clients with excessive send backlog are disconnected for refresh.

## Additions and changes for the redesigned UI

All require a signed-in user and are tenant/house scoped like the endpoints above.

| Method and path | Change | Notes |
|---|---|---|
| GET /api/v1/catalog | New | `{deviceTypes, commands, alertRules, heartbeatSeconds}` from `backend/domain.js`. The UI and simulator preview use it instead of keeping copies. |
| GET /api/v1/devices | Extended | Query `houseId`, `roomId`, `q` (name or serial), `status`, `type`, `includeArchived=true`, `page`, `pageSize`. Archived devices are hidden unless requested. Response adds `total`, `pageSize`, and `roomName`/`houseName` per item. Invalid `status`/`type` returns 400. |
| GET /api/v1/houses/{houseId}/rooms | Extended | Each room adds `deviceCount` (not archived) and `onlineCount`. |
| GET /api/v1/devices/{deviceId} | Extended | Adds `roomName`, `houseName`, `timezone`. |
| POST /api/v1/rooms/{roomId}/devices | Changed error | A serial already used in the tenant returns **409 `DUPLICATE_SERIAL`** with `existingDeviceId` and `fieldErrors:[{field:"serialNo"}]` (previously a generic 409 `DUPLICATE`). |
| POST /api/v1/devices/{deviceId}/commands | Changed error | Capability check reads the command table: a command not supported by the device type returns 400 `CAPABILITY`. |
| GET /api/v1/alerts | Extended | Adds `total`, `pageSize`; each item adds `houseName`, `deviceName`, `roomName`, `timezone`, `assigneeEmail`. Resolved alerts sort after open ones. |
| GET /api/v1/alerts/{alertId} | Extended | Same names; history entries add `actorEmail`. |
| GET /api/v1/events/{eventId} | Extended | Adds `deviceName`, `houseName`, `timezone`, `alertId` (the alert this event is evidence for, if any). |
| GET /api/v1/data/events | Extended | Items add `deviceName`. |
| GET /api/v1/audit | Extended | Items add `actorEmail`, `houseName`; response adds `pageSize`, `hasMore`. |
| GET /api/v1/auth/me, POST /auth/login | Extended | User adds `tenantName`. |
| GET /api/v1/dashboard/preferences | Extended | Adds `saved` (false when returning defaults). |
