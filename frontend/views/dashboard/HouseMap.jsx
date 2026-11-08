import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../lib/api';
import { look } from '../../ui/Status';
import { useToast } from '../../ui/Feedback';

// Leaflet + OpenStreetMap (no API key). Only coordinates and status text go to the
// map; no event payloads (Component 1 invariant). If tiles fail, the house table
// on the same page is the full alternative (C1 §3.7).
export default function HouseMap({ houses, selected, onSelect }) {
  const node = useRef(), map = useRef(), layer = useRef(), fitted = useRef(false);
  const pick = useRef(onSelect); pick.current = onSelect;
  const [tilesFailed, setTilesFailed] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const m = L.map(node.current, { zoomControl: true, attributionControl: true }).setView([37.3382, -121.8863], 12);
    map.current = m;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 })
      .on('tileerror', () => setTilesFailed(true)).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    api('/dashboard/preferences').then(p => { if (p.saved && p.center) { m.setView(p.center, p.zoom); fitted.current = true; } }).catch(() => {});
    return () => m.remove();
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    for (const h of houses) {
      const l = look(h.health);
      const marker = L.marker([h.lat, h.lng], {
        title: `${h.name}: ${l.label}`, alt: `${h.name}: ${l.label}`, keyboard: true,
        icon: L.divIcon({ className: 'pin-wrap', iconSize: [36, 44], iconAnchor: [18, 42],
          html: `<span class="pin tone-${l.tone} ${h.id === selected ? 'pin-on' : ''}"><span class="mark mark-${l.shape}"></span></span>` }),
      }).addTo(layer.current);
      marker.bindTooltip(`${h.name}: ${l.label}`, { direction: 'top', offset: [0, -40] });
      marker.on('click', () => pick.current(h.id));
    }
    if (!fitted.current && houses.length) {
      map.current.fitBounds(L.latLngBounds(houses.map(h => [h.lat, h.lng])).pad(0.35), { maxZoom: 14 });
      fitted.current = true;
    }
  }, [houses, selected]);

  const save = () => {
    const c = map.current.getCenter();
    api('/dashboard/preferences', { method: 'PUT', body: { center: [c.lat, c.lng], zoom: map.current.getZoom(), filters: {} } })
      .then(() => toast('Map view saved for your account.')).catch(e => toast(e.message, 'bad'));
  };

  return (
    <div className="map-frame">
      <div className="map" ref={node} role="region" aria-label="Map of houses. The house table below lists the same information." />
      {tilesFailed && <p className="map-note">Map tiles didn't load. Markers still work, and the house table below has everything on the map.</p>}
      <button className="btn btn-sm map-save" onClick={save}>Save map view</button>
    </div>
  );
}
