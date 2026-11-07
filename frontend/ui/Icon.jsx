import React from 'react';
// Small inline icon set (24px grid, 1.75 stroke). Decorative: aria-hidden.
const P = {
  overview: 'M4 13h6V4H4zm10 7h6v-9h-6zM4 20h6v-4H4zm10-11h6V4h-6z',
  house: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  alert: 'M12 4 21 20H3zM12 10v4m0 3v.01',
  data: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zm0 0v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  play: 'M7 5v14l11-7z',
  close: 'M6 6l12 12M18 6 6 18',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm9 2-4-4',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  room: 'M4 20V6l8-2 8 2v14M9 20v-6h6v6',
  device: 'M7 4h10v16H7zM11 17h2',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  check: 'M5 12l5 5 9-10',
};
export default function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name]} />
    </svg>
  );
}
