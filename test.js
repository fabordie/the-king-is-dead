/*
 * Tests du moteur de règles. Lancer avec : node test.js
 */
import {
  createGame, applyMove, cardChoices, summonSources, FACTIONS, REGION_IDS,
  ADJACENCY, REGIONS, totalFollowers, supportTargets, manoeuvreOptions,
  outmanoeuvreOptions, negotiableIndices, contestedIndex, factionRanking, viewFor,
} from './public/game.js';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + label); } };
const section = (t) => console.log('\n— ' + t);

const PLAYERS = [
  { id: 'a', name: 'Alice' }, { id: 'b', name: 'Bruno' },
  { id: 'c', name: 'Chloé' }, { id: 'd', name: 'David' },
];

/* ---------------------------------------------------------------- */
section('Adjacences');
{
  let symmetric = true, selfRef = false;
  for (const r of REGION_IDS) {
    for (const n of ADJACENCY[r]) {
      if (!ADJACENCY[n] || !ADJACENCY[n].includes(r)) symmetric = false;
      if (n === r) selfRef = true;
    }
  }
  ok(symmetric, 'les adjacences sont symétriques');
  ok(!selfRef, 'aucune région adjacente à elle-même');
  ok(Object.keys(ADJACENCY).length === 8, 'huit régions');
}

/* ---------------------------------------------------------------- */
section('Mise en place (4 joueurs)');
for (let seed = 1; seed <= 200; seed++) {
  const s = createGame(PLAYERS, seed);
  const counts = { scottish: 0, welsh: 0, english: 0 };
  for (const r of REGION_IDS) for (const f of FACTIONS) counts[f] += s.regions[r].followers[f];
  for (const p of s.players) for (const f of FACTIONS) counts[f] += p.court[f];
  for (const f of FACTIONS) counts[f] += s.supply[f];

  if (seed === 1) {
    ok(FACTIONS.every((f) => counts[f] === 18), '18 suivants de chaque faction au total');
    ok(REGION_IDS.every((r) => totalFollowers(s.regions[r].followers) === 4), '4 suivants par région');
    ok(s.players.every((p) => totalFollowers(p.court) === 2), '2 suivants dans chaque cour');
    ok(totalFollowers(s.supply) === 14, `14 suivants en réserve (obtenu ${totalFollowers(s.supply)})`);
    ok(s.regions.moray.followers.scottish >= 2, 'Moray a au moins 2 Écossais');
    ok(s.regions.gwynedd.followers.welsh >= 2, 'Gwynedd a au moins 2 Gallois');
    ok(s.regions.essex.followers.english >= 2, 'Essex a au moins 2 Anglais');
    ok(s.players.every((p) => p.hand.length === 8), '8 cartes par joueur');
    ok(s.players.every((p) => p.hand.filter((c) => c === 'assemble').length === 2), '2 Rassemblements par joueur');
    ok(s.track.length === 8 && new Set(s.track.map((t) => t.regionId)).size === 8, '8 cartes région distinctes');
    ok(s.players[0].team === s.players[2].team && s.players[1].team === s.players[3].team, 'équipes = joueurs opposés');
    ok(s.players[0].team !== s.players[1].team, 'voisins dans des équipes différentes');
  }
  if (!FACTIONS.every((f) => counts[f] === 18)) { fail++; console.error(`  ✗ conservation des cubes (seed ${seed})`); break; }
  if (!REGION_IDS.every((r) => totalFollowers(s.regions[r].followers) === 4)) { fail++; console.error(`  ✗ 4/région (seed ${seed})`); break; }
}
ok(true, '200 mises en place vérifiées (conservation des cubes, 4 par région)');

/* ---------------------------------------------------------------- */
section('Cartes Soutien');
{
  const s = createGame(PLAYERS, 7);
  const t = supportTargets(s, 'scottish');
  ok(t.length === ADJACENCY.moray.length, 'au départ, seules les régions bordant Moray sont ciblables par le Soutien écossais');
  ok(t.includes('strathclyde'), 'Strathclyde est ciblable');
  ok(!t.includes('moray'), "Moray elle-même n'est pas ciblable (elle ne borde aucune région écossaise)");

  // Une région gelée n'est plus ciblable.
  s.regions.strathclyde.disc = 'scottish';
  const t2 = supportTargets(s, 'scottish');
  ok(!t2.includes('strathclyde'), 'une région sous contrôle ne peut plus recevoir de suivants');
  ok(t2.includes('moray'), 'Moray devient ciblable car elle borde une région écossaise');
  ok(t2.includes('lancaster') && t2.includes('northumbria'), 'les voisines de Strathclyde deviennent ciblables');

  // Un disque à Moray coupe la clause « bordant Moray ».
  const s2 = createGame(PLAYERS, 7);
  s2.regions.moray.disc = 'unstable';
  ok(supportTargets(s2, 'scottish').length === 0, "un disque d'instabilité à Moray annule la clause de repli");
}
{
  // Réserve partielle : on place autant de suivants que possible.
  const s = createGame(PLAYERS, 7);
  s.supply.scottish = 1;
  const before = s.regions.strathclyde.followers.scottish;
  applyMove(s, s.current, { type: 'play', card: 'scottish_support', params: { region: 'strathclyde' } });
  ok(s.regions.strathclyde.followers.scottish === before + 1, 'action partielle : un seul suivant placé si la réserve est à 1');
  ok(s.supply.scottish === 0, 'la réserve est vidée');
  ok(s.phase === 'summon', "l'invocation à la cour est obligatoire après l'action");
}

/* ---------------------------------------------------------------- */
section('Invocation à la cour');
{
  const s = createGame(PLAYERS, 11);
  const seat = s.current;
  applyMove(s, seat, { type: 'play', card: 'assemble', params: { placements: { scottish: 'devon', welsh: 'devon', english: 'devon' } } });
  ok(s.phase === 'summon', 'phase invocation');
  let threw = false;
  try { applyMove(s, seat, { type: 'pass' }); } catch (e) { threw = true; }
  ok(threw, 'impossible de passer pendant la phase invocation');
  const src = summonSources(s)[0];
  const beforeCourt = s.players[seat].court[src.faction];
  const beforeRegion = s.regions[src.region].followers[src.faction];
  applyMove(s, seat, { type: 'summon', region: src.region, faction: src.faction });
  ok(s.players[seat].court[src.faction] === beforeCourt + 1, 'le suivant rejoint la cour');
  ok(s.regions[src.region].followers[src.faction] === beforeRegion - 1, 'le suivant quitte la région');
  ok(s.current === (seat + 1) % 4, 'le tour passe au joueur suivant');
  ok(s.players[seat].hand.length === 7 && s.players[seat].discard.length === 1, 'carte défaussée');
  // On ne peut pas invoquer depuis la réserve : summonSources ne renvoie que des régions.
  ok(summonSources(s).every((x) => REGION_IDS.includes(x.region)), 'les sources sont toujours des régions');
}

/* ---------------------------------------------------------------- */
section('Rassemblement');
{
  const s = createGame(PLAYERS, 13);
  const seat = s.current;
  const sup = { ...s.supply };
  applyMove(s, seat, { type: 'play', card: 'assemble', params: { placements: { scottish: 'devon', welsh: 'essex', english: 'warwick' } } });
  ok(s.regions.devon.followers.scottish > 0 && s.regions.essex.followers.welsh > 0, 'placements dans des régions différentes');
  ok(s.supply.scottish === sup.scottish - 1 && s.supply.welsh === sup.welsh - 1 && s.supply.english === sup.english - 1, 'un suivant de chaque faction retiré de la réserve');

  const s2 = createGame(PLAYERS, 13);
  s2.supply.welsh = 0;
  const seat2 = s2.current;
  applyMove(s2, seat2, { type: 'play', card: 'assemble', params: { placements: { scottish: 'devon', english: 'devon' } } });
  ok(s2.regions.devon.followers.scottish >= 1, 'faction absente de la réserve : les autres sont tout de même placées');
}

/* ---------------------------------------------------------------- */
section('Négociation');
{
  const s = createGame(PLAYERS, 17);
  const seat = s.current;
  const a = s.track[0].regionId, b = s.track[3].regionId;
  applyMove(s, seat, { type: 'play', card: 'negotiate', params: { i: 0, j: 3, discOn: 0 } });
  ok(s.track[0].regionId === b && s.track[3].regionId === a, 'les deux cartes région sont échangées');
  ok(s.track[0].negotiation === true, 'disque de négociation posé');
  ok(s.players[seat].negotiationDisc === false, 'le joueur a dépensé son disque');
  ok(!negotiableIndices(s).includes(0), 'une carte avec disque n\'est plus échangeable');

  // Cartes face cachée : non échangeables.
  s.track[5].faceDown = true;
  ok(!negotiableIndices(s).includes(5), 'une carte face cachée n\'est plus échangeable');
}

/* ---------------------------------------------------------------- */
section('Manœuvre et anti-annulation');
{
  const s = createGame(PLAYERS, 23);
  const seat = s.current;
  const opts = manoeuvreOptions(s);
  ok(opts.length > 0, 'des échanges sont possibles au départ');
  const o = opts.find((x) => x.fa !== x.fb);
  const beforeA = s.regions[o.a].followers[o.fa], beforeB = s.regions[o.b].followers[o.fb];
  applyMove(s, seat, { type: 'play', card: 'manoeuvre', params: o });
  ok(s.regions[o.a].followers[o.fa] === beforeA - 1 && s.regions[o.b].followers[o.fb] === beforeB - 1, 'les deux suivants ont quitté leur région');
  ok(s.regions[o.a].followers[o.fb] > 0 && s.regions[o.b].followers[o.fa] > 0, 'les suivants ont bien été intervertis');

  const src = summonSources(s)[0];
  applyMove(s, seat, { type: 'summon', region: src.region, faction: src.faction });

  // Le joueur suivant ne peut pas défaire l'échange.
  const next = s.current;
  const undoMove = { a: o.a, fa: o.fb, b: o.b, fb: o.fa };
  const allowed = manoeuvreOptions(s);
  const canUndo = allowed.some((x) =>
    (x.a === undoMove.a && x.fa === undoMove.fa && x.b === undoMove.b && x.fb === undoMove.fb) ||
    (x.a === undoMove.b && x.fa === undoMove.fb && x.b === undoMove.a && x.fb === undoMove.fa));
  ok(!canUndo, "le joueur suivant ne peut pas annuler la Manœuvre précédente");
  let threw = false;
  try { applyMove(s, next, { type: 'play', card: 'manoeuvre', params: undoMove }); } catch (e) { threw = true; }
  ok(threw, "l'annulation est rejetée par le moteur");

  // Après une autre action, l'annulation redevient légale.
  applyMove(s, next, { type: 'play', card: 'assemble', params: { placements: { scottish: 'devon', welsh: 'devon', english: 'devon' } } });
  const src2 = summonSources(s)[0];
  applyMove(s, next, { type: 'summon', region: src2.region, faction: src2.faction });
  const later = manoeuvreOptions(s);
  const canUndoNow = later.some((x) =>
    (x.a === undoMove.a && x.fa === undoMove.fa && x.b === undoMove.b && x.fb === undoMove.fb) ||
    (x.a === undoMove.b && x.fa === undoMove.fb && x.b === undoMove.a && x.fb === undoMove.fa));
  ok(canUndoNow, "après une action intercalée, l'annulation redevient permise");
}

/* ---------------------------------------------------------------- */
section('Contre-manœuvre');
{
  const s = createGame(PLAYERS, 29);
  const { full, partial } = outmanoeuvreOptions(s);
  ok(full.length > 0, 'des échanges complets (1 contre 2) sont possibles au départ');
  ok(full.every((o) => ADJACENCY[o.a].includes(o.b)), 'les régions échangées sont toujours adjacentes');
  ok(full.every((o) => o.fb.length === 2), 'un échange complet met bien deux suivants en jeu');
  ok(partial.every((o) => o.fb.length === 1), 'un échange partiel n\'en met qu\'un');

  const choices = cardChoices(s, 'outmanoeuvre');
  ok(choices.mustBeFull === true, "l'échange complet est obligatoire quand il est possible");
  let threw = false;
  const p = partial.find((o) => !full.some((f) => f.a === o.a && f.b === o.b && f.fa === o.fa));
  try { applyMove(s, s.current, { type: 'play', card: 'outmanoeuvre', params: partial[0] }); } catch (e) { threw = true; }
  ok(threw, "un échange 1 contre 1 est refusé tant qu'un échange complet existe");

  const o = full[0];
  const totA = totalFollowers(s.regions[o.a].followers), totB = totalFollowers(s.regions[o.b].followers);
  applyMove(s, s.current, { type: 'play', card: 'outmanoeuvre', params: o });
  ok(totalFollowers(s.regions[o.a].followers) === totA + 1, 'la région de départ gagne un suivant net');
  ok(totalFollowers(s.regions[o.b].followers) === totB - 1, 'la région adjacente en perd un');
}

/* ---------------------------------------------------------------- */
section('Régions gelées');
{
  const s = createGame(PLAYERS, 31);
  s.regions.devon.disc = 'welsh';
  ok(!cardChoices(s, 'assemble').targets.includes('devon'), 'Rassemblement ne peut pas viser une région contrôlée');
  ok(manoeuvreOptions(s).every((o) => o.a !== 'devon' && o.b !== 'devon'), 'Manœuvre ne touche pas une région contrôlée');
  ok(outmanoeuvreOptions(s).full.every((o) => o.a !== 'devon' && o.b !== 'devon'), 'Contre-manœuvre non plus');
  ok(summonSources(s).every((x) => x.region !== 'devon'), 'on ne peut pas invoquer depuis une région contrôlée');
}

/* ---------------------------------------------------------------- */
section('Lutte de pouvoir');
{
  const s = createGame(PLAYERS, 37);
  const region = s.track[0].regionId;
  s.regions[region].followers = { scottish: 3, welsh: 1, english: 0 };
  const supplyBefore = totalFollowers(s.supply);
  for (let i = 0; i < 4; i++) applyMove(s, s.current, { type: 'pass' });
  ok(s.regions[region].disc === 'scottish', 'la faction majoritaire prend le contrôle');
  ok(totalFollowers(s.regions[region].followers) === 0, 'la région est vidée');
  ok(totalFollowers(s.supply) === supplyBefore + 4, 'les suivants retournent à la réserve');
  ok(s.track[0].faceDown === true, 'la carte région est retournée face cachée');
  ok(s.factionWinOrder[0] === 'scottish', 'la victoire est enregistrée pour le classement final');
  ok(contestedIndex(s) === 1, 'la prochaine lutte concerne l\'espace 2');

  const s2 = createGame(PLAYERS, 37);
  s2.regions[s2.track[0].regionId].followers = { scottish: 2, welsh: 2, english: 0 };
  for (let i = 0; i < 4; i++) applyMove(s2, s2.current, { type: 'pass' });
  ok(s2.regions[s2.track[0].regionId].disc === 'unstable', 'égalité → région instable');
  ok(s2.instability === 1, 'un disque d\'instabilité posé');

  const s3 = createGame(PLAYERS, 37);
  s3.regions[s3.track[0].regionId].followers = { scottish: 0, welsh: 0, english: 0 };
  for (let i = 0; i < 4; i++) applyMove(s3, s3.current, { type: 'pass' });
  ok(s3.regions[s3.track[0].regionId].disc === 'unstable', 'région vide → instable');

  // Une action réinitialise le compteur de « passe ».
  const s4 = createGame(PLAYERS, 41);
  applyMove(s4, s4.current, { type: 'pass' });
  applyMove(s4, s4.current, { type: 'pass' });
  applyMove(s4, s4.current, { type: 'play', card: 'assemble', params: { placements: { scottish: 'devon', welsh: 'devon', english: 'devon' } } });
  const src = summonSources(s4)[0];
  applyMove(s4, s4.current, { type: 'summon', region: src.region, faction: src.faction });
  ok(s4.consecutivePasses === 0, 'une action remet le compteur de passes à zéro');
  ok(s4.struggleCount === 0, 'aucune lutte déclenchée');
}

/* ---------------------------------------------------------------- */
section('Fin par invasion');
{
  const s = createGame(PLAYERS, 43);
  // On force trois régions instables.
  for (let k = 0; k < 3; k++) {
    const region = s.track[contestedIndex(s)].regionId;
    s.regions[region].followers = { scottish: 1, welsh: 1, english: 0 };
    for (let i = 0; i < 4; i++) { if (s.phase !== 'finished') applyMove(s, s.current, { type: 'pass' }); }
  }
  ok(s.phase === 'finished' && s.ending === 'invasion', 'trois disques d\'instabilité → invasion française');
  ok(s.instability === 3, 'trois disques posés');
  const rows = s.result.rows;
  ok(rows.length === 2, 'deux équipes classées');
  ok(rows.every((r) => r.sets === Math.min(r.combined.scottish, r.combined.welsh, r.combined.english)),
    'un ensemble = un suivant de chaque faction, cours des coéquipiers cumulées');
  ok(s.result.winners.length === 2, 'les deux membres de l\'équipe gagnante sont désignés');
}

/* ---------------------------------------------------------------- */
section('Fin par couronnement');
{
  const s = createGame(PLAYERS, 47);
  for (let k = 0; k < 8; k++) {
    if (s.phase === 'finished') break;
    const region = s.track[contestedIndex(s)].regionId;
    // On alterne les vainqueurs pour éviter l'instabilité.
    const f = ['scottish', 'welsh', 'english'][k % 3];
    s.regions[region].followers = { scottish: 0, welsh: 0, english: 0 };
    s.regions[region].followers[f] = 3;
    for (let i = 0; i < 4 && s.phase !== 'finished'; i++) applyMove(s, s.current, { type: 'pass' });
  }
  ok(s.phase === 'finished' && s.ending === 'coronation', 'huit luttes résolues sans invasion → couronnement');
  const { ranked, controlled } = factionRanking(s);
  ok(controlled.scottish + controlled.welsh + controlled.english === 8, 'les huit régions sont contrôlées');
  ok(controlled[ranked[0]] >= controlled[ranked[1]] && controlled[ranked[1]] >= controlled[ranked[2]], 'classement décroissant');
  ok(s.result.winners.length === 2, 'le vainqueur et son coéquipier sont couronnés');
  const champ = s.result.rows.find((r) => r.seat === s.result.winners[0]);
  const maxFirst = Math.max(...s.result.rows.map((r) => r.first));
  ok(s.result.rows.filter((r) => s.result.winners.includes(r.seat)).some((r) => r.first === maxFirst),
    'le vainqueur a le plus de suivants de la faction la plus puissante');
}
{
  // Départage du classement des factions : à égalité de régions, la dernière victoire l'emporte.
  const s = createGame(PLAYERS, 53);
  s.regions.moray.disc = 'scottish';
  s.regions.devon.disc = 'welsh';
  s.factionWinOrder = ['scottish', 'welsh'];
  ok(factionRanking(s).ranked[0] === 'welsh', 'à égalité, la faction ayant gagné en dernier est la plus puissante');
  s.factionWinOrder = ['welsh', 'scottish'];
  ok(factionRanking(s).ranked[0] === 'scottish', 'et inversement');
}

/* ---------------------------------------------------------------- */
section('Vue filtrée (mains secrètes)');
{
  const s = createGame(PLAYERS, 59);
  applyMove(s, s.current, { type: 'play', card: 'assemble', params: { placements: { scottish: 'devon', welsh: 'devon', english: 'devon' } } });
  const actor = s.pendingSummonSeat;
  const v = viewFor(s, (actor + 1) % 4);
  ok(typeof v.players[actor].hand === 'number', "la main d'un adversaire est réduite à un compte");
  ok(Array.isArray(v.players[(actor + 1) % 4].hand), 'le joueur voit sa propre main');
  ok(v.players[actor].discard.length === 1, "seule la dernière carte défaussée d'un adversaire est visible");
}

/* ---------------------------------------------------------------- */
section('Parties complètes simulées');
{
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  let invasions = 0, coronations = 0, errors = 0, maxTurns = 0;

  for (let g = 0; g < 400; g++) {
    const s = createGame(PLAYERS, 1000 + g);
    let turns = 0;
    while (s.phase !== 'finished' && turns < 4000) {
      turns++;
      const seat = s.current;
      try {
        if (s.phase === 'summon') {
          const src = pick(summonSources(s));
          applyMove(s, seat, { type: 'summon', region: src.region, faction: src.faction });
          continue;
        }
        const hand = s.players[seat].hand;
        if (hand.length === 0 || Math.random() < 0.25) { applyMove(s, seat, { type: 'pass' }); continue; }
        const card = pick(hand);
        const ch = cardChoices(s, card);
        let params = {};
        if (ch.type === 'support') {
          if (ch.targets.length === 0 || ch.count === 0) { applyMove(s, seat, { type: 'pass' }); continue; }
          params = { region: pick(ch.targets) };
        } else if (ch.type === 'assemble') {
          if (ch.targets.length === 0) { applyMove(s, seat, { type: 'pass' }); continue; }
          params = { placements: {} };
          for (const f of ch.factions) params.placements[f] = pick(ch.targets);
        } else if (ch.type === 'negotiate') {
          if (ch.indices.length < 2 || !s.players[seat].negotiationDisc) { applyMove(s, seat, { type: 'pass' }); continue; }
          const i = pick(ch.indices);
          const j = pick(ch.indices.filter((x) => x !== i));
          params = { i, j, discOn: pick([i, j]) };
        } else if (ch.type === 'manoeuvre' || ch.type === 'outmanoeuvre') {
          if (ch.options.length === 0) { applyMove(s, seat, { type: 'pass' }); continue; }
          params = pick(ch.options);
        }
        applyMove(s, seat, { type: 'play', card, params });
      } catch (e) {
        errors++;
        if (errors < 4) console.error('  ✗ exception en cours de partie : ' + e.message);
        break;
      }
    }
    maxTurns = Math.max(maxTurns, turns);
    if (s.phase !== 'finished') { errors++; console.error('  ✗ partie non terminée après ' + turns + ' coups'); break; }
    if (s.ending === 'invasion') invasions++; else coronations++;

    // Invariants de fin de partie
    const counts = { scottish: 0, welsh: 0, english: 0 };
    for (const r of REGION_IDS) for (const f of FACTIONS) counts[f] += s.regions[r].followers[f];
    for (const p of s.players) for (const f of FACTIONS) counts[f] += p.court[f];
    for (const f of FACTIONS) counts[f] += s.supply[f];
    if (!FACTIONS.every((f) => counts[f] === 18)) { errors++; console.error('  ✗ cubes perdus en fin de partie'); break; }
    if (!s.result || !s.result.winners.length) { errors++; console.error('  ✗ pas de vainqueur'); break; }
    if (s.ending === 'coronation' && s.struggleCount !== 8) { errors++; console.error('  ✗ couronnement sans 8 luttes'); break; }
    if (s.ending === 'invasion' && s.instability !== 3) { errors++; console.error('  ✗ invasion sans 3 disques'); break; }
    if (s.result.winners.length !== 2) { errors++; console.error('  ✗ une équipe gagnante doit compter 2 joueurs'); break; }
  }
  ok(errors === 0, '400 parties aléatoires jouées sans erreur');
  console.log(`  → ${invasions} invasions, ${coronations} couronnements, ${maxTurns} coups max`);
}


/* ---------------------------------------------------------------- */
section('Modes : 2 joueurs, 3 joueurs, 4 chacun pour soi');
{
  const P2 = PLAYERS.slice(0, 2), P3 = PLAYERS.slice(0, 3);

  const s2 = createGame(P2, 71);
  {
    const counts = { scottish: 0, welsh: 0, english: 0 };
    for (const r of REGION_IDS) for (const f of FACTIONS) counts[f] += s2.regions[r].followers[f];
    for (const p of s2.players) for (const f of FACTIONS) counts[f] += p.court[f];
    for (const f of FACTIONS) counts[f] += s2.supply[f];
    ok(FACTIONS.every((f) => counts[f] === 16), 'a deux joueurs, 16 suivants par faction (deux retires)');
    ok(REGION_IDS.every((r) => totalFollowers(s2.regions[r].followers) === 4), 'toujours 4 suivants par region');
    ok(s2.teams === false, 'pas d\'equipes a deux');
  }
  const s3 = createGame(P3, 73);
  ok(s3.teams === false && s3.players.every((p, i) => p.team === i), 'a trois, chacun pour soi');

  const s4solo = createGame(PLAYERS, 77, { teams: false });
  ok(s4solo.teams === false, 'option chacun pour soi a quatre');
  ok(new Set(s4solo.players.map((p) => p.team)).size === 4, 'quatre camps distincts');
  const s4teams = createGame(PLAYERS, 77, { teams: true });
  ok(s4teams.teams === true, 'option equipes explicite');
  ok(createGame(PLAYERS, 77).teams === true, 'a quatre, equipes par defaut (regle officielle)');

  // Parties aleatoires completes dans chaque mode.
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const playOut = (defs, opts) => {
    const st = createGame(defs, 5000 + rand(100000), opts);
    let guard = 0;
    while (st.phase !== 'finished' && guard++ < 4000) {
      const seat = st.current;
      if (st.phase === 'summon') {
        const src = pick(summonSources(st));
        applyMove(st, seat, { type: 'summon', region: src.region, faction: src.faction });
        continue;
      }
      const hand = st.players[seat].hand;
      if (hand.length === 0 || Math.random() < 0.3) { applyMove(st, seat, { type: 'pass' }); continue; }
      const card = pick(hand);
      const ch = cardChoices(st, card);
      try {
        if (ch.type === 'support' && ch.targets.length && ch.count) {
          applyMove(st, seat, { type: 'play', card, params: { region: pick(ch.targets) } });
        } else if (ch.type === 'assemble' && ch.targets.length) {
          const placements = {};
          for (const f of ch.factions) placements[f] = pick(ch.targets);
          applyMove(st, seat, { type: 'play', card, params: { placements } });
        } else if (ch.type === 'negotiate' && ch.indices.length >= 2 && st.players[seat].negotiationDisc) {
          const i = pick(ch.indices), j = pick(ch.indices.filter((x) => x !== i));
          applyMove(st, seat, { type: 'play', card, params: { i, j, discOn: pick([i, j]) } });
        } else if ((ch.type === 'manoeuvre' || ch.type === 'outmanoeuvre') && ch.options.length) {
          applyMove(st, seat, { type: 'play', card, params: pick(ch.options) });
        } else {
          applyMove(st, seat, { type: 'pass' });
        }
      } catch (e) { return { error: e.message }; }
    }
    return st;
  };

  let issues = 0;
  for (let g = 0; g < 100; g++) {
    for (const [defs, opts, label, expectWinners] of [
      [P2, {}, '2j', 1], [P3, {}, '3j', 1], [PLAYERS, { teams: false }, '4j solo', 1],
    ]) {
      const st = playOut(defs, opts);
      if (st.error || st.phase !== 'finished') { issues++; console.error('  x partie ' + label + ' : ' + (st.error || 'non terminee')); break; }
      const w = st.result.winners;
      if (!w.length) { issues++; console.error('  x pas de vainqueur en ' + label); break; }
      if (st.ending === 'coronation' && w.length !== expectWinners) {
        issues++; console.error('  x ' + label + ' couronnement : ' + w.length + ' vainqueurs'); break;
      }
    }
    if (issues) break;
  }
  ok(issues === 0, '300 parties aleatoires en modes 2j / 3j / 4j-solo, sans erreur');
}

/* ---------------------------------------------------------------- */
console.log(`\n${pass} tests réussis, ${fail} échecs.`);
process.exit(fail ? 1 : 0);
