'use strict';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS  = { hearts: '#CC2200', diamonds: '#CC2200', clubs: '#1a1a2e', spades: '#1a1a2e' };

// Pip layouts for number cards [x%, y%] positions (relative to 80x120 inner area)
const PIP_LAYOUTS = {
  '2':  [[50,20],[50,80]],
  '3':  [[50,15],[50,50],[50,85]],
  '4':  [[25,20],[75,20],[25,80],[75,80]],
  '5':  [[25,20],[75,20],[50,50],[25,80],[75,80]],
  '6':  [[25,20],[75,20],[25,50],[75,50],[25,80],[75,80]],
  '7':  [[25,20],[75,20],[50,35],[25,50],[75,50],[25,80],[75,80]],
  '8':  [[25,20],[75,20],[25,40],[75,40],[25,60],[75,60],[25,80],[75,80]],
  '9':  [[25,18],[75,18],[25,38],[75,38],[50,50],[25,62],[75,62],[25,82],[75,82]],
  '10': [[25,15],[75,15],[25,32],[75,32],[25,50],[75,50],[25,68],[75,68],[25,85],[75,85]]
};

// ──────────────────────────────────────────────
// SVG helpers
// ──────────────────────────────────────────────
function suitSVG(suit, x, y, size, color) {
  const s = SUIT_SYMBOLS[suit];
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"
    font-size="${size}" fill="${color}" font-family="serif">${s}</text>`;
}

// ──────────────────────────────────────────────
// Face card illustrated designs
// ──────────────────────────────────────────────
function faceCardInner(rank, suit) {
  const color = SUIT_COLORS[suit];
  const sym   = SUIT_SYMBOLS[suit];
  const isRed = color === '#CC2200';
  const fgColor = isRed ? '#8B0000' : '#1a1a2e';
  const accentColor = isRed ? '#FF6B6B' : '#4a4a8a';

  if (rank === 'J') {
    return `
      <rect x="14" y="22" width="72" height="96" rx="4" fill="${isRed?'#fff5f5':'#f5f5ff'}" stroke="${fgColor}" stroke-width="1"/>
      <circle cx="50" cy="55" r="18" fill="${accentColor}" opacity="0.18"/>
      <text x="50" y="48" text-anchor="middle" font-size="26" fill="${fgColor}" font-family="serif" font-weight="bold">J</text>
      <text x="50" y="75" text-anchor="middle" font-size="18" fill="${color}" font-family="serif">${sym}</text>
      <rect x="22" y="28" width="56" height="84" rx="3" fill="none" stroke="${accentColor}" stroke-width="1.2" opacity="0.6"/>
      <line x1="50" y1="28" x2="50" y2="112" stroke="${accentColor}" stroke-width="0.8" opacity="0.4"/>
    `;
  }
  if (rank === 'Q') {
    return `
      <rect x="14" y="22" width="72" height="96" rx="4" fill="${isRed?'#fff5f5':'#f5f5ff'}" stroke="${fgColor}" stroke-width="1"/>
      <ellipse cx="50" cy="54" rx="16" ry="20" fill="${accentColor}" opacity="0.18"/>
      <path d="M34 38 Q50 30 66 38 Q62 50 50 52 Q38 50 34 38Z" fill="${accentColor}" opacity="0.4"/>
      <text x="50" y="62" text-anchor="middle" font-size="22" fill="${fgColor}" font-family="serif" font-weight="bold">Q</text>
      <text x="50" y="80" text-anchor="middle" font-size="15" fill="${color}" font-family="serif">${sym}${sym}</text>
      <rect x="22" y="28" width="56" height="84" rx="3" fill="none" stroke="${accentColor}" stroke-width="1.2" opacity="0.6"/>
    `;
  }
  if (rank === 'K') {
    return `
      <rect x="14" y="22" width="72" height="96" rx="4" fill="${isRed?'#fff5f5':'#f5f5ff'}" stroke="${fgColor}" stroke-width="1"/>
      <polygon points="50,30 54,42 68,42 57,50 61,63 50,55 39,63 43,50 32,42 46,42" fill="${accentColor}" opacity="0.5"/>
      <text x="50" y="75" text-anchor="middle" font-size="22" fill="${fgColor}" font-family="serif" font-weight="bold">K</text>
      <text x="50" y="94" text-anchor="middle" font-size="15" fill="${color}" font-family="serif">${sym}</text>
      <rect x="22" y="28" width="56" height="84" rx="3" fill="none" stroke="${accentColor}" stroke-width="1.2" opacity="0.6"/>
    `;
  }
  return '';
}

// ──────────────────────────────────────────────
// Main card SVG generator
// ──────────────────────────────────────────────
function createCardSVG(rank, suit, faceDown = false) {
  const W = 100, H = 140;
  const color = SUIT_COLORS[suit] || '#1a1a2e';
  const sym   = SUIT_SYMBOLS[suit] || '';

  if (faceDown) {
    return cardBackSVG();
  }

  let inner = '';

  if (rank === 'A') {
    // Big central suit
    inner = `
      <text x="50" y="84" text-anchor="middle" dominant-baseline="central"
        font-size="52" fill="${color}" font-family="serif">${sym}</text>
    `;
  } else if (['J','Q','K'].includes(rank)) {
    inner = faceCardInner(rank, suit);
  } else {
    // Number cards – pip layout
    const positions = PIP_LAYOUTS[rank] || [];
    const pipSize = parseInt(rank) <= 6 ? 16 : 13;
    inner = positions.map(([px, py]) => {
      const ax = 14 + px * 0.72;
      const ay = 22 + py * 0.96;
      return suitSVG(suit, ax, ay, pipSize, color);
    }).join('\n');
  }

  // Corner rank + suit labels
  const corners = `
    <text x="7" y="17" font-size="14" font-weight="bold" fill="${color}" font-family="Arial,sans-serif">${rank}</text>
    <text x="7" y="30" font-size="11" fill="${color}" font-family="serif">${sym}</text>
    <text x="93" y="123" font-size="14" font-weight="bold" fill="${color}" font-family="Arial,sans-serif"
      text-anchor="end" transform="rotate(180,93,123)">${rank}</text>
    <text x="93" y="110" font-size="11" fill="${color}" font-family="serif"
      text-anchor="end" transform="rotate(180,93,110)">${sym}</text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <filter id="cs" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#00000030"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" rx="8" ry="8" fill="white" stroke="#ddd" stroke-width="1" filter="url(#cs)"/>
    ${inner}
    ${corners}
  </svg>`;
}

// ──────────────────────────────────────────────
// Card back design – casino style
// ──────────────────────────────────────────────
function cardBackSVG() {
  const W = 100, H = 140;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <linearGradient id="backGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1a0533"/>
        <stop offset="50%" stop-color="#2d0a5e"/>
        <stop offset="100%" stop-color="#1a0533"/>
      </linearGradient>
      <pattern id="diamond" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
        <polygon points="5,0 10,5 5,10 0,5" fill="#3d1178" opacity="0.6"/>
        <polygon points="5,1 9,5 5,9 1,5" fill="none" stroke="#6a2db8" stroke-width="0.4" opacity="0.5"/>
      </pattern>
      <filter id="bs">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#00000050"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" rx="8" ry="8" fill="url(#backGrad)" filter="url(#bs)"/>
    <rect x="3" y="3" width="94" height="134" rx="6" fill="url(#diamond)"/>
    <rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="#c8a400" stroke-width="1.5"/>
    <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="#c8a400" stroke-width="0.6" opacity="0.5"/>
    <text x="50" y="78" text-anchor="middle" dominant-baseline="central"
      font-size="26" fill="#c8a400" font-family="serif" font-weight="bold" opacity="0.9">♦</text>
    <circle cx="50" cy="70" r="22" fill="none" stroke="#c8a400" stroke-width="1" opacity="0.4"/>
    <text x="50" y="20" text-anchor="middle" font-size="8" fill="#c8a400" font-family="serif" opacity="0.7">ROYAL</text>
    <text x="50" y="128" text-anchor="middle" font-size="8" fill="#c8a400" font-family="serif" opacity="0.7" transform="rotate(180,50,128)">ROYAL</text>
  </svg>`;
}

// ──────────────────────────────────────────────
// Build a card DOM element
// ──────────────────────────────────────────────
function createCardElement(card, options = {}) {
  const { faceDown = false, selectable = false, small = false } = options;
  const el = document.createElement('div');
  el.className = 'card' + (faceDown ? ' face-down' : '') + (small ? ' card-small' : '');
  el.dataset.cardId = card.id;
  el.dataset.suit   = card.suit;
  el.dataset.rank   = card.rank;

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  const front = document.createElement('div');
  front.className = 'card-face card-front';
  front.innerHTML = createCardSVG(card.rank, card.suit, false);

  const back = document.createElement('div');
  back.className = 'card-face card-back';
  back.innerHTML = cardBackSVG();

  inner.appendChild(front);
  inner.appendChild(back);
  el.appendChild(inner);

  if (selectable) {
    el.classList.add('selectable');
  }
  return el;
}

// Export for browser
window.CardUtils = {
  createCardSVG,
  cardBackSVG,
  createCardElement,
  SUIT_SYMBOLS,
  SUIT_COLORS
};
