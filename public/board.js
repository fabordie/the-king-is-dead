/*
 * Rendu du plateau, dans le style du jeu imprimé : carte marine sur parchemin,
 * littoral réel de la Grande-Bretagne doré à l'or, silhouettes de châteaux,
 * banderoles à l'ancienne, bordure enluminée et piste des huit cartes région.
 *
 * La géométrie vient de map-data.js, produit par build-map.mjs à partir du
 * tracé de côte Natural Earth découpé selon les frontières du plateau.
 */

import { REGIONS, REGION_IDS, FACTIONS, FACTION_INFO, ADJACENCY } from './game.js';
import { MAP, FRANCE, VIEWBOX as VB } from './map-data.js';

export const VIEWBOX = VB;

/* --- géométrie de la planche ---------------------------------------- */

const FRAME = 22;                       // épaisseur de la bordure enluminée
const MAP_BOX = { x: 44, y: 44, w: 744, h: 1092 };
const COL = { x: 792, w: 340 };         // colonne de droite
const CHEST = { x: 806, y: 52, w: 340, h: 258 };
const TRACK = { x: 806, y: 340, w: 340, row: 100 };

const CUBE = 20, GAP = 5, PER_ROW = 4;

/* --- couleurs relevées sur le plateau -------------------------------- */

const SEA = '#ece0bf';
const GOLD = '#e5b23a';
const GOLD_DARK = '#a97c15';
const INK = '#3a2b16';
const FRANCE_FILL = '#8b98ad';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Assombrit une couleur hexadécimale — pour les ombres portées. */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Éléments décoratifs                                                 */
/* ------------------------------------------------------------------ */

function defs() {
  return `<defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="11" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.11"/></feComponentTransfer>
    </filter>
    <filter id="landShadow" x="-15%" y="-15%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
    <filter id="soft" x="-40%" y="-40%" width="200%" height="200%">
      <feDropShadow dx="1" dy="2" stdDeviation="1.6" flood-color="#2b1d0c" flood-opacity="0.5"/>
    </filter>
    <filter id="cubeShadow" x="-50%" y="-50%" width="220%" height="220%">
      <feDropShadow dx="1" dy="1.6" stdDeviation="1" flood-color="#241a0c" flood-opacity="0.6"/>
    </filter>
    <radialGradient id="vellum" cx="34%" cy="22%" r="95%">
      <stop offset="0%" stop-color="#f6ecd0"/>
      <stop offset="55%" stop-color="${SEA}"/>
      <stop offset="100%" stop-color="#d7c294"/>
    </radialGradient>

    <pattern id="illum" width="46" height="${FRAME}" patternUnits="userSpaceOnUse">
      <rect width="46" height="${FRAME}" fill="#d9a521"/>
      <path d="M0,11 Q11,2.5 23,11 Q35,19.5 46,11" fill="none" stroke="#8e6a12" stroke-width="1.5"/>
      <circle cx="11" cy="6" r="3.4" fill="#a8231d"/>
      <circle cx="34" cy="16" r="3.4" fill="#2b4d8f"/>
      <path d="M23,11 l4.5,-5 l2.5,4.5 z" fill="#3d7a45"/>
      <path d="M23,11 l-4.5,5 l-2.5,-4.5 z" fill="#3d7a45"/>
    </pattern>

    <pattern id="cardback" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="18" height="18" fill="#7c3b38"/>
      <path d="M9,3 L13,9 L9,15 L5,9 Z" fill="none" stroke="#a05a54" stroke-width="1.6"/>
    </pattern>

    <clipPath id="mapClip">
      <rect x="${MAP_BOX.x}" y="${MAP_BOX.y}" width="${MAP_BOX.w}" height="${MAP_BOX.h}"/>
    </clipPath>
  </defs>`;
}

/** Le fond : parchemin, lignes de rhumb, grain. */
function vellum() {
  let s = `<rect x="0" y="0" width="1180" height="1180" fill="url(#vellum)"/>`;
  s += `<g stroke="#7d6party" stroke-width="0.55" opacity="0.4">`.replace('#7d6party', '#7d6a45');
  const hubs = [[400, 300], [400, 860], [120, 580], [690, 580], [400, 580]];
  for (const [hx, hy] of hubs) {
    for (let a = 0; a < 32; a++) {
      const th = (a * Math.PI) / 16;
      s += `<line x1="${hx}" y1="${hy}" x2="${(hx + Math.cos(th) * 1500).toFixed(1)}" y2="${(hy + Math.sin(th) * 1500).toFixed(1)}"/>`;
    }
  }
  s += `</g>`;
  // Cercle de rhumb central
  s += `<g fill="none" stroke="#7d6a45" stroke-width="0.7" opacity="0.35">
    <circle cx="400" cy="580" r="290"/><circle cx="400" cy="580" r="292"/></g>`;
  s += `<rect x="0" y="0" width="1180" height="1180" filter="url(#grain)"/>`;
  return s;
}

/** Bordure enluminée : ruban doré à rinceaux et rosaces d'angle. */
function frame() {
  const h = FRAME / 2;
  let s = `<rect x="${h}" y="${h}" width="${1180 - FRAME}" height="${1180 - FRAME}"
      fill="none" stroke="url(#illum)" stroke-width="${FRAME}"/>`;
  s += `<rect x="${FRAME}" y="${FRAME}" width="${1180 - 2 * FRAME}" height="${1180 - 2 * FRAME}"
      fill="none" stroke="${GOLD_DARK}" stroke-width="1.5"/>`;
  s += `<rect x="1" y="1" width="1178" height="1178" fill="none" stroke="#6b4a12" stroke-width="2"/>`;
  for (const [cx, cy] of [[FRAME, FRAME], [1180 - FRAME, FRAME], [FRAME, 1180 - FRAME], [1180 - FRAME, 1180 - FRAME]]) {
    s += `<circle cx="${cx}" cy="${cy}" r="15" fill="#d9a521" stroke="#6b4a12" stroke-width="1.6"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#a8231d" stroke="#6b4a12" stroke-width="1.2"/>
      <circle cx="${cx}" cy="${cy}" r="3" fill="#f0dfae"/>`;
  }
  return s;
}

/** Silhouette de château, comme celles semées sur la carte du jeu. */
function castle(x, y, s = 1) {
  const t = (a, b) => `${(x + a * s).toFixed(1)},${(y + b * s).toFixed(1)}`;
  return `<g class="castle" fill="#37322b" opacity="0.82">
    <path d="M${t(-11, 0)} L${t(-11, -9)} L${t(11, -9)} L${t(11, 0)} Z"/>
    <path d="M${t(-11, -9)} L${t(-11, -13)} L${t(-8, -13)} L${t(-8, -10.5)} L${t(-5.5, -10.5)} L${t(-5.5, -13)}
             L${t(-2.5, -13)} L${t(-2.5, -10.5)} L${t(2.5, -10.5)} L${t(2.5, -13)} L${t(5.5, -13)}
             L${t(5.5, -10.5)} L${t(8, -10.5)} L${t(8, -13)} L${t(11, -13)} L${t(11, -9)} Z"/>
    <path d="M${t(-13, -1)} L${t(-13, -17)} L${t(-6.5, -17)} L${t(-6.5, -1)} Z"/>
    <path d="M${t(-14.5, -17)} L${t(-5, -17)} L${t(-9.75, -26)} Z"/>
    <path d="M${t(6.5, -1)} L${t(6.5, -17)} L${t(13, -17)} L${t(13, -1)} Z"/>
    <path d="M${t(5, -17)} L${t(14.5, -17)} L${t(9.75, -26)} Z"/>
    <path d="M${t(-3.5, -1)} L${t(-3.5, -21)} L${t(3.5, -21)} L${t(3.5, -1)} Z"/>
    <path d="M${t(-5, -21)} L${t(5, -21)} L${t(0, -32)} Z"/>
    <path d="M${t(0, -32)} L${t(0, -38)} L${t(7, -35.5)} L${t(0, -33)} Z"/>
  </g>`;
}

/** Banderole de parchemin portant le nom d'une région. */
function banner(x, y, angle, text, size = 23) {
  const w = Math.max(88, text.length * size * 0.62 + 30);
  const h = size * 1.62;
  const n = h * 0.42;          // profondeur des échancrures
  const f = 13;                // largeur des pattes latérales
  const p = (a, b) => `${a.toFixed(1)},${b.toFixed(1)}`;
  return `<g class="banner" transform="translate(${x} ${y}) rotate(${angle})">
    <path d="M${p(-w / 2 - f, -h / 2 - 5)} L${p(-w / 2, -h / 2)} L${p(-w / 2, h / 2)} L${p(-w / 2 - f, h / 2 + 5)}
             L${p(-w / 2 - f + 5, 0)} Z" fill="#d9c69a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M${p(w / 2 + f, -h / 2 - 5)} L${p(w / 2, -h / 2)} L${p(w / 2, h / 2)} L${p(w / 2 + f, h / 2 + 5)}
             L${p(w / 2 + f - 5, 0)} Z" fill="#d9c69a" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M${p(-w / 2, -h / 2)} L${p(w / 2, -h / 2)} L${p(w / 2 - n, 0)} L${p(w / 2, h / 2)}
             L${p(-w / 2, h / 2)} L${p(-w / 2 + n, 0)} Z"
      fill="#f6ecd0" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" filter="url(#soft)"/>
    <text x="0" y="${size * 0.35}" text-anchor="middle" class="rg-name" style="font-size:${size}px">${esc(text)}</text>
  </g>`;
}

/* ------------------------------------------------------------------ */
/* Le coffre de la réserve                                             */
/* ------------------------------------------------------------------ */

function chest(state) {
  const { x, y, w, h } = CHEST;
  let s = `<g class="chest">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#c5a26d" stroke="#5b431f" stroke-width="3" filter="url(#soft)"/>
    <rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="5" fill="#eadcb6" stroke="#8d7346" stroke-width="1.5"/>
    <rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="30" rx="4" fill="#a8231d"/>
    <text x="${x + w / 2}" y="${y + 31}" text-anchor="middle" class="chest-title">Réserve</text>`;
  // Chaque faction : sa pile de cubes, dessinée cube par cube, plus le compte.
  FACTIONS.forEach((f, i) => {
    const cy = y + 78 + i * 62;
    const c = FACTION_INFO[f];
    const n = state.supply[f];
    s += `<text x="${x + 22}" y="${cy - 12}" class="chest-lbl" style="font-size:14px">${c.fr}</text>
      <text x="${x + w - 24}" y="${cy + 14}" text-anchor="end" class="chest-num">${n}</text>`;
    const mini = 13, gap = 3, perRow = 9;
    for (let k = 0; k < n; k++) {
      const col = k % perRow, row = Math.floor(k / perRow);
      const cx = x + 22 + col * (mini + gap);
      const cyy = cy - 4 + row * (mini + gap);
      s += `<rect x="${cx}" y="${cyy}" width="${mini}" height="${mini}" rx="2" fill="${c.color}"
          stroke="#241a0c" stroke-width="1.1"/>
        <rect x="${cx + 2.5}" y="${cyy + 2.5}" width="${mini - 5}" height="${mini - 5}" rx="1" fill="none"
          stroke="${c.light}" stroke-width="1" opacity="0.85"/>`;
    }
    if (n === 0) {
      s += `<text x="${x + 22}" y="${cy + 6}" class="chest-lbl" style="font-size:12px;opacity:.55;font-style:italic">épuisée</text>`;
    }
  });
  return s + `</g>`;
}

/* ------------------------------------------------------------------ */
/* Les huit espaces numérotés et leurs cartes région                    */
/* ------------------------------------------------------------------ */

function trackColumn(state, hi) {
  const contested = state.track.findIndex((t) => !t.faceDown);
  let s = `<g class="trackcol">`;
  s += `<text x="${TRACK.x + TRACK.w / 2}" y="${TRACK.y - 12}" text-anchor="middle" class="col-title">Ordre des luttes</text>`;
  state.track.forEach((t, i) => {
    const y = TRACK.y + i * TRACK.row;
    const r = REGIONS[t.regionId];
    const pick = hi.track.has(i);
    const sel = hi.trackPicked.has(i);
    const cls = ['tcard', t.faceDown ? 'down' : '', i === contested ? 'contested' : '',
      pick ? 'pickable' : '', sel ? 'picked' : ''].filter(Boolean).join(' ');
    s += `<g class="${cls}" data-track="${i}">
      <circle cx="${TRACK.x + 26}" cy="${y + 40}" r="22" fill="#d9a521" stroke="#6b4a12" stroke-width="2.5"/>
      <circle cx="${TRACK.x + 26}" cy="${y + 40}" r="17" fill="none" stroke="#f0dfae" stroke-width="1.4" opacity="0.8"/>
      <text x="${TRACK.x + 26}" y="${y + 48}" text-anchor="middle" class="tnum">${i + 1}</text>`;
    const cx = TRACK.x + 58, cw = TRACK.w - 58;
    if (t.faceDown) {
      s += `<rect x="${cx}" y="${y + 8}" width="${cw}" height="64" rx="6" fill="url(#cardback)" stroke="#4a2a28" stroke-width="2.5" filter="url(#soft)"/>
        <rect x="${cx + 7}" y="${y + 15}" width="${cw - 14}" height="50" rx="4" fill="none" stroke="#c08a86" stroke-width="1.2" opacity="0.6"/>
        <text x="${cx + cw / 2}" y="${y + 46}" text-anchor="middle" class="tdown">${esc(r.fr)}</text>`;
    } else {
      s += `<rect x="${cx}" y="${y + 8}" width="${cw}" height="64" rx="6" fill="#f3e7c8" stroke="#8d7346" stroke-width="2.5" filter="url(#soft)"/>
        <rect x="${cx + 6}" y="${y + 14}" width="16" height="52" rx="3" fill="${r.color}" stroke="${INK}" stroke-width="1.4"/>
        <text x="${cx + 32}" y="${y + 47}" class="tname">${esc(r.fr)}</text>`;
      if (i === contested) {
        s += `<rect x="${cx - 4}" y="${y + 4}" width="${cw + 8}" height="72" rx="8" fill="none" stroke="#a8231d" stroke-width="3"/>
          <text x="${TRACK.x + TRACK.w}" y="${y + 88}" text-anchor="end" class="tflag">région contestée</text>`;
      }
    }
    if (t.negotiation) {
      s += `<circle cx="${TRACK.x + TRACK.w - 22}" cy="${y + 26}" r="11" fill="#fbf7ea" stroke="#5b431f" stroke-width="2.5"/>`;
    }
    if (pick || sel) {
      s += `<rect x="${cx - 6}" y="${y + 2}" width="${cw + 12}" height="76" rx="9" fill="none"
        stroke="${sel ? '#2b4d8f' : '#fff3c4'}" stroke-width="4" class="tring"/>`;
    }
    s += `</g>`;
  });
  return s + `</g>`;
}

/* ------------------------------------------------------------------ */
/* Cubes                                                               */
/* ------------------------------------------------------------------ */

function cubeLayout(n, cx, cy) {
  const pts = [];
  const rows = Math.ceil(n / PER_ROW) || 1;
  const totalH = rows * CUBE + (rows - 1) * GAP;
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(PER_ROW, n - r * PER_ROW);
    const totalW = inRow * CUBE + (inRow - 1) * GAP;
    for (let c = 0; c < inRow; c++) {
      pts.push([cx - totalW / 2 + c * (CUBE + GAP), cy - totalH / 2 + r * (CUBE + GAP)]);
    }
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/* Le plateau complet                                                  */
/* ------------------------------------------------------------------ */

/**
 * @param {object} state  vue de partie
 * @param {object} hi     surbrillance : { active, regions:Set, cubes:Set, selected:Set,
 *                        selectedCubes:string[], track:Set, trackPicked:Set }
 */
export function renderBoard(state, hi = {}) {
  const H = {
    active: !!hi.active,
    regions: hi.regions || new Set(),
    cubes: hi.cubes || new Set(),
    selected: hi.selected || new Set(),
    selectedCubes: hi.selectedCubes || [],
    track: hi.track || new Set(),
    trackPicked: hi.trackPicked || new Set(),
    arrowFrom: hi.arrowFrom || null,   // région source : flèches vers les cibles possibles
  };

  let s = `<svg viewBox="${VIEWBOX}" class="board-svg" xmlns="http://www.w3.org/2000/svg">`;
  s += defs();
  s += vellum();
  s += frame();

  /* --- la carte, dans son cadre ------------------------------------ */
  s += `<g clip-path="url(#mapClip)">`;

  // Ombres portées des terres, en une passe pour qu'aucune ne tombe sur une voisine.
  s += `<g filter="url(#landShadow)" opacity="0.34">`;
  for (const id of REGION_IDS) s += `<path d="${MAP[id].d}" fill="#4a3418" transform="translate(6 9)"/>`;
  s += `<path d="${FRANCE.d}" fill="#4a3418" transform="translate(6 9)"/>`;
  s += `</g>`;

  // France
  s += `<g class="france">
    <path d="${FRANCE.d}" fill="none" stroke="${GOLD}" stroke-width="9" stroke-linejoin="round"/>
    <path d="${FRANCE.d}" fill="${FRANCE_FILL}" stroke="#31384a" stroke-width="2"/>
    ${castle(680, 1102, 0.8)}${castle(740, 1120, 0.8)}
    ${banner(688, 1058, -4, 'France', 20)}
  </g>`;

  // Régions : dorure puis remplissage, région par région.
  for (const id of REGION_IDS) {
    const reg = state.regions[id];
    const info = REGIONS[id];
    const isHi = H.regions.has(id);
    const isSel = H.selected.has(id);
    const dim = H.active && !isHi && !isSel;
    const cls = ['region', isHi ? 'hi' : '', isSel ? 'sel' : '', dim ? 'dim' : '', reg.disc ? 'claimed' : ''].filter(Boolean).join(' ');

    s += `<g class="${cls}" data-region="${id}">
      <path class="rg-gold" d="${MAP[id].d}" fill="none" stroke="${GOLD}" stroke-width="10" stroke-linejoin="round"/>
      <path class="rg-shape" d="${MAP[id].d}" fill="${info.color}" stroke="${shade(info.color, 0.45)}" stroke-width="2"/>`;
    if (isHi || isSel) {
      s += `<path class="rg-ring" d="${MAP[id].d}" fill="none"
        stroke="${isSel ? '#2b4d8f' : '#fffbe6'}" stroke-width="5" stroke-linejoin="round"/>`;
    }
    for (const [cx, cy] of MAP[id].castles) s += castle(cx, cy, 0.9);
    s += `<path class="rg-hit" d="${MAP[id].d}" fill="transparent"/>`;
    s += `</g>`;
  }

  // Banderoles au-dessus de tout, pour rester lisibles.
  for (const id of REGION_IDS) {
    const [lx, ly, la] = MAP[id].label;
    const dim = H.active && !H.regions.has(id) && !H.selected.has(id);
    s += `<g class="bannerwrap ${dim ? 'dim' : ''}">${banner(lx, ly, la, REGIONS[id].fr)}</g>`;
  }

  // Pions : cubes, ou disque de contrôle une fois la région attribuée.
  for (const id of REGION_IDS) {
    const reg = state.regions[id];
    const [ccx, ccy] = MAP[id].cubes;
    if (reg.disc) {
      const unstable = reg.disc === 'unstable';
      const fill = unstable ? '#463424' : FACTION_INFO[reg.disc].color;
      s += `<g class="disc"><circle cx="${ccx}" cy="${ccy}" r="27" fill="${fill}" stroke="#241a0c" stroke-width="3" filter="url(#cubeShadow)"/>
        <circle cx="${ccx}" cy="${ccy}" r="20" fill="none" stroke="#f6ecd0" stroke-width="1.8" opacity="0.75"/>`;
      if (unstable) s += `<text x="${ccx}" y="${ccy + 9}" text-anchor="middle" class="disc-mark">!</text>`;
      s += `</g>`;
    } else {
      const list = [];
      for (const f of FACTIONS) for (let k = 0; k < reg.followers[f]; k++) list.push(f);
      const pts = cubeLayout(list.length, ccx, ccy);
      list.forEach((f, i) => {
        const [x, y] = pts[i];
        const key = `${id}:${f}`;
        const cubeHi = H.cubes.has(key);
        const nSel = H.selectedCubes.filter((c) => c === key).length;
        const rank = list.slice(0, i + 1).filter((g) => g === f).length;
        const cubeSel = rank <= nSel;
        const c = FACTION_INFO[f];
        s += `<g class="cube ${cubeHi ? 'hi' : ''} ${cubeSel ? 'sel' : ''} ${H.active && !cubeHi && !cubeSel ? 'dim' : ''}"
            data-region="${id}" data-faction="${f}">
          ${cubeHi ? `<circle class="cube-halo" cx="${x + CUBE / 2}" cy="${y + CUBE / 2}" r="${CUBE * 1.05}"/>` : ''}
          ${cubeSel ? `<circle class="cube-halo sel" cx="${x + CUBE / 2}" cy="${y + CUBE / 2}" r="${CUBE * 1.0}"/>` : ''}
          <rect x="${x}" y="${y}" width="${CUBE}" height="${CUBE}" rx="3" fill="${c.color}" stroke="#241a0c" stroke-width="1.8" filter="url(#cubeShadow)"/>
          <rect x="${x + 3}" y="${y + 3}" width="${CUBE - 6}" height="${CUBE - 6}" rx="1.5" fill="none" stroke="${c.light}" stroke-width="1.6" opacity="0.9"/>
          <rect x="${x - 9}" y="${y - 9}" width="${CUBE + 18}" height="${CUBE + 18}" fill="transparent"/>
        </g>`;
      });
    }
  }

  // Les disques d'instabilité s'accumulent en France.
  s += `<g class="instab">`;
  for (let i = 0; i < 3; i++) {
    const placed = i < state.instability;
    s += `<circle cx="${508 + i * 40}" cy="${1096}" r="14" fill="${placed ? '#463424' : '#c9bd9c'}"
      stroke="${placed ? '#241a0c' : '#6b5c3d'}" stroke-width="${placed ? 2.5 : 1.6}"
      stroke-dasharray="${placed ? 'none' : '4 3'}" opacity="${placed ? 1 : 0.75}"/>`;
    if (placed) s += `<text x="${508 + i * 40}" y="${1102}" text-anchor="middle" class="disc-mark" style="font-size:15px">!</text>`;
  }
  s += `</g>`;

  // Flèches de déplacement : du pion sélectionné vers chaque destination possible.
  if (H.arrowFrom && H.cubes.size) {
    const targets = new Set();
    for (const key of H.cubes) {
      const rid = key.split(':')[0];
      if (rid !== H.arrowFrom) targets.add(rid);
    }
    const [fx, fy] = MAP[H.arrowFrom].cubes;
    for (const rid of targets) {
      const [tx, ty] = MAP[rid].cubes;
      const dx = tx - fx, dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      // On raccourcit la flèche pour ne pas recouvrir les pions.
      const sx = fx + (dx / len) * 34, sy = fy + (dy / len) * 34;
      const ex = tx - (dx / len) * 42, ey = ty - (dy / len) * 42;
      const mx = (sx + ex) / 2 - dy / len * len * 0.14;
      const my = (sy + ey) / 2 + dx / len * len * 0.14;
      const a = Math.atan2(ey - my, ex - mx);
      const h = 16;
      s += `<g class="move-arrow">
        <path d="M ${sx.toFixed(1)},${sy.toFixed(1)} Q ${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"
          fill="none" stroke="#2b1d0c" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
        <path class="ma-dash" d="M ${sx.toFixed(1)},${sy.toFixed(1)} Q ${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"
          fill="none" stroke="#ffd86b" stroke-width="4" stroke-linecap="round"/>
        <path d="M ${ex.toFixed(1)},${ey.toFixed(1)}
          L ${(ex - h * Math.cos(a - 0.45)).toFixed(1)},${(ey - h * Math.sin(a - 0.45)).toFixed(1)}
          L ${(ex - h * Math.cos(a + 0.45)).toFixed(1)},${(ey - h * Math.sin(a + 0.45)).toFixed(1)} Z"
          fill="#ffd86b" stroke="#2b1d0c" stroke-width="1.6"/>
      </g>`;
    }
  }

  s += `</g>`;   // fin du clip de la carte

  // Filet doré autour de la carte
  s += `<rect x="${MAP_BOX.x}" y="${MAP_BOX.y}" width="${MAP_BOX.w}" height="${MAP_BOX.h}"
    fill="none" stroke="${GOLD_DARK}" stroke-width="2" opacity="0.55"/>`;

  /* --- colonne de droite ------------------------------------------- */
  s += chest(state);
  s += trackColumn(state, H);

  s += `</svg>`;
  return s;
}

export function neighboursLabel(id) {
  return ADJACENCY[id].map((n) => REGIONS[n].fr).join(', ');
}
