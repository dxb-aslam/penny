// Penny — hand-drawn line icon set (24px grid, 1.7 stroke)
import type { CSSProperties } from 'react';
import { CATS } from '../lib/data';
import type { CategoryId } from '../lib/types';

export interface IconProps {
  size?: number;
  color?: string;
  sw?: number;
  style?: CSSProperties;
}

function makeIcon(paths: string, vb = '0 0 24 24') {
  return function Icon({ size = 20, color = 'currentColor', sw = 1.7, style }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={vb}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
        dangerouslySetInnerHTML={{ __html: paths }}
      />
    );
  };
}

export const Icons = {
  home: makeIcon('<path d="M4 11l8-7 8 7v8a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19z"/><path d="M9.5 20.5v-6h5v6"/>'),
  wallet: makeIcon('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none"/>'),
  chart: makeIcon('<path d="M4 20V9"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3.5"/>'),
  leaf: makeIcon('<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z"/><path d="M5 19c2-5 5-8 9-10"/>'),
  cup: makeIcon('<path d="M5 8h11v6a5 5 0 01-5 5h-1a5 5 0 01-5-5z"/><path d="M16 9h2a2.5 2.5 0 010 5h-2"/><path d="M8 4.5c0 1-1 1-1 2M12 4.5c0 1-1 1-1 2"/>'),
  basket: makeIcon('<path d="M4 9h16l-1.5 9.5a2 2 0 01-2 1.5h-9a2 2 0 01-2-1.5z"/><path d="M8 9l3.5-5M16 9l-3.5-5"/><path d="M9.5 13v3.5M14.5 13v3.5"/>'),
  car: makeIcon('<path d="M5 16v2.5M19 16v2.5"/><path d="M4 11l1.5-4.5A2 2 0 017.4 5h9.2a2 2 0 011.9 1.5L20 11"/><rect x="3" y="11" width="18" height="5.5" rx="1.6"/><circle cx="7.5" cy="13.8" r="0.8" fill="currentColor" stroke="none"/><circle cx="16.5" cy="13.8" r="0.8" fill="currentColor" stroke="none"/>'),
  bag: makeIcon('<path d="M5.5 8h13l-1 11.5a1.8 1.8 0 01-1.8 1.5H8.3a1.8 1.8 0 01-1.8-1.5z"/><path d="M9 10V6.5a3 3 0 016 0V10"/>'),
  bolt: makeIcon('<path d="M13 3L5 13.5h6L11 21l8-10.5h-6z"/>'),
  loop: makeIcon('<path d="M17 4l3 3-3 3"/><path d="M20 7H8a4 4 0 00-4 4"/><path d="M7 20l-3-3 3-3"/><path d="M4 17h12a4 4 0 004-4"/>'),
  heart: makeIcon('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.4 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z"/>'),
  house: makeIcon('<path d="M4 11l8-7 8 7v8a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19z"/>'),
  spark: makeIcon('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>'),
  arrowdown: makeIcon('<path d="M12 4v13M6 12l6 6 6-6"/>'),
  dots: makeIcon('<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>'),
  send: makeIcon('<path d="M4.5 12L20 4l-4 16-4.5-6.5z"/><path d="M11.5 13.5L20 4"/>'),
  plus: makeIcon('<path d="M12 5v14M5 12h14"/>'),
  paperclip: makeIcon('<path d="M20 11.5l-7.6 7.6a5 5 0 01-7-7L13 4.5a3.4 3.4 0 014.8 4.8L10.6 16a1.8 1.8 0 01-2.5-2.5l6.6-6.5"/>'),
  camera: makeIcon('<path d="M4 8.5A2.5 2.5 0 016.5 6h1L9 4h6l1.5 2h1A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5z"/><circle cx="12" cy="12.5" r="3.4"/>'),
  filetext: makeIcon('<path d="M6 3h8l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v4h4"/><path d="M8.5 12h7M8.5 15.5h7"/>'),
  message: makeIcon('<path d="M21 12a8.5 8.5 0 01-8.5 8.5c-1.5 0-3-.4-4.2-1L3 21l1.6-4.6A8.5 8.5 0 1121 12z"/>'),
  check: makeIcon('<path d="M4.5 12.5l5 5L19.5 7"/>'),
  chevR: makeIcon('<path d="M9 5l7 7-7 7"/>'),
  chevD: makeIcon('<path d="M5 9l7 7 7-7"/>'),
  close: makeIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
  bell: makeIcon('<path d="M18 9a6 6 0 10-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9z"/><path d="M10 19.5a2.2 2.2 0 004 0"/>'),
  coins: makeIcon('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M3 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M21 10v7c0 1.2-1.3 2.2-3 2.7"/><path d="M18 5.5c1.8.4 3 1.4 3 2.5 0 .8-.7 1.6-1.8 2.1"/>'),
  trend: makeIcon('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  medal: makeIcon('<path d="M9 3l2.4 5.6M15 3l-2.4 5.6"/><circle cx="12" cy="14.5" r="5.5"/><path d="M12 11.9l.85 1.7 1.9.3-1.37 1.34.32 1.9L12 16.5l-1.7.94.32-1.9-1.37-1.34 1.9-.3z"/>'),
  receipt: makeIcon('<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h5"/>'),
  shield: makeIcon('<path d="M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>'),
  sms: makeIcon('<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M9 5.5h6"/><path d="M8.5 11h7M8.5 14h4.5"/>'),
  pencil: makeIcon('<path d="M14.5 5.5l4 4L8 20l-4.7.7L4 16z"/><path d="M12.5 7.5l4 4"/>'),
  trash: makeIcon('<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>'),
  mic: makeIcon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0"/><path d="M12 18v3"/>'),
  calendar: makeIcon('<rect x="4" y="5" width="16" height="16" rx="2.5"/><path d="M4 10h16M8 3v4M16 3v4"/>'),
  flag: makeIcon('<path d="M5 21V4"/><path d="M5 5c4-2.5 7 2 11 0v8c-4 2.5-7-2-11 0"/>'),
  menu: makeIcon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  grid: makeIcon('<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>'),
  user: makeIcon('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/>'),
};

export type IconName = keyof typeof Icons;

export function CatIcon({ cat, size = 19 }: { cat: CategoryId; size?: number }) {
  const c = CATS[cat] || CATS.other;
  const Ico = (Icons as Record<string, typeof Icons.dots>)[c.icon] || Icons.dots;
  return (
    <span className="icon-bub" style={{ background: c.tint, color: c.color }}>
      <Ico size={size} sw={1.8} />
    </span>
  );
}
