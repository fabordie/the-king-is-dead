/*
 * Faces des cartes action, dessinées en SVG dans le langage graphique du jeu :
 * cadre enluminé rouge et bleu, panneau parchemin portant le schéma de l'action
 * (cubes, flèches, régions), banderole de titre. Dessins originaux.
 */

import { CARDS, FACTION_INFO } from './game.js';

const INK = '#3a2b16';
const RUBRIC = '#a8231d';
const AZURE = '#2b4d8f';
const GOLD = '#c9a227';
const PARCH = '#f2e6c8';
const PANEL = '#ecdcb4';

/* --- éléments ------------------------------------------------------- */

function cube(x, y, s, color, light) {
  return `<g>
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="3" fill="${color}" stroke="#241a0c" stroke-width="2.2"/>
    <rect x="${x + s * 0.16}" y="${y + s * 0.16}" width="${s * 0.68}" height="${s * 0.68}" rx="2" fill="none" stroke="${light}" stroke-width="2" opacity="0.9"/>
  </g>`;
}

/** Petite région : un blob de parchemin coloré au contour encré. */
function blob(cx, cy, w, h, fill, extra = '') {
  const x = (f) => cx + w * f, y = (f) => cy + h * f;
  return `<path d="M ${x(-0.42)},${y(0.05)}
    Q ${x(-0.5)},${y(-0.32)} ${x(-0.18)},${y(-0.42)}
    Q ${x(0.12)},${y(-0.52)} ${x(0.38)},${y(-0.32)}
    Q ${x(0.55)},${y(-0.12)} ${x(0.44)},${y(0.18)}
    Q ${x(0.32)},${y(0.46)} ${x(-0.02)},${y(0.46)}
    Q ${x(-0.35)},${y(0.44)} ${x(-0.42)},${y(0.05)} Z"
    fill="${fill}" stroke="${INK}" stroke-width="2.4" ${extra}/>`;
}

/** Disque de contrôle miniature. */
function disc(cx, cy, r, fill) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#241a0c" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="#f6ecd0" stroke-width="1.6" opacity="0.8"/>`;
}

/** Flèche encrée, pointe comprise. */
function arrow(x1, y1, x2, y2, curve = 0, color = INK) {
  const mx = (x1 + x2) / 2 + curve * (y2 - y1) * 0.5;
  const my = (y1 + y2) / 2 - curve * (x2 - x1) * 0.5;
  const a = Math.atan2(y2 - my, x2 - mx);
  const h = 11;
  const p1 = `${x2 - h * Math.cos(a - 0.42)},${y2 - h * Math.sin(a - 0.42)}`;
  const p2 = `${x2 - h * Math.cos(a + 0.42)},${y2 - h * Math.sin(a + 0.42)}`;
  return `<path d="M ${x1},${y1} Q ${mx},${my} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M ${x2},${y2} L ${p1} L ${p2} Z" fill="${color}"/>`;
}

/** Double flèche d'échange. */
function swap(x1, y1, x2, y2, gap = 10) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * gap, oy = (dx / len) * gap;
  return arrow(x1 + ox, y1 + oy, x2 + ox, y2 + oy, 0.25)
       + arrow(x2 - ox, y2 - oy, x1 - ox, y1 - oy, 0.25);
}

/** Banderole de titre. */
function ribbon(cx, cy, w, text, size) {
  const h = 34;
  return `<g>
    <path d="M ${cx - w / 2 - 14},${cy} l 14,-${h / 2} h ${w} l 14,${h / 2} l -14,${h / 2} h -${w} Z"
      fill="#f7efd9" stroke="#8d7346" stroke-width="2"/>
    <path d="M ${cx - w / 2 - 14},${cy} l 14,-${h / 2} h ${w} l 14,${h / 2}"
      fill="none" stroke="#fffbe9" stroke-width="1.2" opacity="0.8"/>
    <text x="${cx}" y="${cy + size * 0.36}" text-anchor="middle" class="card-title" style="font-size:${size}px">${text}</text>
  </g>`;
}

/* --- schémas par carte ---------------------------------------------- */

function diagram(cardId) {
  const F = FACTION_INFO;
  switch (cardId) {
    case 'scottish_support':
    case 'welsh_support':
    case 'english_support': {
      const f = F[CARDS[cardId].faction];
      // Deux cubes descendent vers une région qui borde une région contrôlée.
      return blob(105, 128, 90, 70, PANEL)
        + blob(205, 118, 88, 66, f.color + '55')
        + disc(205, 116, 13, f.color)
        + cube(66, 40, 26, f.color, f.light)
        + cube(100, 40, 26, f.color, f.light)
        + arrow(96, 76, 100, 108, 0.1);
    }
    case 'assemble': {
      // Un cube de chaque faction rejoint le plateau.
      return blob(90, 130, 92, 66, PANEL)
        + blob(198, 122, 88, 62, PANEL)
        + cube(48, 38, 26, F.scottish.color, F.scottish.light)
        + cube(112, 32, 26, F.welsh.color, F.welsh.light)
        + cube(176, 38, 26, F.english.color, F.english.light)
        + arrow(60, 72, 76, 108, -0.15)
        + arrow(124, 66, 100, 106, 0.15)
        + arrow(190, 72, 196, 100, 0.1);
    }
    case 'negotiate': {
      // Deux cartes région échangées ; un disque blanc posé.
      const card = (x, y, n) => `
        <rect x="${x}" y="${y}" width="64" height="88" rx="6" fill="#f7efd9" stroke="${INK}" stroke-width="2.4"/>
        <rect x="${x + 7}" y="${y + 7}" width="50" height="52" rx="4" fill="${PANEL}" stroke="#8d7346" stroke-width="1.4"/>
        <circle cx="${x + 32}" cy="${y + 74}" r="10" fill="${INK}"/>
        <text x="${x + 32}" y="${y + 79}" text-anchor="middle" style="font-size:14px;fill:#f6ecd0;font-family:serif">${n}</text>`;
      return card(48, 36, '1') + card(188, 36, '2')
        + swap(126, 80, 174, 80, 9)
        + `<circle cx="150" cy="146" r="12" fill="#fbf7ea" stroke="#6b573a" stroke-width="3"/>`;
    }
    case 'manoeuvre': {
      // Un cube contre un cube, entre deux régions quelconques.
      return blob(80, 100, 92, 70, PANEL)
        + blob(220, 116, 92, 70, PANEL)
        + cube(64, 82, 26, F.welsh.color, F.welsh.light)
        + cube(206, 100, 26, F.english.color, F.english.light)
        + swap(104, 92, 196, 110, 9);
    }
    case 'outmanoeuvre': {
      // Un cube contre deux, entre régions voisines (frontière commune).
      return blob(84, 108, 96, 74, PANEL)
        + blob(212, 104, 96, 74, PANEL, 'transform="translate(-14,0)"')
        + cube(66, 90, 26, F.scottish.color, F.scottish.light)
        + cube(186, 74, 26, F.welsh.color, F.welsh.light)
        + cube(212, 106, 26, F.english.color, F.english.light)
        + swap(106, 100, 176, 96, 10);
    }
    default:
      return '';
  }
}

/* --- carte complète -------------------------------------------------- */

/**
 * Face de carte : cadre enluminé + panneau du schéma + banderole de titre.
 * Le texte de règle reste en HTML sous la carte (lisibilité).
 */
export function cardFace(cardId) {
  const c = CARDS[cardId];
  const title = c.fr;
  const size = title.length > 14 ? 15 : 17;
  const w = title.length * size * 0.58 + 16;
  const shield = c.faction
    ? `<g transform="translate(262,30)">
        <path d="M 0,-11 h 22 v 14 q 0,12 -11,17 q -11,-5 -11,-17 Z"
          fill="${FACTION_INFO[c.faction].color}" stroke="#241a0c" stroke-width="2"/>
        <path d="M 4,-2 l 3,-4 2,3 2,-3 2,3 2,-3 3,4 v 3 h -14 Z" fill="${GOLD}" stroke="#241a0c" stroke-width="0.8"/>
      </g>`
    : '';

  return `<svg viewBox="0 0 300 236" class="card-art" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="2" y="2" width="296" height="232" rx="8" fill="${PARCH}" stroke="${RUBRIC}" stroke-width="4"/>
    <rect x="9" y="9" width="282" height="218" rx="5" fill="none" stroke="${AZURE}" stroke-width="1.8" opacity="0.85"/>
    ${[[9, 9], [291, 9], [9, 227], [291, 227]].map(([x, y]) =>
      `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="${GOLD}" stroke="#241a0c" stroke-width="1.2" transform="rotate(45 ${x} ${y})"/>`).join('')}
    <g class="card-diagram">
      <rect x="20" y="20" width="260" height="158" rx="4" fill="#efe2bd" stroke="#8d7346" stroke-width="1.6"/>
      ${diagram(cardId)}
      ${shield}
    </g>
    ${ribbon(150, 204, w, title, size)}
  </svg>`;
}
