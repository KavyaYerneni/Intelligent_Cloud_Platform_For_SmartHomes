# Map and initial device status verification — November 10, 2026

The running Compose app used Helmet's default no-referrer policy. OpenStreetMap returned blocked tile images. The app now sends strict-origin referrers, requests https://tile.openstreetmap.org tiles, and permits that exact host in CSP. Tile failures remove the tile layer rather than leaving provider error images across the map. Tooltips use text nodes for house names.

All three seeded devices were REGISTERED with null last_seen. Degraded was the correct domain result, not a database/container failure. The overview now explains the missing first heartbeat and links authorized operators/technicians directly to the selected house's simulator. Health rules were preserved.

Validation: 8 Node unit tests passed; 16 Vitest UI tests passed inside the app container with NODE_ENV=test; Vite build passed locally and in Docker. Only the app container was rebuilt/recreated; database volumes were preserved. Browser inspection confirmed the San Jose street map rendered with all three markers, replacing the blocked tile images.
