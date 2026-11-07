import { useEffect, useRef, useState } from 'react';
import { getToken } from './api';

// WebSocket client for /ws/monitoring (Component 1 F-D-02, F-D-04).
// - Authenticates with the first message; server scopes to the user's houses.
// - Ignores duplicate or older versions; bumps `version` so views reload.
// - Marks the connection stale after 10 s without any message (the server sends
//   HEARTBEAT every second), reconnects with exponential backoff, and requests a
//   fresh snapshot after reconnecting.
export function useLive(enabled) {
  const [state, setState] = useState('connecting');
  const [version, setVersion] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);
  const [lastAt, setLastAt] = useState(null);
  const seen = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    let ws, timer, disposed = false, attempt = 0, lastSeen = Date.now();
    const connect = () => {
      if (disposed) return;
      setState(s => (s === 'live' ? 'reconnecting' : s));
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/monitoring`);
      ws.onopen = () => ws.send(JSON.stringify({ token: getToken() }));
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        lastSeen = Date.now();
        setLastAt(new Date());
        setState('live');
        if (m.type === 'CONNECTED') { seen.current = m.version; attempt = 0; setVersion(v => v + 1); return; }
        if (m.type === 'HEARTBEAT' || m.version <= seen.current) return;
        seen.current = m.version;
        setLastMessage(m);
        setVersion(v => v + 1);
      };
      ws.onerror = () => ws.close();
      ws.onclose = e => {
        if (disposed) return;
        if (e.code === 1008) { setState('unauthorized'); return; }
        setState('reconnecting');
        timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
      };
    };
    connect();
    const stale = setInterval(() => { if (Date.now() - lastSeen > 10000) setState(s => (s === 'live' ? 'stale' : s)); }, 2000);
    return () => { disposed = true; clearTimeout(timer); clearInterval(stale); ws?.close(); };
  }, [enabled]);
  return { state, version, lastMessage, lastAt };
}
