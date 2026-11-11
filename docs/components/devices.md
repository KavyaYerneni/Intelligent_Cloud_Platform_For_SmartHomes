# Siddharth — Home and IoT device management

Inventory is authoritative in PostgreSQL. Composite foreign keys enforce tenant/house/room ownership. A tenant cannot register the same serial twice. Configuration history is immutable; desired version and reported version are separate so a successful API write is not confused with successful device application. Commands are queued records until a gateway/simulator acknowledges them.

Main files: `backend/inventory.js` (including `GET /catalog`), inventory tables in migrations 001/002, `frontend/views/inventory/` (`Inventory.jsx` tree + table, `forms.jsx` dialogs, `DeviceDrawer.jsx` tabs), `frontend/views/simulator/`. Tests: inventory unit validation, `tests/integration/ui-support.test.js` (duplicate serial with existing id, server-side filters and totals, room counts, mute capability), the integrated API scenario, and the e2e registration and duplicate-serial steps.

## Individual demonstration

1. Sign in as **IoT technician**. In **Houses & devices** choose **Add**, enter a uniquely named synthetic house and valid coordinates. It appears in the tree, the House menu and the overview.
2. **Add room**, then **Register device** (microphone, serial, capability chips). The device drawer opens showing **Waiting for first heartbeat**. Register the same serial again: the Serial number field says it is already registered and links to the existing device (409 `DUPLICATE_SERIAL`, never a second row).
3. In **Simulator**, pick the device and **Send one heartbeat**. The table and the room count (for example 1/1) show it online. Replay an identical timestamp through the API to show stale-heartbeat rejection.
4. In the device drawer, **Configuration** tab: **Publish version 1** with JSON settings. The device shows Provisioning with version 1 waiting. Send another simulator heartbeat; version 1 shows Applied and the device returns to Online.
5. **Commands** tab: send **Run self-test**, confirm, see Queued; in Simulator **Acknowledge queued commands**, then see Acknowledged. For a camera, **Mute audio** is not offered, and the API refuses it with `CAPABILITY`.
6. **Send heartbeats every 10 s**, then stop them; after 45 seconds the device turns Offline (ring) in the table, tree and overview. Start them again to recover. The simulator is not physical hardware.
7. **Access** tab: issue a credential (shown once, copy it privately) and revoke it. **Archive device** with a reason: it leaves active inventory, history stays, and heartbeats/commands are refused. Archive a room only after its devices; a house only after its rooms.

## Recording checklist

- Show the search, status and type filters: they run on the server and the total is exact.
- Include registration, duplicate rejection, online/offline recovery and command/configuration acknowledgment.
- Show one database constraint or meaningful unit test and explain it.
- Demonstrate owner role cannot register devices.
- Avoid exposing issued device credentials; copy them privately if testing device-auth requests.
- Explain credential hash/revocation and why archive preserves alert evidence.
