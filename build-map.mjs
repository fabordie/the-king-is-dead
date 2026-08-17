/*
 * Génère public/map-data.js à partir du littoral réel de la Grande-Bretagne.
 *
 * Méthode : on prend le tracé de côte de Natural Earth (résolution 1:10 M),
 * on le découpe par huit polygones de partition tracés le long des frontières
 * historiques que suit le plateau (ligne des Highlands, frontière anglo-écossaise,
 * Pennines, ligne Mersey–Humber, marche galloise, Severn, etc.), puis on projette
 * en conique conforme — la projection usuelle des cartes des îles Britanniques.
 *
 * Lancer : node build-map.mjs
 */

import fs from 'node:fs';
import * as topojson from 'topojson-client';
import polygonClipping from 'polygon-clipping';
import { geoConicConformal, geoPath, geoBounds } from 'd3-geo';

const clip = polygonClipping.default || polygonClipping;

/* ------------------------------------------------------------------ */
/* 1. Le littoral                                                       */
/* ------------------------------------------------------------------ */

const world = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-10m.json'));
const countries = topojson.feature(world, world.objects.countries).features;

const uk = countries.find((f) => /United Kingdom/i.test(f.properties.name));
const fr = countries.find((f) => /^France$/i.test(f.properties.name));

function ringsOf(geom) {
  return geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
}

function bboxOf(poly) {
  const r = poly[0];
  const xs = r.map((c) => c[0]), ys = r.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// On garde la Grande-Bretagne et ses îles ; on écarte l'Irlande du Nord
// (absente du plateau), les Shetland et l'île de Man.
const britain = ringsOf(uk.geometry).filter((p) => {
  const [w, s, e, n] = bboxOf(p);
  if (e < -5.35 && s > 53.9 && n < 55.5) return false;   // Irlande du Nord
  if (s > 59.7) return false;                             // Shetland
  if (w > -4.9 && e < -4.2 && s > 54.0 && n < 54.5) return false; // île de Man
  return true;
});

console.log(`littoral : ${britain.length} polygones, ${britain.reduce((a, p) => a + p[0].length, 0)} sommets`);

/* ------------------------------------------------------------------ */
/* 2. Les huit régions du plateau                                       */
/* ------------------------------------------------------------------ */

const W = -12, E = 5, S = 46, N = 62;

/** Demi-plan au nord d'une polyligne donnée d'ouest en est. */
const above = (pts) => [[...pts, [E, N], [W, N], pts[0]]];
const below = (pts) => [[...pts, [E, S], [W, S], pts[0]]];
/** Demi-plan à l'ouest / à l'est d'une polyligne donnée du sud vers le nord. */
const left = (pts) => [[...pts, [W, N], [W, S], pts[0]]];
const right = (pts) => [[...pts, [E, N], [E, S], pts[0]]];

// Ligne des Highlands (faille de la frontière calédonienne : Helensburgh → Stonehaven)
const L_HIGHLAND = [[W, 53.23], [-4.73, 56.00], [-2.21, 56.96], [E, 59.71]];
// Frontière anglo-écossaise (Solway → Tweed)
const L_BORDER = [[W, 47.93], [-3.05, 54.96], [-2.02, 55.77], [E, 61.29]];
// Ligne Mersey–Humber : limite sud du nord de l'Angleterre
const L_HUMBER = [[W, 52.60], [-3.20, 53.35], [0.30, 53.65], [E, 54.05]];
// Crête des Pennines : sépare Lancaster (ouest) de Northumbria (est)
const L_PENNINES = [[1.723, S], [-1.70, 53.45], [-2.55, 55.30], [-5.629, N]];
// Marche galloise, du Dee au Severn
const L_WALES = [[-2.42, S], [-2.42, 51.85], [-2.75, 51.98], [-3.12, 53.36], [-5.436, N]];
// Limite nord du sud-ouest : Severn, canal de Bristol, puis vallée de la Tamise
const L_SOUTH = [[W, 51.11], [-7.00, 51.24], [-3.50, 51.33], [-2.62, 51.55], [-2.42, 51.85], [-0.95, 51.70], [E, 51.70]];
// Limite orientale : sépare Essex de Devon au sud, de Warwick au nord.
// Une seule polyligne, pour qu'aucun interstice ne subsiste entre les régions.
const L_EAST = [[-2.484, S], [-1.30, 50.40], [-0.95, 51.70], [-0.85, 53.75], [-0.447, N]];

const PARTITION = {
  moray: [above(L_HIGHLAND)],
  strathclyde: [below(L_HIGHLAND), above(L_BORDER)],
  lancaster: [below(L_BORDER), above(L_HUMBER), left(L_PENNINES)],
  northumbria: [below(L_BORDER), above(L_HUMBER), right(L_PENNINES)],
  gwynedd: [below(L_HUMBER), left(L_WALES), above(L_SOUTH)],
  warwick: [below(L_HUMBER), right(L_WALES), above(L_SOUTH), left(L_EAST)],
  essex: [below(L_HUMBER), right(L_EAST)],
  devon: [below(L_SOUTH), left(L_EAST)],
};

// On écarte les îlots trop petits pour être lisibles à l'écran.
const ringSize = (r) => {
  const xs = r.map((c) => c[0]), ys = r.map((c) => c[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
const land = britain.filter((poly) => ringSize(poly[0]) > 0.07);
const regionGeom = {};
for (const [id, halfPlanes] of Object.entries(PARTITION)) {
  let g = land;
  for (const hp of halfPlanes) g = clip.intersection(g, [hp]);
  regionGeom[id] = g;
  const pts = g.reduce((a, poly) => a + poly.reduce((b, r) => b + r.length, 0), 0);
  console.log(`  ${id.padEnd(12)} ${String(g.length).padStart(2)} polygone(s), ${pts} sommets`);
}

/* ------------------------------------------------------------------ */
/* 3. Vérification des adjacences                                       */
/* ------------------------------------------------------------------ */

const EXPECTED = {
  moray: ['strathclyde'],
  strathclyde: ['moray', 'lancaster', 'northumbria'],
  lancaster: ['strathclyde', 'northumbria', 'gwynedd', 'warwick'],
  northumbria: ['strathclyde', 'lancaster', 'warwick', 'essex'],
  gwynedd: ['lancaster', 'warwick', 'devon'],
  warwick: ['lancaster', 'northumbria', 'gwynedd', 'essex', 'devon'],
  essex: ['northumbria', 'warwick', 'devon'],
  devon: ['gwynedd', 'warwick', 'essex'],
};

/*
 * On mesure la longueur de frontière commune plutôt que de compter des sommets
 * partagés : deux régions découpées séparément n'ont pas les mêmes sommets le
 * long d'un même segment. On échantillonne les contours puis on compare.
 */
const STEP = 0.01;   // degrés — pas d'échantillonnage
const EPS  = 0.02;   // degrés — distance sous laquelle deux contours se touchent

function samples(id) {
  const out = [];
  for (const poly of regionGeom[id]) for (const ring of poly) {
    for (let i = 1; i < ring.length; i++) {
      const [x1, y1] = ring[i - 1], [x2, y2] = ring[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.ceil(len / STEP));
      for (let k = 0; k < n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
    }
  }
  return out;
}

const SAMPLES = Object.fromEntries(Object.keys(EXPECTED).map((id) => [id, samples(id)]));
const grids = Object.fromEntries(Object.entries(SAMPLES).map(([id, pts]) => {
  const g = new Map();
  for (const [x, y] of pts) {
    const k = `${Math.floor(x / EPS)},${Math.floor(y / EPS)}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push([x, y]);
  }
  return [id, g];
}));

/** Longueur approchée, en degrés, de la frontière commune à deux régions. */
function sharedBorder(a, b) {
  const g = grids[b];
  let hits = 0;
  for (const [x, y] of SAMPLES[a]) {
    const cx = Math.floor(x / EPS), cy = Math.floor(y / EPS);
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1 && !near; dy++) {
      const cell = g.get(`${cx + dx},${cy + dy}`);
      if (!cell) continue;
      for (const [px, py] of cell) if (Math.hypot(px - x, py - y) < EPS) { near = true; break; }
    }
    if (near) hits++;
  }
  return hits * STEP;
}

let adjOk = true;
for (const a of Object.keys(EXPECTED)) {
  for (const b of Object.keys(EXPECTED)) {
    if (a >= b) continue;
    const want = EXPECTED[a].includes(b);
    const len = sharedBorder(a, b);
    const got = len > 0.06;   // ~6 km : au-delà, la frontière est franchement visible
    if (want !== got) { adjOk = false; console.error(`  ✗ ${a}–${b} : attendu ${want}, obtenu ${got} (${len.toFixed(2)}°)`); }
    else if (want) console.log(`    ${a}–${b} : ${len.toFixed(2)}° de frontière commune`);
  }
}
console.log(adjOk ? '✓ adjacences conformes au plateau' : 'ADJACENCES INCORRECTES');

// Aucun interstice : la somme des aires doit rendre l'aire totale des terres.
const ringArea = (r) => { let s = 0; for (let i = 1; i < r.length; i++) s += r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1]; return s / 2; };
const areaOf = (mp) => mp.reduce((a, poly) => a + poly.reduce((b, r, i) => b + (i ? -Math.abs(ringArea(r)) : Math.abs(ringArea(r))), 0), 0);
const landArea = areaOf(land);
const sumArea = Object.values(regionGeom).reduce((a, g) => a + areaOf(g), 0);
const drift = Math.abs(sumArea - landArea) / landArea;
console.log(drift < 1e-6
  ? '✓ partition sans interstice ni recouvrement'
  : `  ✗ écart d'aire : ${(drift * 100).toFixed(4)} %`);

/* ------------------------------------------------------------------ */
/* 4. Projection                                                        */
/* ------------------------------------------------------------------ */

/*
 * On projette les sommets un à un plutôt que par geoPath : d3 lit les anneaux
 * en convention sphérique et prendrait les polygones planaires de
 * polygon-clipping pour leur complémentaire (toute la sphère moins la région).
 */
const VB_W = 1180, VB_H = 1180;
const MAP_BOX = [[44, 44], [788, VB_H - 44]];   // la carte occupe la partie gauche

const raw = geoConicConformal().parallels([50, 58]).rotate([4.4, 0]).scale(4000).translate([0, 0]);

// Cadre de la carte, calculé sur la Grande-Bretagne seule (la France dépasse en bas à droite).
let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
for (const g of Object.values(regionGeom)) for (const poly of g) for (const ring of poly) {
  for (const pt of ring) {
    const [x, y] = raw(pt);
    if (x < bx1) bx1 = x; if (x > bx2) bx2 = x;
    if (y < by1) by1 = y; if (y > by2) by2 = y;
  }
}
const [[mx1, my1], [mx2, my2]] = MAP_BOX;
const scale = Math.min((mx2 - mx1) / (bx2 - bx1), (my2 - my1) / (by2 - by1));
const ox = mx1 + ((mx2 - mx1) - (bx2 - bx1) * scale) / 2 - bx1 * scale;
const oy = my1 + ((my2 - my1) - (by2 - by1) * scale) / 2 - by1 * scale;

const p = (lon, lat) => {
  const [x, y] = raw([lon, lat]);
  return [Math.round((x * scale + ox) * 10) / 10, Math.round((y * scale + oy) * 10) / 10];
};

function toPath(multi) {
  let d = '';
  for (const poly of multi) for (const ring of poly) {
    ring.forEach((pt, i) => {
      const [x, y] = p(pt[0], pt[1]);
      d += (i ? 'L' : 'M') + x + ',' + y;
    });
    d += 'Z';
  }
  return d;
}

const REGION_PATHS = {};
for (const [id, g] of Object.entries(regionGeom)) REGION_PATHS[id] = toPath(g);

// France : on ne garde que la côte de la Manche, dans le coin du plateau.
const franceBox = [[[-2.6, 47.6], [3.4, 47.6], [3.4, 51.3], [-2.6, 51.3], [-2.6, 47.6]]];
const franceGeom = clip.intersection(ringsOf(fr.geometry).filter((poly) => {
  const [w, s, e, n] = bboxOf(poly);
  return w > -6 && e < 10 && s > 41 && n < 52;
}), [franceBox]);
const FRANCE_PATH = toPath(franceGeom);
{
  let fx1 = Infinity, fy1 = Infinity, fx2 = -Infinity, fy2 = -Infinity;
  for (const poly of franceGeom) for (const ring of poly) for (const pt of ring) {
    const [x, y] = p(pt[0], pt[1]);
    if (x < fx1) fx1 = x; if (x > fx2) fx2 = x;
    if (y < fy1) fy1 = y; if (y > fy2) fy2 = y;
  }
  console.log(`France projetée : ${Math.round(fx1)},${Math.round(fy1)} → ${Math.round(fx2)},${Math.round(fy2)}`);
}

/* ------------------------------------------------------------------ */
/* 5. Bannières, cubes, châteaux                                        */
/* ------------------------------------------------------------------ */

const ANCHORS = {
  moray:       { label: [-4.30, 57.95, -20], cubes: [-4.10, 57.30] },
  strathclyde: { label: [-4.55, 55.72, -10], cubes: [-3.95, 55.38] },
  lancaster:   { label: [-2.95, 54.72, -64], cubes: [-2.80, 54.02] },
  northumbria: { label: [-0.95, 54.62,  16], cubes: [-0.68, 54.02] },
  gwynedd:     { label: [-3.95, 52.72, -12], cubes: [-3.62, 52.28] },
  warwick:     { label: [-1.52, 52.98,   6], cubes: [-1.42, 52.42] },
  essex:       { label: [ 0.85, 52.38,  12], cubes: [ 0.62, 51.86] },
  devon:       { label: [-3.65, 50.98,  -7], cubes: [-3.35, 50.68] },
};

const CASTLES = {
  moray:       [[-4.23, 57.48], [-2.10, 57.15], [-5.11, 56.82], [-3.09, 58.44], [-3.31, 57.65]],
  strathclyde: [[-4.25, 55.86], [-3.19, 55.95], [-4.63, 55.46], [-2.80, 55.60]],
  lancaster:   [[-2.94, 54.89], [-2.80, 54.05], [-2.75, 54.42], [-2.70, 53.76]],
  northumbria: [[-1.61, 54.98], [-1.08, 53.96], [-1.57, 54.78], [-0.40, 54.28]],
  gwynedd:     [[-4.27, 53.14], [-4.08, 52.41], [-3.18, 51.55], [-3.00, 52.72], [-3.88, 52.74]],
  warwick:     [[-1.58, 52.28], [-1.15, 52.95], [-2.75, 52.71], [-1.13, 52.63], [-1.90, 52.48]],
  essex:       [[ 1.30, 52.63], [ 1.08, 51.28], [ 0.90, 51.89], [-0.13, 51.51], [-0.54, 53.23]],
  devon:       [[-3.53, 50.72], [-2.59, 51.45], [-1.79, 51.07], [-4.75, 50.40], [-2.10, 50.75]],
};

const FRANCE_LABEL = [1.30, 49.35, 0];

/** Contrôle : chaque ancre doit tomber dans sa région. */
function inside(id, lon, lat) {
  let n = 0;
  for (const poly of regionGeom[id]) for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) n++;
    }
  }
  return n % 2 === 1;
}
for (const [id, a] of Object.entries(ANCHORS)) {
  if (!inside(id, a.cubes[0], a.cubes[1])) console.error(`  ✗ ancre de cubes hors de ${id}`);
}
for (const [id, list] of Object.entries(CASTLES)) {
  list.forEach((c, i) => { if (!inside(id, c[0], c[1])) console.error(`  ✗ château ${i} hors de ${id}`); });
}

/* ------------------------------------------------------------------ */
/* 6. Écriture                                                          */
/* ------------------------------------------------------------------ */

const out = {};
for (const id of Object.keys(ANCHORS)) {
  const a = ANCHORS[id];
  out[id] = {
    d: REGION_PATHS[id],
    label: [...p(a.label[0], a.label[1]), a.label[2]],
    cubes: p(a.cubes[0], a.cubes[1]),
    castles: CASTLES[id].map((c) => p(c[0], c[1])),
  };
}

const js = `/*
 * Géométrie de la carte — FICHIER GÉNÉRÉ, ne pas modifier à la main.
 * Produit par build-map.mjs à partir du littoral Natural Earth 1:10 M,
 * découpé selon les frontières que suit le plateau puis projeté en
 * conique conforme (parallèles 50°N et 58°N, méridien central 4,4°O).
 */

export const VIEWBOX = '0 0 ${VB_W} ${VB_H}';

export const MAP = ${JSON.stringify(out, null, 1)};

export const FRANCE = {
  d: ${JSON.stringify(FRANCE_PATH)},
  label: [${p(FRANCE_LABEL[0], FRANCE_LABEL[1])}, ${FRANCE_LABEL[2]}],
};
`;

fs.writeFileSync('public/map-data.js', js);
console.log(`public/map-data.js écrit — ${(js.length / 1024).toFixed(0)} Ko`);
