# Siddharth — Home and IoT device management

Inventory is authoritative in PostgreSQL. Composite foreign keys enforce tenant/house/room ownership. A tenant cannot register the same serial twice. Configuration history is immutable; desired version and reported version are separate so a successful API write is not confused with successful device application. Commands are queued records until a gateway/simulator acknowledges them.

Main files: `backend/inventory.js`, inventory tables in migration 001, `frontend/Inventory.jsx`, `frontend/Simulator.jsx`. Tests: inventory unit validation and the integrated API scenario.

## Individual demonstration

1. Sign in as technician. Add a uniquely named synthetic house with valid coordinates. Show its persisted record in the house directory and dashboard.
2. Add a room and microphone using the corrected `/rooms/{roomId}/devices` API. Repeat the serial to show 409 rather than a duplicate.
3. Open Simulator and send a heartbeat. Show ONLINE and lastSeen. Replay an identical timestamp via API to show stale heartbeat rejection.
4. Publish configuration JSON, observe desired version increment and PROVISIONING. Send simulator heartbeat/apply config; show reported version matching desired version and ONLINE.
5. Queue a supported test command, inspect QUEUED history, acknowledge it in Simulator and inspect ACKED. Attempt an unsupported command via API or mute on a camera; show rejection.
6. Stop periodic heartbeats, wait the configured 45 seconds and observe OFFLINE. Resume to recover. Explain that the simulator is not physical hardware.
7. Archive device with a reason; show retained history and blocked commands/heartbeats. Archive its room and house only after children are archived.

## Recording checklist

- Include registration, duplicate rejection, online/offline recovery and command/configuration acknowledgment.
- Show one database constraint or meaningful unit test and explain it.
- Demonstrate owner role cannot register devices.
- Avoid exposing issued device credentials; copy them privately if testing device-auth requests.
- Explain credential hash/revocation and why archive preserves alert evidence.
