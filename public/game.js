/*
 * The King is Dead (2e édition) — moteur de règles
 * Module ES isomorphe : utilisable par le serveur Node et par le navigateur.
 *
 * Le moteur est *autoritaire* : toute action passe par applyMove(), qui valide
 * le coup contre les règles avant de muter l'état. Aucune règle n'est appliquée
 * côté interface.
 */

/* ------------------------------------------------------------------ */
/* Données statiques                                                    */
/* ------------------------------------------------------------------ */

export const FACTIONS = ['scottish', 'welsh', 'english'];

export const FACTION_INFO = {
  scottish: { fr: 'Écossais', adj: 'écossaise', color: '#2f5fa6', light: '#4f83cc' },
  welsh:    { fr: 'Gallois',  adj: 'galloise',  color: '#b8302c', light: '#d9534f' },
  english:  { fr: 'Anglais',  adj: 'anglaise',  color: '#e3b208', light: '#f2ce3d' },
};

/** Les huit régions, avec la couleur du plateau imprimé. */
export const REGIONS = {
  moray:       { fr: 'Moray',       color: '#6f9fc4' },
  strathclyde: { fr: 'Strathclyde', color: '#cf9f2e' },
  lancaster:   { fr: 'Lancaster',   color: '#2e7f74' },
  northumbria: { fr: 'Northumbria', color: '#e8a2b4' },
  gwynedd:     { fr: 'Gwynedd',     color: '#a63c31' },
  warwick:     { fr: 'Warwick',     color: '#41626e' },
  essex:       { fr: 'Essex',       color: '#b3c437' },
  devon:       { fr: 'Devon',       color: '#4f9e59' },
};

export const REGION_IDS = Object.keys(REGIONS);

/** Adjacences relevées sur la carte du plateau. Symétriques. */
export const ADJACENCY = {
  moray:       ['strathclyde'],
  strathclyde: ['moray', 'lancaster', 'northumbria'],
  lancaster:   ['strathclyde', 'northumbria', 'gwynedd', 'warwick'],
  northumbria: ['strathclyde', 'lancaster', 'warwick', 'essex'],
  gwynedd:     ['lancaster', 'warwick', 'devon'],
  warwick:     ['lancaster', 'northumbria', 'gwynedd', 'essex', 'devon'],
  essex:       ['northumbria', 'warwick', 'devon'],
  devon:       ['gwynedd', 'warwick', 'essex'],
};

/** Régions d'origine de chaque faction. */
export const HOME_REGION = {
  scottish: 'moray',
  welsh: 'gwynedd',
  english: 'essex',
};

/** Les huit cartes action du jeu de base. */
export const CARDS = {
  scottish_support: {
    fr: 'Soutien écossais',
    en: 'Scottish Support',
    faction: 'scottish',
    text: "Placez deux suivants écossais de la réserve dans une région qui borde une région contrôlée par les Écossais. S'il n'y a ni disque de contrôle ni disque d'instabilité à Moray, vous pouvez à la place placer les suivants dans une région bordant Moray.",
  },
  welsh_support: {
    fr: 'Soutien gallois',
    en: 'Welsh Support',
    faction: 'welsh',
    text: "Placez deux suivants gallois de la réserve dans une région qui borde une région contrôlée par les Gallois. S'il n'y a ni disque de contrôle ni disque d'instabilité à Gwynedd, vous pouvez à la place placer les suivants dans une région bordant Gwynedd.",
  },
  english_support: {
    fr: 'Soutien anglais',
    en: 'English Support',
    faction: 'english',
    text: "Placez deux suivants anglais de la réserve dans une région qui borde une région contrôlée par les Anglais. S'il n'y a ni disque de contrôle ni disque d'instabilité à Essex, vous pouvez à la place placer les suivants dans une région bordant Essex.",
  },
  assemble: {
    fr: 'Rassemblement',
    en: 'Assemble',
    text: "Placez un suivant écossais, un suivant gallois et un suivant anglais de la réserve dans une ou plusieurs régions au choix. S'il n'y a aucun suivant d'une faction dans la réserve, ne placez pas ce suivant ; placez tout de même ceux des autres factions.",
  },
  negotiate: {
    fr: 'Négociation',
    en: 'Negotiate',
    text: "Échangez la position de deux cartes région face visible. Placez un disque de négociation sur l'une des deux cartes échangées. Vous ne pouvez pas échanger de cartes face cachée ou portant déjà un disque de négociation.",
  },
  manoeuvre: {
    fr: 'Manœuvre',
    en: 'Manoeuvre',
    text: "Échangez un suivant d'une région avec un suivant de n'importe quelle autre région. S'il existe au moins un échange possible, vous devez le faire.",
  },
  outmanoeuvre: {
    fr: 'Contre-manœuvre',
    en: 'Outmanoeuvre',
    text: "Échangez un suivant d'une région avec deux suivants d'une région adjacente. Si un échange complet est possible quelque part, vous devez le faire ; sinon échangez un suivant contre un seul suivant d'une région adjacente.",
  },
};

/** La donne de départ : huit cartes par joueur. */
export const STARTING_HAND = [
  'scottish_support',
  'welsh_support',
  'english_support',
  'negotiate',
  'manoeuvre',
  'outmanoeuvre',
  'assemble',
  'assemble',
];

/* ------------------------------------------------------------------ */
/* Utilitaires                                                          */
/* ------------------------------------------------------------------ */

/** Générateur pseudo-aléatoire déterministe (mulberry32) : parties rejouables. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function emptyFollowers() {
  return { scottish: 0, welsh: 0, english: 0 };
}

export function totalFollowers(f) {
  return f.scottish + f.welsh + f.english;
}

/** Une région « gelée » porte un disque : on ne peut ni y placer ni y déplacer de suivant. */
export function isFrozen(state, regionId) {
  return state.regions[regionId].disc !== null;
}

export function openRegions(state) {
  return REGION_IDS.filter((r) => !isFrozen(state, r));
}

/* ------------------------------------------------------------------ */
/* Mise en place                                                        */
/* ------------------------------------------------------------------ */

/**
 * @param {Array<{id:string,name:string}>} playerDefs  dans l'ordre des sièges (0..3, sens horaire)
 * @param {number} seed
 * @param {{teams?: boolean}} opts  teams : à 4 joueurs, jeu en équipes de deux
 *   (règle officielle, par défaut) ou chacun pour soi (variante).
 */
export function createGame(playerDefs, seed = 12345, opts = {}) {
  const rng = makeRng(seed);
  const n = playerDefs.length;
  if (n !== 2 && n !== 3 && n !== 4) throw new Error('2 à 4 joueurs.');
  const teams = n === 4 && opts.teams !== false;

  const state = {
    seed,
    playerCount: n,
    teams,
    phase: 'action', // 'action' | 'summon' | 'finished'
    regions: {},
    supply: emptyFollowers(),
    instability: 0,
    track: [], // [{ regionId, faceDown, negotiation }] index 0 = espace « 1 »
    players: [],
    current: 0,
    consecutivePasses: 0,
    lastActionSeat: null,          // départage Invasion
    lastPlayedIndex: playerDefs.map(() => -1), // n° de la dernière action de chaque siège
    factionWinOrder: [],           // ordre des victoires en lutte de pouvoir
    handEmptyOrder: [],            // sièges, dans l'ordre où ils ont vidé leur main
    lastSwap: null,                // anti « annulation » de Manœuvre / Contre-manœuvre
    actionCounter: 0,
    struggleCount: 0,
    pendingSummonSeat: null,
    ending: null,                  // 'invasion' | 'coronation'
    result: null,
    log: [],
  };

  for (const r of REGION_IDS) {
    state.regions[r] = { followers: emptyFollowers(), disc: null };
  }

  // --- Le sac de suivants -------------------------------------------------
  // 18 par faction ; à deux joueurs on retire d'abord deux suivants par faction.
  const perFaction = n === 2 ? 16 : 18;
  const bag = [];
  for (const f of FACTIONS) for (let i = 0; i < perFaction; i++) bag.push(f);

  // Régions d'origine : deux suivants de la faction correspondante.
  const takeFromBag = (faction) => {
    const i = bag.indexOf(faction);
    if (i === -1) return null;
    bag.splice(i, 1);
    return faction;
  };
  for (const f of FACTIONS) {
    for (let i = 0; i < 2; i++) {
      takeFromBag(f);
      state.regions[HOME_REGION[f]].followers[f] += 1;
    }
  }

  // Le reste part au sac, mélangé.
  let pool = shuffle(bag, rng);
  let cursor = 0;
  const draw = () => pool[cursor++];

  // Deux suivants tirés au hasard pour la cour de chaque joueur.
  playerDefs.forEach((p, seat) => {
    const court = emptyFollowers();
    court[draw()] += 1;
    court[draw()] += 1;
    state.players.push({
      id: p.id,
      name: p.name,
      seat,
      team: teams ? seat % 2 : seat, // en équipes, les joueurs opposés (0/2 et 1/3) sont coéquipiers
      hand: STARTING_HAND.slice(),
      discard: [],
      court,
      negotiationDisc: true,
      passed: false,
    });
  });

  // Compléter chaque région à quatre suivants.
  for (const r of REGION_IDS) {
    while (totalFollowers(state.regions[r].followers) < 4) {
      state.regions[r].followers[draw()] += 1;
    }
  }

  // Le reste constitue la réserve.
  while (cursor < pool.length) state.supply[draw()] += 1;

  // --- Cartes région ------------------------------------------------------
  const order = shuffle(REGION_IDS, rng);
  state.track = order.map((regionId) => ({ regionId, faceDown: false, negotiation: false }));

  state.current = Math.floor(rng() * n);
  pushLog(state, `La partie commence. ${state.players[state.current].name} est premier joueur.`);
  return state;
}

function pushLog(state, text, kind = 'info') {
  state.log.push({ n: state.log.length, text, kind });
}

/* ------------------------------------------------------------------ */
/* Cibles légales — utilisées par le moteur ET par l'interface           */
/* ------------------------------------------------------------------ */

/** Régions où une carte Soutien peut placer ses suivants. */
export function supportTargets(state, faction) {
  const home = HOME_REGION[faction];
  const homeOpen = state.regions[home].disc === null;
  return openRegions(state).filter((r) => {
    const bordersControlled = ADJACENCY[r].some((nb) => state.regions[nb].disc === faction);
    const bordersHome = homeOpen && ADJACENCY[r].includes(home);
    return bordersControlled || bordersHome;
  });
}

/** Toutes les paires (régionA, factionA, régionB, factionB) échangeables par Manœuvre. */
export function manoeuvreOptions(state) {
  const open = openRegions(state);
  const out = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = 0; j < open.length; j++) {
      if (i === j) continue;
      const a = open[i], b = open[j];
      if (a > b) continue; // paire non ordonnée
      for (const fa of FACTIONS) {
        if (state.regions[a].followers[fa] < 1) continue;
        for (const fb of FACTIONS) {
          if (state.regions[b].followers[fb] < 1) continue;
          if (isUndoOfLastSwap(state, { kind: 'manoeuvre', a, fa: [fa], b, fb: [fb] })) continue;
          out.push({ a, fa, b, fb });
        }
      }
    }
  }
  return out;
}

/**
 * Options de Contre-manœuvre.
 * `full` : 1 suivant de A contre 2 suivants d'une région B adjacente.
 * `partial` : 1 contre 1, uniquement si aucun échange complet n'est possible.
 */
export function outmanoeuvreOptions(state) {
  const open = new Set(openRegions(state));
  const full = [];
  const partial = [];
  for (const a of open) {
    for (const b of ADJACENCY[a]) {
      if (!open.has(b)) continue;
      for (const fa of FACTIONS) {
        if (state.regions[a].followers[fa] < 1) continue;
        // deux suivants de B : combinaisons avec répétition
        for (let i = 0; i < FACTIONS.length; i++) {
          for (let j = i; j < FACTIONS.length; j++) {
            const f1 = FACTIONS[i], f2 = FACTIONS[j];
            const need = f1 === f2 ? 2 : 1;
            if (state.regions[b].followers[f1] < need) continue;
            if (state.regions[b].followers[f2] < (f1 === f2 ? 2 : 1)) continue;
            const move = { kind: 'outmanoeuvre', a, fa: [fa], b, fb: [f1, f2] };
            if (isUndoOfLastSwap(state, move)) continue;
            full.push({ a, fa, b, fb: [f1, f2] });
          }
        }
        for (const fb of FACTIONS) {
          if (state.regions[b].followers[fb] < 1) continue;
          const move = { kind: 'outmanoeuvre', a, fa: [fa], b, fb: [fb] };
          if (isUndoOfLastSwap(state, move)) continue;
          partial.push({ a, fa, b, fb: [fb] });
        }
      }
    }
  }
  return { full, partial };
}

/** Cartes région échangeables par Négociation : face visible et sans disque. */
export function negotiableIndices(state) {
  const out = [];
  state.track.forEach((t, i) => {
    if (!t.faceDown && !t.negotiation) out.push(i);
  });
  return out;
}

/** Régions d'où l'on peut invoquer un suivant (jamais depuis la réserve). */
export function summonSources(state) {
  const out = [];
  for (const r of REGION_IDS) {
    if (isFrozen(state, r)) continue;
    for (const f of FACTIONS) {
      if (state.regions[r].followers[f] > 0) out.push({ region: r, faction: f });
    }
  }
  return out;
}

/* --- anti-annulation ------------------------------------------------ */

function sortedKey(move) {
  // Représente un échange par les deux « paquets » déplacés, indépendamment du sens.
  const side1 = `${move.a}:${move.fa.slice().sort().join(',')}`;
  const side2 = `${move.b}:${move.fb.slice().sort().join(',')}`;
  return [side1, side2].sort().join('|');
}

/**
 * « Vous ne pouvez pas utiliser une Manœuvre pour annuler la Manœuvre d'un autre
 * joueur, sauf si au moins une autre action a été prise depuis. »
 * Annuler = refaire exactement le même échange en sens inverse.
 */
function isUndoOfLastSwap(state, move) {
  const last = state.lastSwap;
  if (!last) return false;
  if (last.kind !== move.kind) return false;
  if (state.actionCounter > last.actionIndex + 1) return false; // une autre action depuis
  // Le même joueur a le droit de défaire son propre échange.
  if (last.seat === state.current) return false;
  // Annuler = remettre chaque paquet dans sa région d'origine.
  const undo = { a: last.a, fa: last.fb, b: last.b, fb: last.fa };
  return sortedKey(undo) === sortedKey(move);
}

/* ------------------------------------------------------------------ */
/* Coups légaux                                                         */
/* ------------------------------------------------------------------ */

/** Une carte est-elle jouable ? (Elle l'est toujours : une action sans effet reste une action.) */
export function playableCards(state, seat) {
  return state.players[seat].hand.slice();
}

/**
 * Décrit ce que l'interface doit demander au joueur pour une carte donnée,
 * et énumère les choix légaux.
 */
export function cardChoices(state, cardId) {
  switch (cardId) {
    case 'scottish_support':
    case 'welsh_support':
    case 'english_support': {
      const faction = CARDS[cardId].faction;
      const targets = supportTargets(state, faction);
      const count = Math.min(2, state.supply[faction]);
      return { type: 'support', faction, targets, count };
    }
    case 'assemble': {
      const targets = openRegions(state);
      const factions = FACTIONS.filter((f) => state.supply[f] > 0);
      return { type: 'assemble', targets, factions };
    }
    case 'negotiate': {
      return { type: 'negotiate', indices: negotiableIndices(state) };
    }
    case 'manoeuvre': {
      return { type: 'manoeuvre', options: manoeuvreOptions(state) };
    }
    case 'outmanoeuvre': {
      const { full, partial } = outmanoeuvreOptions(state);
      return { type: 'outmanoeuvre', options: full.length ? full : partial, mustBeFull: full.length > 0 };
    }
    default:
      throw new Error('Carte inconnue : ' + cardId);
  }
}

/* ------------------------------------------------------------------ */
/* Application des coups                                                */
/* ------------------------------------------------------------------ */

export function applyMove(state, seat, move) {
  if (state.phase === 'finished') throw new Error('La partie est terminée.');
  if (seat !== state.current) throw new Error("Ce n'est pas votre tour.");

  if (state.phase === 'summon') {
    if (move.type !== 'summon') throw new Error('Vous devez invoquer un suivant à votre cour.');
    return doSummon(state, seat, move);
  }

  if (move.type === 'pass') return doPass(state, seat);
  if (move.type === 'play') return doPlay(state, seat, move);
  throw new Error('Coup inconnu : ' + move.type);
}

function doPass(state, seat) {
  const p = state.players[seat];
  pushLog(state, `${p.name} passe.`, 'pass');
  state.consecutivePasses += 1;
  if (state.consecutivePasses >= state.playerCount) {
    state.consecutivePasses = 0;
    resolvePowerStruggle(state);
    if (state.phase === 'finished') return state;
  }
  advanceTurn(state);
  return state;
}

function doPlay(state, seat, move) {
  const p = state.players[seat];
  const idx = p.hand.indexOf(move.card);
  if (idx === -1) throw new Error("Vous n'avez pas cette carte en main.");
  const card = move.card;

  // Résolution de l'effet — lève une exception si le coup est illégal.
  const description = resolveCard(state, seat, card, move.params || {});

  p.hand.splice(idx, 1);
  p.discard.push(card);
  if (p.hand.length === 0 && !state.handEmptyOrder.includes(seat)) state.handEmptyOrder.push(seat);

  state.consecutivePasses = 0;
  state.lastActionSeat = seat;
  state.actionCounter += 1;
  state.lastPlayedIndex[seat] = state.actionCounter;
  pushLog(state, `${p.name} joue ${CARDS[card].fr}. ${description}`, 'action');

  // Invocation obligatoire d'un suivant à la cour.
  const sources = summonSources(state);
  if (sources.length === 0) {
    pushLog(state, `Aucun suivant disponible : ${p.name} n'invoque personne.`);
    advanceTurn(state);
  } else {
    state.phase = 'summon';
    state.pendingSummonSeat = seat;
  }
  return state;
}

function doSummon(state, seat, move) {
  const { region, faction } = move;
  if (!REGION_IDS.includes(region)) throw new Error('Région inconnue.');
  if (isFrozen(state, region)) throw new Error("On ne peut pas invoquer depuis une région déjà attribuée.");
  if (state.regions[region].followers[faction] < 1) throw new Error("Pas de suivant de cette faction dans cette région.");

  state.regions[region].followers[faction] -= 1;
  const p = state.players[seat];
  p.court[faction] += 1;
  pushLog(state, `${p.name} invoque un suivant ${FACTION_INFO[faction].fr.toLowerCase()} de ${REGIONS[region].fr} à sa cour.`, 'summon');

  state.phase = 'action';
  state.pendingSummonSeat = null;
  advanceTurn(state);
  return state;
}

function advanceTurn(state) {
  if (state.phase === 'finished') return;
  state.current = (state.current + 1) % state.playerCount;
}

/* --- effets des cartes ---------------------------------------------- */

function resolveCard(state, seat, card, params) {
  switch (card) {
    case 'scottish_support':
    case 'welsh_support':
    case 'english_support':
      return resolveSupport(state, CARDS[card].faction, params);
    case 'assemble':
      return resolveAssemble(state, params);
    case 'negotiate':
      return resolveNegotiate(state, seat, params);
    case 'manoeuvre':
      return resolveManoeuvre(state, seat, params);
    case 'outmanoeuvre':
      return resolveOutmanoeuvre(state, seat, params);
    default:
      throw new Error('Carte inconnue.');
  }
}

function resolveSupport(state, faction, params) {
  const available = Math.min(2, state.supply[faction]);
  const targets = supportTargets(state, faction);
  if (available === 0 || targets.length === 0) {
    return 'Aucun placement possible : action sans effet.';
  }
  const r = params.region;
  if (!targets.includes(r)) throw new Error('Région cible non autorisée pour cette carte Soutien.');
  state.supply[faction] -= available;
  state.regions[r].followers[faction] += available;
  return `${available} suivant${available > 1 ? 's' : ''} ${FACTION_INFO[faction].adj}${available > 1 ? 's' : ''} placé${available > 1 ? 's' : ''} en ${REGIONS[r].fr}.`;
}

function resolveAssemble(state, params) {
  const open = openRegions(state);
  const placements = params.placements || {}; // { scottish: regionId, ... }
  const done = [];
  for (const f of FACTIONS) {
    if (state.supply[f] <= 0) continue;
    if (open.length === 0) continue;
    const r = placements[f];
    if (!open.includes(r)) throw new Error(`Région invalide pour le suivant ${FACTION_INFO[f].fr.toLowerCase()}.`);
    state.supply[f] -= 1;
    state.regions[r].followers[f] += 1;
    done.push(`${FACTION_INFO[f].fr.toLowerCase()} → ${REGIONS[r].fr}`);
  }
  return done.length ? `Rassemblement : ${done.join(', ')}.` : 'Réserve vide : action sans effet.';
}

function resolveNegotiate(state, seat, params) {
  const eligible = negotiableIndices(state);
  if (eligible.length < 2) return 'Moins de deux cartes région éligibles : action sans effet.';
  const { i, j, discOn } = params;
  if (!eligible.includes(i) || !eligible.includes(j) || i === j) {
    throw new Error('Cartes région non échangeables.');
  }
  const p = state.players[seat];
  if (!p.negotiationDisc) throw new Error('Vous n\'avez plus de disque de négociation.');
  const tmp = state.track[i].regionId;
  state.track[i].regionId = state.track[j].regionId;
  state.track[j].regionId = tmp;
  const target = discOn;
  if (target !== i && target !== j) throw new Error('Le disque doit aller sur une des deux cartes échangées.');
  state.track[target].negotiation = true;
  p.negotiationDisc = false;
  return `Cartes des espaces ${i + 1} et ${j + 1} échangées ; disque de négociation sur l'espace ${target + 1} (${REGIONS[state.track[target].regionId].fr}).`;
}

function resolveManoeuvre(state, seat, params) {
  const options = manoeuvreOptions(state);
  if (options.length === 0) return 'Aucun échange possible : action sans effet.';
  const { a, fa, b, fb } = params;
  const ok = options.some((o) =>
    (o.a === a && o.fa === fa && o.b === b && o.fb === fb) ||
    (o.a === b && o.fa === fb && o.b === a && o.fb === fa));
  if (!ok) throw new Error('Échange non autorisé.');
  state.regions[a].followers[fa] -= 1;
  state.regions[b].followers[fb] -= 1;
  state.regions[a].followers[fb] += 1;
  state.regions[b].followers[fa] += 1;
  state.lastSwap = { kind: 'manoeuvre', a, fa: [fa], b, fb: [fb], seat, actionIndex: state.actionCounter };
  return `${FACTION_INFO[fa].fr} de ${REGIONS[a].fr} ↔ ${FACTION_INFO[fb].fr} de ${REGIONS[b].fr}.`;
}

function resolveOutmanoeuvre(state, seat, params) {
  const { full, partial } = outmanoeuvreOptions(state);
  const pool = full.length ? full : partial;
  if (pool.length === 0) return 'Aucun échange possible : action sans effet.';
  const { a, fa, b, fb } = params; // fa : string ; fb : tableau de 1 ou 2 factions
  const fbArr = Array.isArray(fb) ? fb : [fb];
  const key = `${a}|${fa}|${b}|${fbArr.slice().sort().join(',')}`;
  const ok = pool.some((o) => `${o.a}|${o.fa}|${o.b}|${o.fb.slice().sort().join(',')}` === key);
  if (!ok) throw new Error('Échange non autorisé (un échange complet est peut-être obligatoire).');
  state.regions[a].followers[fa] -= 1;
  state.regions[b].followers[fa] += 1;
  for (const f of fbArr) {
    state.regions[b].followers[f] -= 1;
    state.regions[a].followers[f] += 1;
  }
  state.lastSwap = { kind: 'outmanoeuvre', a, fa: [fa], b, fb: fbArr, seat, actionIndex: state.actionCounter };
  const names = fbArr.map((f) => FACTION_INFO[f].fr).join(' + ');
  return `${FACTION_INFO[fa].fr} de ${REGIONS[a].fr} ↔ ${names} de ${REGIONS[b].fr}.`;
}

/* ------------------------------------------------------------------ */
/* Luttes de pouvoir                                                    */
/* ------------------------------------------------------------------ */

export function contestedIndex(state) {
  return state.track.findIndex((t) => !t.faceDown);
}

function resolvePowerStruggle(state) {
  const idx = contestedIndex(state);
  if (idx === -1) return;
  const entry = state.track[idx];
  const region = state.regions[entry.regionId];
  const f = region.followers;

  const max = Math.max(f.scottish, f.welsh, f.english);
  const leaders = FACTIONS.filter((x) => f[x] === max);

  if (max > 0 && leaders.length === 1) {
    const winner = leaders[0];
    region.disc = winner;
    state.factionWinOrder.push(winner);
    pushLog(state, `⚔ Lutte de pouvoir en ${REGIONS[entry.regionId].fr} : les ${FACTION_INFO[winner].fr} l'emportent (${max} suivants) et prennent le contrôle.`, 'struggle');
  } else {
    region.disc = 'unstable';
    state.instability += 1;
    pushLog(state, `⚔ Lutte de pouvoir en ${REGIONS[entry.regionId].fr} : égalité — la région devient instable (${state.instability}/3).`, 'struggle');
  }

  // Tous les suivants de la région retournent à la réserve.
  for (const x of FACTIONS) {
    state.supply[x] += region.followers[x];
    region.followers[x] = 0;
  }
  entry.faceDown = true;
  state.struggleCount += 1;

  if (state.instability >= 3) {
    endGame(state, 'invasion');
    return;
  }
  if (state.track.every((t) => t.faceDown)) {
    endGame(state, 'coronation');
  }
}

/* ------------------------------------------------------------------ */
/* Fin de partie                                                        */
/* ------------------------------------------------------------------ */

function teamsOf(state) {
  const map = new Map();
  for (const p of state.players) {
    if (!map.has(p.team)) map.set(p.team, []);
    map.get(p.team).push(p);
  }
  return map;
}

/** Classement des factions, de la plus puissante à la moins puissante. */
export function factionRanking(state) {
  const controlled = { scottish: 0, welsh: 0, english: 0 };
  for (const r of REGION_IDS) {
    const d = state.regions[r].disc;
    if (d && d !== 'unstable') controlled[d] += 1;
  }
  const lastWin = {};
  FACTIONS.forEach((f) => { lastWin[f] = state.factionWinOrder.lastIndexOf(f); });
  const ranked = FACTIONS.slice().sort((x, y) => {
    if (controlled[y] !== controlled[x]) return controlled[y] - controlled[x];
    return lastWin[y] - lastWin[x]; // la dernière à avoir gagné une lutte est plus puissante
  });
  return { ranked, controlled };
}

function endGame(state, kind) {
  state.phase = 'finished';
  state.ending = kind;
  state.result = kind === 'invasion' ? scoreInvasion(state) : scoreCoronation(state);
  state.result.kind = kind;
  pushLog(state, kind === 'invasion'
    ? '🇫🇷 Trois régions instables : les Français envahissent la Bretagne !'
    : '👑 Les huit régions sont attribuées : place au couronnement !', 'end');
  pushLog(state, state.result.summary, 'end');
}

function scoreInvasion(state) {
  const map = teamsOf(state);
  const rows = [];
  for (const [team, members] of map) {
    const combined = emptyFollowers();
    for (const p of members) for (const f of FACTIONS) combined[f] += p.court[f];
    rows.push({
      team,
      members: members.map((p) => p.name),
      seats: members.map((p) => p.seat),
      combined,
      sets: Math.min(combined.scottish, combined.welsh, combined.english),
    });
  }
  const best = Math.max(...rows.map((r) => r.sets));
  let winners = rows.filter((r) => r.sets === best);

  let tiebreak = null;
  if (winners.length > 1) {
    // Départage : parmi les ex æquo, celui (ou l'équipe) qui a joué une carte
    // action le plus récemment.
    const recency = (r) => Math.max(...r.seats.map((s) => state.lastPlayedIndex[s]));
    const best2 = Math.max(...winners.map(recency));
    const w = winners.filter((r) => recency(r) === best2);
    if (w.length < winners.length) tiebreak = 'dernière carte action jouée';
    winners = w;
  }
  const summary = `Invasion — ${winners.map((w) => w.members.join(' & ')).join(' / ')} l'emporte${winners.length > 1 ? 'nt' : ''} avec ${best} ensemble${best > 1 ? 's' : ''} complet${best > 1 ? 's' : ''}${tiebreak ? ` (départage : ${tiebreak})` : ''}.`;
  return { rows, winners: winners.map((w) => w.seats).flat(), summary, tiebreak };
}

function scoreCoronation(state) {
  const { ranked, controlled } = factionRanking(state);
  const [first, second] = ranked;

  const rows = state.players.map((p) => ({
    seat: p.seat, name: p.name, team: p.team, court: { ...p.court },
    first: p.court[first], second: p.court[second],
  }));

  const bestFirst = Math.max(...rows.map((r) => r.first));
  let contenders = rows.filter((r) => r.first === bestFirst);
  let tiebreak = null;

  if (contenders.length > 1) {
    const bestSecond = Math.max(...contenders.map((r) => r.second));
    const next = contenders.filter((r) => r.second === bestSecond);
    if (next.length < contenders.length) tiebreak = 'suivants de la deuxième faction';
    contenders = next;
  }
  if (contenders.length > 1) {
    // Départage final : l'équipe (ou le joueur) ayant vidé sa main en premier.
    for (const seat of state.handEmptyOrder) {
      const c = contenders.filter((r) => (state.teams ? r.team === state.players[seat].team : r.seat === seat));
      if (c.length) { contenders = [c[0]]; tiebreak = 'main vidée en premier'; break; }
    }
  }

  const champion = contenders[0];
  let winnerSeats = [champion.seat];
  if (state.teams) winnerSeats = rows.filter((r) => r.team === champion.team).map((r) => r.seat);
  const winnerNames = winnerSeats.map((s) => state.players[s].name);

  const summary = `Couronnement — faction la plus puissante : ${FACTION_INFO[first].fr} (${controlled[first]} région${controlled[first] > 1 ? 's' : ''}). ${winnerNames.join(' & ')} l'emporte${winnerNames.length > 1 ? 'nt' : ''} avec ${champion.first} suivant${champion.first > 1 ? 's' : ''} ${FACTION_INFO[first].adj}${champion.first > 1 ? 's' : ''} à la cour${tiebreak ? ` (départage : ${tiebreak})` : ''}.`;
  return { rows, ranked, controlled, winners: winnerSeats, summary, tiebreak };
}

/* ------------------------------------------------------------------ */
/* Vue filtrée par joueur (les mains restent secrètes)                  */
/* ------------------------------------------------------------------ */

export function viewFor(state, seat) {
  const v = JSON.parse(JSON.stringify(state));
  v.you = seat;
  v.players = v.players.map((p) => {
    if (p.seat === seat) return p;
    // Main secrète, et seule la dernière carte de la défausse est visible.
    return {
      ...p,
      hand: p.hand.length,
      handHidden: true,
      discardCount: p.discard.length,
      discard: p.discard.length ? [p.discard[p.discard.length - 1]] : [],
    };
  });
  if (v.phase !== 'finished') {
    // Le classement final n'est calculable qu'à la fin.
    v.result = null;
  }
  return v;
}
