/*
 * IA pour The King is Dead — module isomorphe (client et serveur).
 *
 * Méthode : pour chaque coup légal (passer compris), on simule le coup sur une
 * copie de l'état — invocation à la cour incluse — puis on note la position
 * obtenue avec une fonction d'évaluation. L'IA joue le coup le mieux noté.
 *
 * L'évaluation encode la stratégie du jeu :
 *  - s'aligner sur la faction qui se profile comme la plus puissante,
 *    en tenant compte de la cour du coéquipier en mode équipes ;
 *  - peser les luttes à venir selon leur imminence (la piste est publique) ;
 *  - garder l'invasion comme plan B (ensembles complets), d'autant plus
 *    que l'instabilité monte ;
 *  - économiser ses cartes : agir peu, mais au bon moment.
 *
 * L'IA ne consulte jamais les mains adverses : elle joue avec la même
 * information qu'un joueur humain (le plateau, les cours, les défausses).
 */

import {
  FACTIONS, REGION_IDS, applyMove, cardChoices, summonSources, contestedIndex,
} from './game.js';

const clone = (s) => JSON.parse(JSON.stringify(s));

/* ------------------------------------------------------------------ */
/* Évaluation d'une position                                            */
/* ------------------------------------------------------------------ */

/** Cour cumulée de l'équipe du joueur (sa propre cour hors équipes). */
function teamCourt(state, seat) {
  const team = state.players[seat].team;
  const out = { scottish: 0, welsh: 0, english: 0 };
  for (const p of state.players) {
    if (p.team === team) for (const f of FACTIONS) out[f] += p.court[f];
  }
  return out;
}

const others = (f) => FACTIONS.filter((x) => x !== f);

function evaluate(state, seat) {
  const me = state.players[seat];
  const myTeam = me.team;

  // --- Projection des luttes restantes --------------------------------
  // La piste est publique : chaque région face visible ira à sa faction
  // majoritaire (avec une confiance liée à la marge), ou à l'instabilité
  // en cas d'égalité. On pondère par l'imminence.
  const weights = [1.0, 0.85, 0.72, 0.6, 0.5, 0.42, 0.36, 0.3];
  const proj = { scottish: 0, welsh: 0, english: 0 };
  for (const r of REGION_IDS) {
    const d = state.regions[r].disc;
    if (d && d !== 'unstable') proj[d] += 1;
  }
  let projTies = 0;
  let wi = 0;
  for (const t of state.track) {
    if (t.faceDown) continue;
    const f = state.regions[t.regionId].followers;
    const max = Math.max(f.scottish, f.welsh, f.english);
    const leaders = FACTIONS.filter((x) => f[x] === max);
    const w = weights[wi] || 0.3;
    if (max === 0 || leaders.length > 1) {
      projTies += w;
    } else {
      const margin = max - Math.max(...others(leaders[0]).map((x) => f[x]));
      proj[leaders[0]] += 0.45 + 0.55 * Math.tanh(margin / 2);
    }
    wi += 1;
  }

  // Probabilité (grossière) que la partie finisse par une invasion.
  const pInv = Math.max(0, Math.min(1, (state.instability + projTies) / 3));

  // --- Scénario couronnement ------------------------------------------
  // Gagne le JOUEUR (et son équipe) qui a le plus de suivants de la faction
  // la plus puissante : seule compte la marge sur le meilleur rival, faction
  // par faction, pondérée par la puissance projetée de chaque faction.
  const lead = {};
  for (const fac of FACTIONS) {
    let mine = 0, rival = 0;
    for (const p of state.players) {
      if (p.team === myTeam) mine = Math.max(mine, p.court[fac]);
      else rival = Math.max(rival, p.court[fac]);
    }
    lead[fac] = mine - rival;
  }
  const powerSum = FACTIONS.reduce((a, f) => a + proj[f] * proj[f], 0) || 1;
  let corScore = 0;
  for (const fac of FACTIONS) {
    corScore += 15 * Math.tanh(lead[fac] / 1.6) * ((proj[fac] * proj[fac]) / powerSum);
  }

  // --- Scénario invasion ----------------------------------------------
  // Gagne l'équipe qui réunit le plus d'ensembles complets (cours cumulées).
  const court = teamCourt(state, seat);
  const sets = Math.min(court.scottish, court.welsh, court.english);
  let rivalSets = 0;
  const seen = new Set([myTeam]);
  for (const p of state.players) {
    if (seen.has(p.team)) continue;
    seen.add(p.team);
    const tc = teamCourt(state, p.seat);
    rivalSets = Math.max(rivalSets, Math.min(tc.scottish, tc.welsh, tc.english));
  }
  const invScore = 14 * Math.tanh((sets - rivalSets) / 1.2) + sets * 0.6;

  // --- Mélange des deux scénarios + économie de moyens -----------------
  let score = pInv * invScore + (1 - pInv) * corScore;
  score += me.hand.length * 2.2;                 // chaque carte gardée vaut cher
  if (me.negotiationDisc) score += 0.9;
  return score;
}

/* ------------------------------------------------------------------ */
/* Énumération des coups candidats                                       */
/* ------------------------------------------------------------------ */

function candidateParams(state, card) {
  const ch = cardChoices(state, card);
  const out = [];
  if (ch.type === 'support') {
    for (const region of ch.targets) out.push({ region });
    if (!out.length) out.push({});
  } else if (ch.type === 'assemble') {
    const targets = ch.targets;
    if (!targets.length || !ch.factions.length) return [{}];
    const ci = contestedIndex(state);
    const contested = ci !== -1 ? state.track[ci].regionId : null;
    // Trois familles de combinaisons : tout au même endroit ; une faction dans
    // la région contestée et les autres groupées ailleurs ; l'inverse.
    for (const r of targets) {
      const all = {}; for (const f of ch.factions) all[f] = r;
      out.push({ placements: all });
      if (contested && targets.includes(contested) && r !== contested) {
        for (const f of ch.factions) {
          const p = {}; for (const g of ch.factions) p[g] = g === f ? contested : r;
          out.push({ placements: p });
          const q = {}; for (const g of ch.factions) q[g] = g === f ? r : contested;
          out.push({ placements: q });
        }
      }
    }
  } else if (ch.type === 'negotiate') {
    for (let a = 0; a < ch.indices.length; a++) {
      for (let b = a + 1; b < ch.indices.length; b++) {
        const i = ch.indices[a], j = ch.indices[b];
        out.push({ i, j, discOn: i });
        out.push({ i, j, discOn: j });
      }
    }
    if (!out.length) out.push({});
  } else {
    // Manœuvre / Contre-manœuvre : les options du moteur sont déjà les params.
    let opts = ch.options.map((o) => ({ ...o }));
    if (opts.length > 70) {
      // On privilégie les échanges qui touchent la région contestée ou la suivante.
      const ci = contestedIndex(state);
      const hot = new Set();
      if (ci !== -1) {
        hot.add(state.track[ci].regionId);
        const next = state.track.findIndex((t, k) => !t.faceDown && k > ci);
        if (next !== -1) hot.add(state.track[next].regionId);
      }
      const focus = opts.filter((o) => hot.has(o.a) || hot.has(o.b));
      opts = (focus.length ? focus : opts).slice(0, 70);
    }
    return opts.length ? opts : [{}];
  }
  return out;
}

/** Meilleure invocation à la cour, par simulation. */
function bestSummon(state, seat, rng) {
  let best = null, bestScore = -Infinity;
  for (const src of summonSources(state)) {
    const s2 = clone(state);
    try {
      applyMove(s2, seat, { type: 'summon', region: src.region, faction: src.faction });
    } catch { continue; }
    const sc = evaluate(s2, seat) + rng() * 0.25;
    if (sc > bestScore) { bestScore = sc; best = src; }
  }
  return best ? { type: 'summon', region: best.region, faction: best.faction } : null;
}

/* ------------------------------------------------------------------ */
/* Choix du coup                                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {object} state   état complet (le moteur valide de toute façon)
 * @param {number} seat    siège de l'IA
 * @param {'normale'|'facile'} level
 * @returns {object|null}  un coup pour applyMove
 */
export function chooseAiMove(state, seat, level = 'normale') {
  const rng = Math.random;

  if (state.phase === 'summon') {
    if (level === 'facile') {
      const src = summonSources(state);
      const s = src[Math.floor(rng() * src.length)];
      return s ? { type: 'summon', region: s.region, faction: s.faction } : null;
    }
    return bestSummon(state, seat, rng);
  }

  const hand = state.players[seat].hand;

  if (level === 'facile') {
    // Niveau détente : passe souvent, joue un coup légal au hasard sinon.
    if (!hand.length || rng() < 0.45) return { type: 'pass' };
    for (let tries = 0; tries < 8; tries++) {
      const card = hand[Math.floor(rng() * hand.length)];
      const cands = candidateParams(state, card);
      const params = cands[Math.floor(rng() * cands.length)];
      const s2 = clone(state);
      try { applyMove(s2, seat, { type: 'play', card, params }); return { type: 'play', card, params }; }
      catch { /* candidat illégal, on retente */ }
    }
    return { type: 'pass' };
  }

  // --- Niveau normal : simulation de chaque coup, invocation comprise ---
  let best = null, bestScore = -Infinity;

  const consider = (move) => {
    const s2 = clone(state);
    try { applyMove(s2, seat, move); } catch { return; }
    if (s2.phase === 'summon') {
      const sm = bestSummon(s2, seat, rng);
      if (sm) { try { applyMove(s2, seat, sm); } catch { /* sans suite */ } }
    }
    let sc;
    if (s2.phase === 'finished') {
      // Fin de partie simulée : gagner vaut tout, perdre ne vaut rien.
      const win = s2.result && s2.result.winners.includes(seat);
      sc = win ? 1e6 : -1e6;
    } else {
      sc = evaluate(s2, seat);
    }
    sc += rng() * 0.3;   // un soupçon d'aléa pour ne pas être prévisible
    if (sc > bestScore) { bestScore = sc; best = move; }
  };

  consider({ type: 'pass' });
  for (const card of new Set(hand)) {
    for (const params of candidateParams(state, card)) {
      consider({ type: 'play', card, params });
    }
  }
  return best || { type: 'pass' };
}
