/**
 * Icon set — vektor SVG murni (react-native-svg), gaya line/SF-Symbols iOS:
 * grid 24x24, stroke 1.8, sudut membulat. Tidak memakai emoji, tidak memakai
 * font ikon, jadi tampilannya identik di Android & iOS dan tetap tajam di
 * semua densitas layar.
 */
import React, { memo } from 'react';
import Svg, { Circle, Ellipse, Path, Rect, Line } from 'react-native-svg';
import { colors } from '../theme/tokens';

const glyphs = {
  /* ---------- Navigasi ---------- */
  home: (
    <>
      <Path d="M4 10.6 12 4l8 6.6V19.4a1.6 1.6 0 0 1-1.6 1.6h-3.6v-6.1H9.2V21H5.6A1.6 1.6 0 0 1 4 19.4z" />
    </>
  ),
  receipt: (
    <>
      <Path d="M6.2 3.6h11.6a1.2 1.2 0 0 1 1.2 1.2v15.6l-2.6-1.4-2.6 1.4-2.2-1.4-2.2 1.4-2.6-1.4L6.2 20.6" />
      <Path d="M9.4 8.4h5.2M9.4 12.2h5.2M9.4 16h3" />
    </>
  ),
  book: (
    <>
      <Path d="M6.4 3.6h11.2a1 1 0 0 1 1 1v15.8H7.4a1 1 0 0 1-1-1z" />
      <Path d="M6.4 3.6v15.8" />
      <Path d="M10 8.2h5.4M10 11.6h5.4" />
      <Path d="M18.6 16.6v3.8H8.2" />
    </>
  ),
  chart: (
    <>
      <Path d="M4 20.2h16" />
      <Path d="M7.6 20.2v-5.4M12 20.2V7.9m4.4 12.3v-8.6" />
    </>
  ),
  plus: <Path d="M12 5.2v13.6M5.2 12h13.6" />,
  minus: <Path d="M5.2 12h13.6" />,
  plusCircle: (
    <>
      <Circle cx="12" cy="12" r="8.3" />
      <Path d="M12 8.4v7.2M8.4 12h7.2" />
    </>
  ),

  /* ---------- Umum ---------- */
  bell: (
    <>
      <Path d="M18.1 9.4a6.1 6.1 0 1 0-12.2 0c0 4.9-2 6.3-2 6.3h16.2s-2-1.4-2-6.3" />
      <Path d="M10.2 19.1a2.1 2.1 0 0 0 3.6 0" />
    </>
  ),
  user: (
    <>
      <Circle cx="12" cy="8.4" r="3.6" />
      <Path d="M4.9 20.4c1.2-3.6 3.8-5.4 7.1-5.4s5.9 1.8 7.1 5.4" />
    </>
  ),
  users: (
    <>
      <Circle cx="9.4" cy="8.8" r="3.2" />
      <Path d="M3.8 19.6c.8-3.1 2.9-4.8 5.6-4.8s4.8 1.7 5.6 4.8" />
      <Path d="M15.8 5.9a3.2 3.2 0 0 1 0 5.9M17.4 14.9c2 .6 3.3 2.3 3.6 4.7" />
    </>
  ),
  userPlus: (
    <>
      <Circle cx="10.4" cy="8.4" r="3.5" />
      <Path d="M3.8 20c1-3.3 3.5-5 6.6-5 1.2 0 2.3.2 3.2.7" />
      <Path d="M17.6 13.6v5.2M15 16.2h5.2" />
    </>
  ),
  eye: (
    <>
      <Path d="M2.8 12S6.2 5.9 12 5.9 21.2 12 21.2 12 17.8 18.1 12 18.1 2.8 12 2.8 12z" />
      <Circle cx="12" cy="12" r="2.9" />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M4.2 8.3C3.2 9.5 2.8 12 2.8 12s3.4 6.1 9.2 6.1c1.4 0 2.6-.3 3.7-.8" />
      <Path d="M18.4 15.4c1.8-1.7 2.8-3.4 2.8-3.4S17.8 5.9 12 5.9c-.9 0-1.8.2-2.6.4" />
      <Path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <Path d="M3.6 3.6l16.8 16.8" />
    </>
  ),
  chevronRight: <Path d="M9.6 5.6 16 12l-6.4 6.4" />,
  chevronLeft: <Path d="M14.4 5.6 8 12l6.4 6.4" />,
  chevronDown: <Path d="M5.6 9.6 12 16l6.4-6.4" />,
  chevronUp: <Path d="M5.6 14.4 12 8l6.4 6.4" />,
  arrowRight: (
    <>
      <Path d="M4.6 12h14" />
      <Path d="M13 6.4 18.6 12 13 17.6" />
    </>
  ),
  arrowLeft: (
    <>
      <Path d="M19.4 12h-14" />
      <Path d="M11 6.4 5.4 12 11 17.6" />
    </>
  ),
  arrowDownLeft: (
    <>
      <Path d="M18.4 5.6 5.6 18.4" />
      <Path d="M5.6 10.6v7.8h7.8" />
    </>
  ),
  arrowUpRight: (
    <>
      <Path d="M5.6 18.4 18.4 5.6" />
      <Path d="M18.4 13.4V5.6h-7.8" />
    </>
  ),
  close: <Path d="M6.2 6.2l11.6 11.6M17.8 6.2 6.2 17.8" />,
  check: <Path d="M4.8 12.6 9.6 17.4 19.2 6.9" />,
  checkCircle: (
    <>
      <Circle cx="12" cy="12" r="8.3" />
      <Path d="M8.2 12.3 11 15.1l4.9-5.4" />
    </>
  ),
  search: (
    <>
      <Circle cx="10.9" cy="10.9" r="6.4" />
      <Path d="M15.7 15.7 20.4 20.4" />
    </>
  ),
  message: (
    <>
      <Path d="M20.4 11.5c0 4.2-3.8 7.6-8.4 7.6-1 0-2-.15-2.9-.43L4.2 20.4l1.5-3.5a7.1 7.1 0 0 1-2.1-5.4C3.6 7.3 7.4 3.9 12 3.9s8.4 3.4 8.4 7.6z" />
    </>
  ),
  send: (
    <>
      <Path d="M20.6 3.4 10.8 13.2" />
      <Path d="M20.6 3.4 14.6 20.6l-3.8-7.4-7.4-3.8z" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="8.3" />
      <Path d="M12 11v5.2M12 7.9v.02" />
    </>
  ),
  more: (
    <>
      <Circle cx="5.6" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <Circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <Circle cx="18.4" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),

  /* ---------- Keuangan ---------- */
  wallet: (
    <>
      <Rect x="3.2" y="6.4" width="17.6" height="12.4" rx="2.6" />
      <Path d="M3.4 9.8h17.2" />
      <Circle cx="16.6" cy="14.4" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  banknote: (
    <>
      <Rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2.8" />
      <Circle cx="12" cy="12" r="3" />
      <Path d="M6.1 9.6v4.8M17.9 9.6v4.8" />
    </>
  ),
  creditCard: (
    <>
      <Rect x="2.9" y="5.6" width="18.2" height="12.8" rx="2.6" />
      <Path d="M3 10.2h18" />
      <Path d="M6.4 14.6h3.2" />
    </>
  ),
  trendUp: (
    <>
      <Path d="M3.6 16.6 9 11.2l3.6 3.6 7.8-7.8" />
      <Path d="M15.6 7h5v5" />
    </>
  ),
  trendDown: (
    <>
      <Path d="M3.6 7.4 9 12.8l3.6-3.6 7.8 7.8" />
      <Path d="M15.6 17h5v-5" />
    </>
  ),
  cart: (
    <>
      <Path d="M2.8 4.2h2.3l2.5 10.4h10.6l2-7.4H5.6" />
      <Circle cx="9.6" cy="19.4" r="1.3" />
      <Circle cx="17.4" cy="19.4" r="1.3" />
    </>
  ),
  cartPlus: (
    <>
      <Path d="M2.6 4.2h2.2l2.4 9.8h8.6" />
      < Path d="M7.2 16.8h9.6l1.6-5.6H5.4" />
      <Path d="M18.4 15.6v5M15.9 18.1h5" />
      <Circle cx="9.4" cy="20.2" r="1.2" />
    </>
  ),
  store: (
    <>
      <Path d="M4.4 10.2v8.6a1.2 1.2 0 0 0 1.2 1.2h12.8a1.2 1.2 0 0 0 1.2-1.2v-8.6" />
      <Path d="M3.4 7.6 5 3.8h14l1.6 3.8a2.7 2.7 0 0 1-4.6 1.6 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4.6-1.6z" />
      <Path d="M9.6 20v-5.2h4.8V20" />
    </>
  ),
  truck: (
    <>
      <Path d="M2.8 6.4h9.4v9.4H2.8z" />
      <Path d="M12.2 9.8h4l3.1 3.2v2.8h-7.1z" />
      <Circle cx="6.4" cy="18.4" r="1.5" />
      <Circle cx="17" cy="18.4" r="1.5" />
    </>
  ),
  package: (
    <>
      <Path d="M4.2 8.4 12 4l7.8 4.4v7.2L12 20l-7.8-4.4z" />
      <Path d="M4.2 8.4 12 12.8l7.8-4.4M12 12.8V20" />
    </>
  ),
  tag: (
    <>
      <Path d="M11.2 3.6H5.8a2.2 2.2 0 0 0-2.2 2.2v5.4a2.2 2.2 0 0 0 .6 1.6l7.6 7.6a2.2 2.2 0 0 0 3.1 0l5.4-5.4a2.2 2.2 0 0 0 0-3.1l-7.6-7.6a2.2 2.2 0 0 0-1.5-.7z" />
      <Circle cx="8.2" cy="8.2" r="1.2" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="8.3" />
      <Path d="M12 7.4V12l3.2 1.9" />
    </>
  ),
  calendar: (
    <>
      <Rect x="3.7" y="5.3" width="16.6" height="15.1" rx="2.6" />
      <Path d="M8.2 3.3v4M15.8 3.3v4M3.7 9.7h16.6" />
    </>
  ),
  qr: (
    <>
      <Path d="M3.6 8V5.8a2.2 2.2 0 0 1 2.2-2.2H8" />
      <Path d="M16 3.6h2.2a2.2 2.2 0 0 1 2.2 2.2V8" />
      <Path d="M20.4 16v2.2a2.2 2.2 0 0 1-2.2 2.2H16" />
      <Path d="M8 20.4H5.8a2.2 2.2 0 0 1-2.2-2.2V16" />
      <Path d="M3.6 12h16.8" />
    </>
  ),
  scan: (
    <>
      <Path d="M3.6 8V5.8a2.2 2.2 0 0 1 2.2-2.2H8" />
      <Path d="M16 3.6h2.2a2.2 2.2 0 0 1 2.2 2.2V8" />
      <Path d="M20.4 16v2.2a2.2 2.2 0 0 1-2.2 2.2H16" />
      <Path d="M8 20.4H5.8a2.2 2.2 0 0 1-2.2-2.2V16" />
      <Path d="M7.6 12h8.8" />
    </>
  ),
  printer: (
    <>
      <Path d="M7.4 8.4V3.8h9.2v4.6" />
      <Rect x="3.9" y="8.4" width="16.2" height="7.8" rx="2.2" />
      <Path d="M7.4 14.6h9.2v5.6H7.4z" />
    </>
  ),
  bluetooth: (
    <>
      <Path d="M8 7.4 16.4 16.6 12.2 20.4V3.6l4.2 3.8L8 16.6" />
    </>
  ),
  mic: (
    <>
      <Rect x="9.2" y="3.2" width="5.6" height="10.4" rx="2.8" />
      <Path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0" />
      <Path d="M12 17.6V20.6M9.2 20.6h5.6" />
    </>
  ),
  cup: (
    <>
      <Path d="M5.4 8.6h10.8v5.6a4.4 4.4 0 0 1-4.4 4.4h-2a4.4 4.4 0 0 1-4.4-4.4z" />
      <Path d="M16.2 9.9h1.4a2.3 2.3 0 0 1 0 4.6h-1.4" />
      <Path d="M8.6 3.4c-.7.8-.7 1.6 0 2.4M12.2 3.4c-.7.8-.7 1.6 0 2.4" />
    </>
  ),
  phone: (
    <>
      <Rect x="7.2" y="2.8" width="9.6" height="18.4" rx="2.2" />
      <Path d="M10.8 18.4h2.4" />
    </>
  ),
  bolt: (
    <>
      <Path d="M13.4 3.2 6.6 13.6h4.6l-1 7.2 6.8-10.4h-4.6z" />
    </>
  ),
  flame: (
    <>
      <Path d="M12 3.4s5.6 4 5.6 9a5.6 5.6 0 0 1-11.2 0c0-1.8.8-3.4 1.7-4.6.3 1.6 1.1 2.5 2.1 2.7 0-2.7 1-5.2 1.8-7.1z" />
    </>
  ),
  pie: (
    <>
      <Circle cx="12" cy="12" r="8.3" />
      <Path d="M12 3.7V12h8.3" />
    </>
  ),
  pieFilled: (
    <>
      <Path d="M12 3.7A8.3 8.3 0 1 1 3.7 12H12z" />
    </>
  ),
  bulb: (
    <>
      <Path d="M9.2 17.8h5.6M10.4 20.8h3.2" />
      <Path d="M12 3.4a6.1 6.1 0 0 0-3.4 11.2c.5.3.9 1 .9 1.6h5c0-.6.4-1.3.9-1.6A6.1 6.1 0 0 0 12 3.4z" />
    </>
  ),
  alert: (
    <>
      <Path d="M12 4.2 21 19.6H3z" />
      <Path d="M12 9.8v4.2M12 17.4v.02" />
    </>
  ),
  shield: (
    <>
      <Path d="M12 3.4 19.4 6v5.4c0 4.4-3.1 7.6-7.4 9-4.3-1.4-7.4-4.6-7.4-9V6z" />
      <Path d="M9 11.8l2.2 2.2 4-4.2" />
    </>
  ),
  fileText: (
    <>
      <Path d="M6.2 3.6h7.2l5 5v11.8H6.2z" />
      <Path d="M13.4 3.6v5h5" />
      <Path d="M9.4 13h6M9.4 16.4h6" />
    </>
  ),
  download: (
    <>
      <Path d="M12 4v10.6" />
      <Path d="M7.6 10.4 12 14.8l4.4-4.4" />
      <Path d="M5 19.6h14" />
    </>
  ),
  upload: (
    <>
      <Path d="M12 15V4.4" />
      <Path d="M7.6 8.8 12 4.4l4.4 4.4" />
      <Path d="M5 19.6h14" />
    </>
  ),
  share: (
    <>
      <Path d="M12 3.6v10.8" />
      <Path d="M8.2 7.4 12 3.6l3.8 3.8" />
      <Path d="M6.2 10.8H5a1.4 1.4 0 0 0-1.4 1.4v7.4A1.4 1.4 0 0 0 5 21h14a1.4 1.4 0 0 0 1.4-1.4v-7.4A1.4 1.4 0 0 0 19 10.8h-1.2" />
    </>
  ),
  camera: (
    <>
      <Path d="M3.6 9.2A2.4 2.4 0 0 1 6 6.8h1.2L8.5 4.6h7l1.3 2.2H18a2.4 2.4 0 0 1 2.4 2.4v8.1A2.4 2.4 0 0 1 18 19.7H6a2.4 2.4 0 0 1-2.4-2.4z" />
      <Circle cx="12" cy="13" r="3.3" />
    </>
  ),
  image: (
    <>
      <Rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4" />
      <Circle cx="8.6" cy="9.4" r="1.5" />
      <Path d="M3.8 16.6 9 11.8l3.4 3.2 2.6-2.2 5 4.2" />
    </>
  ),
  trash: (
    <>
      <Path d="M4.6 7.2h14.8" />
      <Path d="M9.2 7.2V4.9h5.6v2.3" />
      <Path d="M6.6 7.2l.9 12.1a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.9-12.1" />
      <Path d="M10.6 11v6M13.4 11v6" />
    </>
  ),
  edit: (
    <>
      <Path d="M4.2 19.8l.9-4.2L16.2 4.5a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.4 18.9z" />
      <Path d="M14.9 5.8l3.3 3.3" />
    </>
  ),
  settings: (
    <>
      <Path d="M4 7.6h8.4M17.6 7.6h2.4M4 16.4h2.4M11.6 16.4H20" />
      <Circle cx="15" cy="7.6" r="2.1" />
      <Circle cx="9" cy="16.4" r="2.1" />
    </>
  ),
  filter: <Path d="M4.2 6.2h15.6M7.4 12h9.2M10.2 17.8h3.6" />,
  backspace: (
    <>
      <Path d="M9.2 4.8h10.2a1.6 1.6 0 0 1 1.6 1.6v11.2a1.6 1.6 0 0 1-1.6 1.6H9.2L3 12z" />
      <Path d="M11.6 9.6l4.8 4.8M16.4 9.6l-4.8 4.8" />
    </>
  ),
  lock: (
    <>
      <Rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2.4" />
      <Path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" />
    </>
  ),
  logout: (
    <>
      <Path d="M14.8 4.6h3.6a1.6 1.6 0 0 1 1.6 1.6v11.6a1.6 1.6 0 0 1-1.6 1.6h-3.6" />
      <Path d="M10 8.2 6.2 12 10 15.8M6.2 12h8.4" />
    </>
  ),
  sparkle: (
    <>
      <Path d="M12 3.6l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.6l5.1-1.9z" />
    </>
  ),
  refresh: (
    <>
      <Path d="M19.6 12a7.6 7.6 0 1 1-2.4-5.5" />
      <Path d="M19.8 4.6v4.6h-4.6" />
    </>
  ),
  dot: <Circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />,
  table: (
    <>
      <Rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2.2" />
      <Path d="M3.6 9.6h16.8M9.6 9.6v9.8M15 9.6v9.8" />
    </>
  ),
  walletCoins: (
    <>
      <Path d="M3.4 9.2h13.2a2 2 0 0 1 2 2v6.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z" />
      <Path d="M3.4 9.2V7.4a2 2 0 0 1 2-2h8.2" />
      <Circle cx="17.4" cy="6.2" r="2.8" />
      <Path d="M16.4,6.2h.02M18.4,6.2h.02" />
    </>
  ),
  coins: (
    <>
      <Ellipse cx="12" cy="6.6" rx="7.4" ry="2.8" />
      <Path d="M4.6 6.6v4c0 1.6 3.3 2.8 7.4 2.8s7.4-1.2 7.4-2.8v-4" />
      <Path d="M4.6 10.6v4c0 1.6 3.3 2.8 7.4 2.8s7.4-1.2 7.4-2.8v-4" />
    </>
  ),
  history: (
    <>
      <Path d="M3.9 12a8.1 8.1 0 1 0 2.6-5.9" />
      <Path d="M3.6 4.8v4.4h4.4" />
      <Path d="M12 8v4.3l2.9 1.7" />
    </>
  ),
  whatsapp: (
    <>
      <Path d="M20.4 11.6c0 4.3-3.8 7.7-8.4 7.7-1 0-2-.15-2.9-.44L4.2 20.4l1.5-3.5A7.2 7.2 0 0 1 3.6 11.6C3.6 7.4 7.4 4 12 4s8.4 3.4 8.4 7.6z" />
      <Path d="M9.2 9.3c.4-.9 1.3-.8 1.6-.2.2.4.5 1.2.2 1.6-.3.4-.9.5-.7 1.1.3.9 1.5 2 2.4 2.2.6.2.7-.5 1.1-.8.4-.3 1.1 0 1.6.2.6.3.7 1.1-.1 1.6-1.3.8-3 .3-4.6-1.2-1.6-1.5-2.2-3.4-1.5-4.5z" />
    </>
  ),
  database: (
    <>
      <Ellipse cx="12" cy="6.2" rx="7.2" ry="2.7" />
      <Path d="M4.8 6.2v5.2c0 1.5 3.2 2.7 7.2 2.7s7.2-1.2 7.2-2.7V6.2" />
      <Path d="M4.8 11.4v5.2c0 1.5 3.2 2.7 7.2 2.7s7.2-1.2 7.2-2.7v-5.2" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof glyphs;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Isi glyph dengan warna (untuk ikon solid seperti dot indikator). */
  opacity?: number;
}

export const Icon = memo(function Icon({
  name,
  size = 22,
  color = colors.text,
  strokeWidth = 1.8,
  opacity = 1,
}: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      // react-native-svg mewarisi stroke ke children; `currentColor` dipakai
      // untuk titik solid agar ikut warna induk.
      color={color}
    >
      {glyphs[name]}
    </Svg>
  );
});

export const iconNames = Object.keys(glyphs) as IconName[];
