/*
 * Interface de jeu. Deux modes :
 *   - « en ligne »   : le serveur détient l'état, le client envoie des coups
 *                      et reçoit des vues filtrées (les mains restent secrètes) ;
 *   - « un seul écran » : l'état vit dans le navigateur, avec un voile entre les tours.
 *
 * Dans les deux cas, les coups légaux sont calculés par le même moteur (game.js),
 * et en ligne le serveur revalide systématiquement.
 */

import {
  createGame, applyMove, viewFor, cardChoices, summonSources, contestedIndex,
  CARDS, REGIONS, REGION_IDS, FACTIONS, FACTION_INFO, ADJACENCY, factionRanking,
} from './game.js';
import { renderBoard, neighboursLabel } from './board.js';
import { cardFace } from './cards.js';
import { chooseAiMove } from './ai.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ */
/* État du client                                                      */
/* ------------------------------------------------------------------ */

let mode = null;          // 'online' | 'hotseat'
let view = null;          // vue de jeu affichée
let full = null;          // hotseat : état complet
let mySeat = null;        // en ligne : mon siège ; hotseat : siège révélé
let revealed = null;      // hotseat : siège dont la main est visible
let sel = null;           // sélection en cours
let ws = null;
let room = null;          // { code, players, host, youId, started }
let myId = null;
let lastError = '';

/* ------------------------------------------------------------------ */
/* Salon                                                               */
/* ------------------------------------------------------------------ */

function show(id, on) { $(id).classList.toggle('on', on); }
function panel(which) {
  for (const p of ['lobbyHome', 'lobbyJoin', 'lobbyHotseat', 'lobbyRoom']) {
    $('#' + p).style.display = p === which ? '' : 'none';
  }
}

$('#btnJoinForm').onclick = () => { panel('lobbyJoin'); $('#jcode').focus(); };
$('#btnBack1').onclick = () => panel('lobbyHome');
$('#btnBack2').onclick = () => panel('lobbyHome');
$('#btnHotseat').onclick = () => panel('lobbyHotseat');

$('#btnCreate').onclick = () => {
  const name = ($('#pname').value || '').trim();
  if (!name) return ($('#homeErr').textContent = 'Indiquez votre nom.');
  connect(() => sendWs({ t: 'create', name }));
};

$('#btnJoin').onclick = () => {
  const name = ($('#pname').value || '').trim();
  const code = ($('#jcode').value || '').trim().toUpperCase();
  if (!name) return ($('#joinErr').textContent = 'Revenez en arrière et indiquez votre nom.');
  if (code.length !== 4) return ($('#joinErr').textContent = 'Le code compte quatre lettres.');
  connect(() => sendWs({ t: 'join', code, name }));
};

$('#btnLeave').onclick = () => { location.hash = ''; location.reload(); };
$('#btnQuit').onclick = () => { if (confirm('Quitter la partie ?')) { location.hash = ''; location.reload(); } };

$('#btnStartOnline').onclick = () => sendWs({ t: 'start', teams: $('#optTeams').checked });

function hotseatSync() {
  const n = +$('#hcount').value;
  for (let i = 0; i < 4; i++) $('#hw' + i).style.display = i < n ? '' : 'none';
  $('#hteamsWrap').style.display = n === 4 ? '' : 'none';
  $('#hnote').textContent = n === 4 && $('#hteams').value === '1'
    ? 'En équipes : les joueurs 1 & 3 affrontent les joueurs 2 & 4.'
    : 'Chacun joue pour soi.';
}
$('#hcount').onchange = hotseatSync;
$('#hteams').onchange = hotseatSync;

let hsTypes = [];          // hotseat : 'humain' | 'ia' | 'ia-facile' par siège
let aiTimer = null;

$('#btnStartHotseat').onclick = () => {
  const n = +$('#hcount').value;
  hsTypes = Array.from({ length: n }, (_, i) => $('#ht' + i).value);
  const names = Array.from({ length: n }, (_, i) => {
    let nm = ($('#h' + i).value || '').trim() || `Joueur ${i + 1}`;
    // Un siège IA garde son nom personnalisé, mais le nom par défaut devient parlant.
    if (hsTypes[i] !== 'humain' && nm === `Joueur ${i + 1}`) nm = `IA ${i + 1}`;
    return nm;
  });
  mode = 'hotseat';
  full = createGame(names.map((nm, i) => ({ id: 'p' + i, name: nm })), (Math.random() * 1e9) | 0,
    { teams: $('#hteams').value === '1' });
  revealed = null;
  show('#lobby', false);
  $('#app').classList.add('on');
  refresh();
};

const isAiSeat = (seat) => mode === 'hotseat' && hsTypes[seat] && hsTypes[seat] !== 'humain';
const humanSeats = () => full.players.map((p) => p.seat).filter((s) => !isAiSeat(s));

/** Siège dont on montre la table pendant que les IA jouent. */
function watchSeat() {
  const humans = humanSeats();
  if (humans.length === 0) return 0;                     // spectacle : IA contre IA
  if (humans.length === 1) return humans[0];
  return revealed !== null && humans.includes(revealed) ? revealed : humans[0];
}

function scheduleAi() {
  if (aiTimer) return;
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (mode !== 'hotseat' || !full || full.phase === 'finished') return;
    if (!isAiSeat(full.current)) return;
    const level = hsTypes[full.current] === 'ia-facile' ? 'facile' : 'normale';
    let mv = null;
    try { mv = chooseAiMove(full, full.current, level); } catch { /* repli plus bas */ }
    try {
      if (mv) applyMove(full, full.current, mv);
      else if (full.phase === 'summon') {
        const src = summonSources(full)[0];
        applyMove(full, full.current, { type: 'summon', region: src.region, faction: src.faction });
      } else {
        applyMove(full, full.current, { type: 'pass' });
      }
    } catch {
      try { applyMove(full, full.current, { type: 'pass' }); } catch { /* rien à faire */ }
    }
    if (full.phase === 'finished') { refresh(); showEnd(); return; }
    refresh();
  }, 650);
}

$('#btnReveal').onclick = () => { revealed = full.current; show('#veil', false); refresh(); };

/* ------------------------------------------------------------------ */
/* Connexion WebSocket                                                 */
/* ------------------------------------------------------------------ */

function connect(then) {
  if (ws && ws.readyState === WebSocket.OPEN) return then();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen = () => then();
  ws.onmessage = (ev) => handleServer(JSON.parse(ev.data));
  ws.onclose = () => {
    if (mode === 'online') {
      $('#prompt').innerHTML = '<span class="err">Connexion perdue. Rechargez la page pour reprendre la partie.</span>';
    }
  };
  ws.onerror = () => { $('#homeErr').textContent = "Impossible de joindre le serveur."; };
}

function sendWs(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handleServer(msg) {
  if (msg.t === 'error') {
    lastError = msg.message;
    $('#homeErr').textContent = msg.message;
    $('#joinErr').textContent = msg.message;
    $('#roomErr').textContent = msg.message;
    if (view) renderPrompt();
    return;
  }
  if (msg.t === 'room') {
    mode = 'online';
    room = msg;
    myId = msg.youId;
    location.hash = `${msg.code}:${msg.token}`;
    if (!msg.started) {
      show('#lobby', true);
      panel('lobbyRoom');
      $('#roomCode').textContent = msg.code;
      renderSeats();
    }
    return;
  }
  if (msg.t === 'state') {
    mode = 'online';
    view = msg.view;
    mySeat = msg.view.you;
    sel = null;
    show('#lobby', false);
    $('#app').classList.add('on');
    render();
    return;
  }
}

let lanInfo = null;

/** Adresse locale du serveur, affichée à l'hôte qui a ouvert « localhost ». */
async function showLanAddress() {
  if (!/^(localhost|127\.)/.test(location.hostname)) return;   // déjà joint par le réseau
  try {
    if (!lanInfo) lanInfo = await (await fetch('/lan')).json();
  } catch { return; }
  if (!lanInfo || !lanInfo.ips || !lanInfo.ips.length) return;
  const main = `http://${lanInfo.ips[0].address}:${lanInfo.port}`;
  const others = lanInfo.ips.slice(1).map((e) => `http://${e.address}:${lanInfo.port}`);
  $('#lanNote').style.display = '';
  $('#lanNote').innerHTML = `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <div id="lanQr" title="${esc(main)}"></div>
    <div style="flex:1;min-width:220px">
      <strong>Sur le même Wi-Fi</strong>, les autres joueurs
      <strong>scannent ce QR code</strong> avec l'appareil photo du téléphone,
      ou tapent dans la <em>barre d'adresse</em> du navigateur (pas la recherche Google) :
      <br><span style="font-size:17px;color:var(--rubric);font-weight:600;user-select:all">${esc(main)}</span>
      ${others.length ? `<br><small>Si cette adresse ne répond pas : ${others.map(esc).join(' · ')}</small>` : ''}
      <br><small>Si le pare-feu Windows demande une autorisation pour Node.js, acceptez (réseaux privés).</small>
    </div>
  </div>`;
  drawQr($('#lanQr'), main);
}

/** QR code de l'adresse locale (bibliothèque servie par le serveur, hors ligne inclus). */
function drawQr(el, text) {
  if (typeof qrcode === 'undefined' || !el) return;   // bibliothèque absente : l'adresse texte suffit
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const size = 148, cell = size / (n + 8), off = cell * 4;   // zone de silence de 4 modules
    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="background:#fff;border:4px solid #fff;border-radius:4px;box-shadow:0 1px 4px rgba(58,43,22,.4)">`;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          svg += `<rect x="${(off + c * cell).toFixed(2)}" y="${(off + r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#241a0c"/>`;
        }
      }
    }
    el.innerHTML = svg + '</svg>';
  } catch { /* l'adresse en toutes lettres reste affichée */ }
}

function renderSeats() {
  const el = $('#seats');
  const teamsOn = $('#optTeams').checked;
  const amHost = room.host === myId;
  el.innerHTML = [0, 1, 2, 3].map((s) => {
    const occ = room.players.find((p) => p.seat === s);
    const mine = occ && occ.id === myId;
    const cls = ['seat', occ && !mine ? 'taken' : '', mine ? 'mine' : ''].filter(Boolean).join(' ');
    let body;
    if (!occ) {
      body = `<em style="opacity:.55">libre</em>${amHost ? ` <button class="botbtn" data-addbot="${s}">+ IA</button>` : ''}`;
    } else if (occ.isBot) {
      body = `${esc(occ.name)} <span class="bot-tag">ia</span>${amHost ? ` <button class="botbtn" data-removebot="${s}">retirer</button>` : ''}`;
    } else {
      body = esc(occ.name) + (occ.connected ? '' : ' <em style="opacity:.6">(déconnecté)</em>');
    }
    return `<div class="${cls}" data-seat="${s}">
      <span class="sn">Siège ${s + 1} ${teamsOn ? `<span class="tm">équipe ${s % 2 === 0 ? 'A' : 'B'}</span>` : ''}</span>
      ${body}
    </div>`;
  }).join('');
  el.querySelectorAll('[data-addbot]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); sendWs({ t: 'addbot', seat: +b.dataset.addbot }); };
  });
  el.querySelectorAll('[data-removebot]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); sendWs({ t: 'removebot', seat: +b.dataset.removebot }); };
  });
  el.querySelectorAll('.seat').forEach((d) => {
    d.onclick = () => {
      const s = +d.dataset.seat;
      const occ = room.players.find((p) => p.seat === s);
      if (occ && occ.id !== myId) return;
      sendWs({ t: 'seat', seat: s });
    };
  });
  const seated = room.players.filter((p) => p.seat !== null).length;
  const isHost = room.host === myId;
  $('#btnStartOnline').disabled = !(isHost && seated >= 2);
  $('#optTeamsWrap').style.display = isHost ? '' : 'none';
  $('#roomNote').innerHTML = isHost
    ? `Vous êtes l'hôte. ${seated} joueur${seated > 1 ? 's' : ''} installé${seated > 1 ? 's' : ''} — la partie se lance à 2, 3 ou 4. À 4, l'option ci-dessus choisit entre équipes et chacun pour soi ; à 2 ou 3, chacun joue pour soi.`
    : `En attente du lancement par l'hôte. ${seated} joueur${seated > 1 ? 's' : ''} installé${seated > 1 ? 's' : ''}.`;
  showLanAddress();
}
$('#optTeams') && ($('#optTeams').onchange = () => room && renderSeats());

/* ------------------------------------------------------------------ */
/* Boucle d'affichage                                                  */
/* ------------------------------------------------------------------ */

function refresh() {
  if (mode !== 'hotseat') return;

  if (full.phase === 'finished') {
    revealed = null;
    view = viewFor(full, watchSeat());
    mySeat = watchSeat();
    render();
    return;
  }

  // Tour d'une IA : on regarde la table depuis le siège du (dernier) humain,
  // sans voile, et l'IA joue toute seule après un court délai.
  if (isAiSeat(full.current)) {
    const w = watchSeat();
    view = viewFor(full, w);
    mySeat = w;
    render();
    scheduleAi();
    return;
  }

  // Tour d'un humain. Le voile ne sert que s'il y a plusieurs humains :
  // seul contre des IA, on garde la main visible en permanence.
  const humans = humanSeats();
  if (humans.length > 1 && revealed !== full.current) {
    view = viewFor(full, full.current);
    mySeat = full.current;
    render();
    $('#veilName').textContent = full.players[full.current].name;
    const mate = full.teams
      ? full.players.find((p) => p.team === full.players[full.current].team && p.seat !== full.current)
      : null;
    $('#veilTeam').textContent = mate
      ? `équipe ${full.players[full.current].team === 0 ? 'A' : 'B'} — coéquipier : ${mate.name}`
      : '';
    show('#veil', true);
    return;
  }
  revealed = full.current;
  view = viewFor(full, revealed);
  mySeat = revealed;
  render();
}

function submit(move) {
  lastError = '';
  if (mode === 'online') {
    sendWs({ t: 'move', move });
    sel = null;
    return;
  }
  try {
    applyMove(full, full.current, move);
  } catch (e) {
    lastError = e.message;
    renderPrompt();
    return;
  }
  sel = null;
  if (full.phase === 'finished') { refresh(); showEnd(); return; }
  refresh();
}

function render() {
  if (!view) return;
  renderChips();
  renderBoardPane();
  renderPlayers();
  renderLog();
  renderHand();
  renderPrompt();
  if (view.phase === 'finished') showEnd();
}

/* --- bandeau ---------------------------------------------------------- */

function renderChips() {
  $('#chipMode').textContent = view.teams
    ? 'Équipes de deux'
    : `${view.playerCount} joueurs · chacun pour soi`;
  $('#chipStruggle').textContent = `Luttes ${view.struggleCount}/8`;
  $('#chipInstab').textContent = `Instabilité ${view.instability}/3`;
}

/* --- plateau ---------------------------------------------------------- */

/* --- zoom du plateau --------------------------------------------------- */

const ZOOMS = [1, 1.35, 1.8, 2.4, 3.1];
let zoomIdx = 0;

function applyZoom() {
  const svg = $('#boardSvgWrap .board-svg');
  if (!svg) return;
  const z = ZOOMS[zoomIdx];
  const mobile = matchMedia('(max-width: 760px)').matches;
  // Sur mobile la taille de base est fixée en pixels par la feuille de style.
  svg.style.height = mobile ? `${640 * z}px` : `${100 * z}%`;
  svg.style.width = 'auto';
  svg.style.maxWidth = 'none';
  $('#boardPane').classList.toggle('zoomed', zoomIdx > 0);
  $('#zoomOut').disabled = zoomIdx === 0;
  $('#zoomIn').disabled = zoomIdx === ZOOMS.length - 1;
}

$('#zoomIn').onclick = () => { zoomIdx = Math.min(zoomIdx + 1, ZOOMS.length - 1); applyZoom(); };
$('#zoomOut').onclick = () => { zoomIdx = Math.max(zoomIdx - 1, 0); applyZoom(); };
$('#zoomFit').onclick = () => { zoomIdx = 0; applyZoom(); };

function renderBoardPane() {
  const hi = highlights();
  const wrap = $('#boardSvgWrap');
  // On préserve la position de défilement : indispensable quand on joue zoomé.
  const sl = wrap.scrollLeft, st = wrap.scrollTop;
  wrap.innerHTML = renderBoard(view, hi);
  applyZoom();
  wrap.scrollLeft = sl;
  wrap.scrollTop = st;
  wrap.querySelectorAll('[data-faction]').forEach((g) => {
    const key = `${g.dataset.region}:${g.dataset.faction}`;
    if (hi.cubes.has(key)) g.onclick = () => onCube(g.dataset.region, g.dataset.faction);
  });
  wrap.querySelectorAll('.rg-hit').forEach((p) => {
    const id = p.parentNode.dataset.region;
    p.parentNode.setAttribute('aria-label', `${REGIONS[id].fr} — voisines : ${neighboursLabel(id)}`);
    if (hi.regions.has(id)) p.onclick = () => onRegion(id);
  });
  $('#boardPane').querySelectorAll('[data-track]').forEach((g) => {
    const i = +g.dataset.track;
    if (hi.track.has(i)) g.onclick = () => onTrack(i);
  });
}

/* --- joueurs ----------------------------------------------------------- */

function renderPlayers() {
  $('#players').innerHTML = view.players.map((p) => {
    const isTurn = p.seat === view.current && view.phase !== 'finished';
    const isMe = p.seat === mySeat;
    const handN = typeof p.hand === 'number' ? p.hand : p.hand.length;
    const dn = p.discard.length ? CARDS[p.discard[p.discard.length - 1]].fr : '—';
    const discN = p.discardCount !== undefined ? p.discardCount : p.discard.length;
    return `<div class="pl ${isTurn ? 'turn' : ''} ${isMe ? 'you' : ''}">
      <div><span class="nm">${esc(p.name)}</span> ${view.teams ? `<span class="team">— équipe ${p.team === 0 ? 'A' : 'B'}</span>` : ''}</div>
      <div class="court">${FACTIONS.map((f) => {
        const n = p.court[f];
        const cubes = Array.from({ length: n }, () => `<span class="mini-cube ${f}"></span>`).join('');
        return `<span class="stack" title="${n} ${FACTION_INFO[f].fr.toLowerCase()}">${cubes || `<span class="mini-none"></span>`}<span class="mini-count">${n}</span></span>`;
      }).join('')}</div>
      <div class="meta">
        <span>main : ${handN}</span>
        <span>dernière action : ${esc(dn)}${discN > 1 ? ` (${discN} jouées)` : ''}</span>
        ${p.negotiationDisc ? '<span><span class="discbadge"></span> disque</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

/* --- chronique --------------------------------------------------------- */

function renderLog() {
  const el = $('#log');
  el.innerHTML = view.log.slice(-80).map((l) => `<div class="${l.kind}">${esc(l.text)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
}

/* ------------------------------------------------------------------ */
/* Main et invites                                                     */
/* ------------------------------------------------------------------ */

function myTurn() {
  return view.phase !== 'finished' && view.current === mySeat &&
    (mode === 'hotseat' ? revealed === full.current : true);
}

/** Une carte a-t-elle un effet dans la position actuelle ? */
function cardHasEffect(card) {
  const c = cardChoices(view, card);
  if (c.type === 'support') return c.targets.length > 0 && c.count > 0;
  if (c.type === 'assemble') return c.targets.length > 0 && c.factions.length > 0;
  if (c.type === 'negotiate') return c.indices.length >= 2 && view.players[mySeat].negotiationDisc;
  return c.options.length > 0;
}

function renderHand() {
  const me = view.players[mySeat];
  const hand = Array.isArray(me.hand) ? me.hand : [];
  const active = myTurn() && view.phase === 'action';
  $('#hand').innerHTML = hand.map((card, i) => {
    const c = CARDS[card];
    const fx = active ? cardHasEffect(card) : true;
    const picked = sel && sel.handIndex === i;
    return `<div class="card ${picked ? 'picked' : ''} ${active ? '' : 'disabled'} ${active && !fx ? 'nofx' : ''}"
        data-i="${i}" title="${esc(c.fr)} — ${esc(c.text)}">
      ${cardFace(card)}
      <p>${esc(c.text)}</p>
      ${active && !fx ? '<span class="nofx-tag">aucun effet possible</span>' : ''}
    </div>`;
  }).join('') || '<em style="color:#c9b78c">Plus aucune carte en main — vous ne pouvez que passer.</em>';

  if (active) {
    $('#hand').querySelectorAll('.card').forEach((d) => { d.onclick = () => pickCard(+d.dataset.i); });
  }
}

function setPrompt(html) {
  $('#prompt').innerHTML = (lastError ? `<span class="err">${esc(lastError)}</span> ` : '') + html;
  $('#prompt').querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => onAct(b.dataset.act, b.dataset.arg); });
}

function renderPrompt() {
  if (view.phase === 'finished') { setPrompt('<span class="lead">La partie est terminée.</span>'); return; }
  if (!myTurn()) {
    const p = view.players[view.current];
    setPrompt(`<span class="lead">Au tour de ${esc(p.name)}…</span>` +
      (view.phase === 'summon' ? '<span class="hint">il ou elle invoque un suivant à sa cour.</span>' : ''));
    return;
  }
  if (view.phase === 'summon') {
    const done = sel && sel.type === 'summon' && sel.region;
    setPrompt(`<span class="lead">Invoquez un suivant à votre cour.</span>` +
      `<span class="hint">Cliquez un cube sur le plateau — jamais dans la réserve.</span>` +
      (done ? ` <button class="primary" data-act="confirm">Invoquer ce ${FACTION_INFO[sel.faction].fr.toLowerCase()} de ${REGIONS[sel.region].fr}</button>
               <button data-act="cancel">Changer</button>` : ''));
    return;
  }
  if (!sel) {
    setPrompt(`<span class="lead">À vous de jouer.</span>
      <span class="hint">Choisissez une carte action, ou passez. Si tous les joueurs passent d'affilée, une lutte de pouvoir est résolue.</span>
      <button data-act="pass">Passer</button>`);
    return;
  }
  setPrompt(selPrompt() + ` <button data-act="cancel">Annuler</button>`);
}

/* ------------------------------------------------------------------ */
/* Machine de sélection                                                */
/* ------------------------------------------------------------------ */

function pickCard(handIndex) {
  const card = view.players[mySeat].hand[handIndex];
  const c = cardChoices(view, card);
  lastError = '';

  if (!cardHasEffect(card)) {
    sel = { type: 'noeffect', card, handIndex };
    render();
    return;
  }

  if (c.type === 'support') sel = { type: 'support', card, handIndex, faction: c.faction, targets: c.targets, count: c.count, region: null };
  else if (c.type === 'assemble') sel = { type: 'assemble', card, handIndex, targets: c.targets, queue: c.factions, placements: {}, step: 0 };
  else if (c.type === 'negotiate') sel = { type: 'negotiate', card, handIndex, indices: c.indices, i: null, j: null, step: 0, discOn: null };
  else if (c.type === 'manoeuvre') {
    const opts = [];
    for (const o of c.options) { opts.push(o); opts.push({ a: o.b, fa: o.fb, b: o.a, fb: o.fa }); }
    sel = { type: 'manoeuvre', card, handIndex, options: opts, a: null, fa: null, b: null, fb: null };
  } else if (c.type === 'outmanoeuvre') {
    sel = { type: 'outmanoeuvre', card, handIndex, options: c.options, need: c.mustBeFull ? 2 : 1, a: null, fa: null, picks: [] };
  }
  render();
}

/** Ensembles cliquables et sélectionnés, dérivés de `sel`. */
function highlights() {
  const out = {
    active: false, regions: new Set(), cubes: new Set(), selected: new Set(),
    selectedCubes: [], track: new Set(), trackPicked: new Set(),
  };
  if (!myTurn()) return out;

  if (view.phase === 'summon') {
    out.active = true;
    if (!(sel && sel.type === 'summon' && sel.region)) {
      for (const s of summonSources(view)) out.cubes.add(`${s.region}:${s.faction}`);
    } else {
      out.selectedCubes.push(`${sel.region}:${sel.faction}`);
      out.selected.add(sel.region);
    }
    return out;
  }
  if (!sel) return out;
  out.active = true;

  if (sel.type === 'support') {
    if (!sel.region) sel.targets.forEach((r) => out.regions.add(r));
    else out.selected.add(sel.region);
  } else if (sel.type === 'negotiate') {
    if (sel.i !== null) out.trackPicked.add(sel.i);
    if (sel.j !== null) out.trackPicked.add(sel.j);
    if (sel.j === null) sel.indices.forEach((i) => { if (i !== sel.i) out.track.add(i); });
  } else if (sel.type === 'assemble') {
    Object.entries(sel.placements).forEach(([, r]) => out.selected.add(r));
    if (sel.step < sel.queue.length) sel.targets.forEach((r) => out.regions.add(r));
  } else if (sel.type === 'manoeuvre') {
    if (!sel.fa) {
      sel.options.forEach((o) => out.cubes.add(`${o.a}:${o.fa}`));
    } else if (!sel.fb) {
      out.selectedCubes.push(`${sel.a}:${sel.fa}`); out.selected.add(sel.a);
      out.arrowFrom = sel.a;
      sel.options.filter((o) => o.a === sel.a && o.fa === sel.fa).forEach((o) => out.cubes.add(`${o.b}:${o.fb}`));
    } else {
      out.selectedCubes.push(`${sel.a}:${sel.fa}`, `${sel.b}:${sel.fb}`);
      out.selected.add(sel.a); out.selected.add(sel.b);
    }
  } else if (sel.type === 'outmanoeuvre') {
    if (!sel.fa) {
      sel.options.forEach((o) => out.cubes.add(`${o.a}:${o.fa}`));
    } else {
      out.selectedCubes.push(`${sel.a}:${sel.fa}`); out.selected.add(sel.a);
      sel.picks.forEach((p) => { out.selectedCubes.push(p); out.selected.add(p.split(':')[0]); });
      if (sel.picks.length < sel.need) {
        out.arrowFrom = sel.a;
        for (const f of nextOutTargets()) out.cubes.add(f);
      }
    }
  }
  return out;
}

/** Cubes encore cliquables pour compléter une Contre-manœuvre. */
function nextOutTargets() {
  const set = new Set();
  const fixedB = sel.picks.length ? sel.picks[0].split(':')[0] : null;
  const chosen = sel.picks.map((p) => p.split(':')[1]);
  for (const o of sel.options) {
    if (o.a !== sel.a || o.fa !== sel.fa) continue;
    if (fixedB && o.b !== fixedB) continue;
    // Le multi-ensemble déjà choisi doit être contenu dans o.fb.
    const pool = o.fb.slice();
    let ok = true;
    for (const f of chosen) { const k = pool.indexOf(f); if (k === -1) { ok = false; break; } pool.splice(k, 1); }
    if (!ok) continue;
    for (const f of new Set(pool)) set.add(`${o.b}:${f}`);
  }
  return set;
}

function onRegion(id) {
  lastError = '';
  if (!sel) return;
  if (sel.type === 'support') { sel.region = id; }
  else if (sel.type === 'assemble') {
    sel.placements[sel.queue[sel.step]] = id;
    sel.step++;
  }
  render();
}

function onCube(region, faction) {
  lastError = '';
  if (view.phase === 'summon') { sel = { type: 'summon', region, faction }; render(); return; }
  if (!sel) return;
  if (sel.type === 'manoeuvre') {
    if (!sel.fa) { sel.a = region; sel.fa = faction; }
    else if (!sel.fb) { sel.b = region; sel.fb = faction; }
  } else if (sel.type === 'outmanoeuvre') {
    if (!sel.fa) { sel.a = region; sel.fa = faction; }
    else if (sel.picks.length < sel.need) sel.picks.push(`${region}:${faction}`);
  }
  render();
}

function onTrack(i) {
  lastError = '';
  if (!sel || sel.type !== 'negotiate') return;
  if (sel.i === null) sel.i = i;
  else if (sel.j === null && i !== sel.i) sel.j = i;
  sel.step = sel.j !== null ? 2 : 1;
  render();
}

function selComplete() {
  if (!sel) return false;
  switch (sel.type) {
    case 'noeffect': return true;
    case 'summon': return !!sel.region;
    case 'support': return !!sel.region;
    case 'assemble': return sel.step >= sel.queue.length;
    case 'negotiate': return sel.i !== null && sel.j !== null && sel.discOn !== null;
    case 'manoeuvre': return !!sel.fa && !!sel.fb;
    case 'outmanoeuvre': return !!sel.fa && sel.picks.length === sel.need;
    default: return false;
  }
}

function selPrompt() {
  const card = CARDS[sel.card] ? CARDS[sel.card].fr : '';
  const head = `<span class="lead">${esc(card)}</span>`;
  const go = `<button class="primary" data-act="confirm">Valider</button>`;

  switch (sel.type) {
    case 'noeffect':
      return `${head}<span class="hint">Cette action n'a aucun effet possible dans la position actuelle. Vous pouvez tout de même la jouer — vous invoquerez alors un suivant à votre cour.</span>${go}`;
    case 'support': {
      if (!sel.region) return `${head}<span class="hint">Choisissez la région où placer ${sel.count} suivant${sel.count > 1 ? 's' : ''} ${FACTION_INFO[sel.faction].adj}${sel.count > 1 ? 's' : ''} (régions en surbrillance).</span>`;
      return `${head}<span class="hint">${sel.count} ${FACTION_INFO[sel.faction].fr.toLowerCase()} → ${REGIONS[sel.region].fr}.</span>${go}`;
    }
    case 'assemble': {
      if (sel.step < sel.queue.length) {
        const f = sel.queue[sel.step];
        return `${head}<span class="hint">Où placer le suivant ${FACTION_INFO[f].fr.toLowerCase()} ? (${sel.step + 1}/${sel.queue.length})</span>`;
      }
      const d = Object.entries(sel.placements).map(([f, r]) => `${FACTION_INFO[f].fr.toLowerCase()} → ${REGIONS[r].fr}`).join(', ');
      return `${head}<span class="hint">${d}.</span>${go}`;
    }
    case 'negotiate': {
      if (sel.i === null) return `${head}<span class="hint">Choisissez la première carte région à déplacer, dans la colonne de droite.</span>`;
      if (sel.j === null) return `${head}<span class="hint">Choisissez la seconde carte région.</span>`;
      if (sel.discOn === null) {
        const rI = REGIONS[view.track[sel.i].regionId].fr, rJ = REGIONS[view.track[sel.j].regionId].fr;
        return `${head}<span class="hint">Sur quelle carte posez-vous votre disque de négociation ? (elle ne pourra plus être déplacée)</span>
          <button data-act="disc" data-arg="${sel.j}">${esc(rI)}</button>
          <button data-act="disc" data-arg="${sel.i}">${esc(rJ)}</button>`;
      }
      const rI = REGIONS[view.track[sel.i].regionId].fr, rJ = REGIONS[view.track[sel.j].regionId].fr;
      const discRegion = sel.discOn === sel.i ? rJ : rI;
      return `${head}<span class="hint">${esc(rI)} (espace ${sel.i + 1}) ↔ ${esc(rJ)} (espace ${sel.j + 1}) ; disque sur ${esc(discRegion)}.</span>${go}`;
    }
    case 'manoeuvre': {
      if (!sel.fa) return `${head}<span class="hint">Cliquez le premier suivant à échanger.</span>`;
      if (!sel.fb) return `${head}<span class="hint">Cliquez le suivant, dans une <em>autre</em> région, avec lequel l'échanger.</span>`;
      return `${head}<span class="hint">${FACTION_INFO[sel.fa].fr} de ${REGIONS[sel.a].fr} ↔ ${FACTION_INFO[sel.fb].fr} de ${REGIONS[sel.b].fr}.</span>${go}`;
    }
    case 'outmanoeuvre': {
      if (!sel.fa) return `${head}<span class="hint">Cliquez le suivant seul (il partira vers une région adjacente qui vous en rendra ${sel.need}).</span>`;
      if (sel.picks.length < sel.need) {
        return `${head}<span class="hint">Choisissez ${sel.need} suivant${sel.need > 1 ? 's' : ''} d'une <em>même région adjacente</em> à ${REGIONS[sel.a].fr} (${sel.picks.length}/${sel.need})${sel.need === 1 ? ' — aucun échange complet 1 contre 2 n\'étant possible, l\'échange se fait 1 contre 1' : ''}.</span>`;
      }
      const b = sel.picks[0].split(':')[0];
      const names = sel.picks.map((p) => FACTION_INFO[p.split(':')[1]].fr).join(' + ');
      return `${head}<span class="hint">${FACTION_INFO[sel.fa].fr} de ${REGIONS[sel.a].fr} ↔ ${names} de ${REGIONS[b].fr}.</span>${go}`;
    }
    default: return head;
  }
}

function onAct(act, arg) {
  lastError = '';
  if (act === 'cancel') { sel = null; render(); return; }
  if (act === 'pass') { submit({ type: 'pass' }); return; }
  if (act === 'disc') { sel.discOn = +arg; render(); return; }
  if (act === 'confirm') {
    if (!selComplete()) { render(); return; }
    if (sel.type === 'summon') { submit({ type: 'summon', region: sel.region, faction: sel.faction }); return; }
    let params = {};
    if (sel.type === 'support') params = { region: sel.region };
    else if (sel.type === 'assemble') params = { placements: sel.placements };
    else if (sel.type === 'negotiate') params = { i: sel.i, j: sel.j, discOn: sel.discOn };
    else if (sel.type === 'manoeuvre') params = { a: sel.a, fa: sel.fa, b: sel.b, fb: sel.fb };
    else if (sel.type === 'outmanoeuvre') {
      params = { a: sel.a, fa: sel.fa, b: sel.picks[0].split(':')[0], fb: sel.picks.map((p) => p.split(':')[1]) };
    }
    submit({ type: 'play', card: sel.card, params });
  }
}

/* ------------------------------------------------------------------ */
/* Écran de fin                                                        */
/* ------------------------------------------------------------------ */

function showEnd() {
  const r = view.result;
  if (!r) return;
  const winners = new Set(r.winners);
  let html = '';

  if (r.kind === 'invasion') {
    html += `<h2>Invasion française</h2>
      <p class="sub">Trois régions sombrent dans l'instabilité : les Français débarquent. Le chef capable d'unir les factions contre l'envahisseur ceindra la couronne.</p>
      <p>Le vainqueur est celui qui réunit le plus d'<strong>ensembles complets</strong> — un suivant de chaque faction.</p>
      <table class="result-table"><tr><th>Équipe</th><th>Écossais</th><th>Gallois</th><th>Anglais</th><th>Ensembles</th></tr>`;
    for (const row of r.rows) {
      const win = row.seats.some((s) => winners.has(s));
      html += `<tr class="${win ? 'win' : ''}"><td>${esc(row.members.join(' & '))}</td>
        <td>${row.combined.scottish}</td><td>${row.combined.welsh}</td><td>${row.combined.english}</td>
        <td><strong>${row.sets}</strong></td></tr>`;
    }
    html += `</table>`;
  } else {
    const { ranked, controlled } = r;
    html += `<h2>Couronnement</h2>
      <p class="sub">Les huit régions ont choisi leur camp. La faction la plus puissante fait roi son champion.</p>
      <div class="rank-row">${ranked.map((f, i) =>
        `<div class="rank"><span class="pos">${i + 1}</span><span class="pip ${f}"></span>${FACTION_INFO[f].fr}
          <small>&nbsp;${controlled[f]} région${controlled[f] > 1 ? 's' : ''}</small></div>`).join('')}</div>
      <table class="result-table"><tr><th>Joueur</th>${view.teams ? '<th>Équipe</th>' : ''}
        <th>${FACTION_INFO[ranked[0]].fr}</th><th>${FACTION_INFO[ranked[1]].fr}</th><th>${FACTION_INFO[ranked[2]].fr}</th></tr>`;
    for (const row of r.rows) {
      html += `<tr class="${winners.has(row.seat) ? 'win' : ''}"><td>${esc(row.name)}</td>
        ${view.teams ? `<td>${row.team === 0 ? 'A' : 'B'}</td>` : ''}
        <td><strong>${row.court[ranked[0]]}</strong></td><td>${row.court[ranked[1]]}</td><td>${row.court[ranked[2]]}</td></tr>`;
    }
    html += `</table>`;
  }

  html += `<p class="note"><strong>${esc(r.summary)}</strong></p>
    <div class="actions"><button class="primary" data-end="close">Revoir le plateau</button>
    <button data-end="again">Nouvelle partie</button></div>`;
  $('#endInner').innerHTML = html;
  $('#endInner').querySelectorAll('[data-end]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.end === 'again') { location.hash = ''; location.reload(); }
      else show('#endscreen', false);
    };
  });
  show('#endscreen', true);
}

/* ------------------------------------------------------------------ */
/* Aide-mémoire                                                        */
/* ------------------------------------------------------------------ */

$('#btnRules').onclick = () => {
  $('#rulesInner').innerHTML = `
    <h2>Aide-mémoire</h2>
    <p class="sub">The King is Dead, seconde édition — Peer Sylvester, Osprey Games.</p>
    <p><strong>Un tour.</strong> Jouez une carte action et résolvez-la, puis <em>invoquez obligatoirement un suivant</em>
    depuis n'importe quelle région (jamais depuis la réserve) vers votre cour. Ou passez. Si les quatre joueurs
    passent d'affilée, une lutte de pouvoir est résolue.</p>
    <p><strong>Lutte de pouvoir.</strong> La région contestée est celle de la carte face visible portant le plus petit
    numéro. La faction majoritaire y pose un disque de contrôle ; en cas d'égalité (ou si la région est vide) elle
    devient instable. Tous les suivants de la région repartent à la réserve, et la carte est retournée. Une région
    ainsi réglée est figée : on n'y place et n'y déplace plus rien.</p>
    <p><strong>Fin de partie.</strong> Trois disques d'instabilité → <em>invasion</em> immédiate : gagne l'équipe qui
    réunit le plus d'ensembles complets (un suivant de chaque faction, cours cumulées) ; départage : la dernière carte
    action jouée. Huit luttes résolues → <em>couronnement</em> : on classe les factions par nombre de régions contrôlées
    (à égalité, la dernière à avoir gagné une lutte est la plus puissante) ; gagne le joueur ayant le plus de suivants
    de la faction la plus puissante, et son coéquipier ; départages : la deuxième faction, puis l'équipe ayant vidé
    sa main en premier.</p>
    <h3 style="color:#a8231d;font-size:17px;margin:18px 0 6px">Les cartes</h3>
    ${Object.entries(CARDS).map(([k, c]) => `<p style="margin:6px 0"><strong>${esc(c.fr)}</strong> — ${esc(c.text)}</p>`).join('')}
    <p class="note">Vous ne pouvez pas utiliser Manœuvre (ou Contre-manœuvre) pour annuler exactement la Manœuvre
    (ou Contre-manœuvre) d'un autre joueur, sauf si au moins une autre action a été jouée depuis. L'interface
    n'affiche que les coups légaux.</p>
    <div class="actions"><button class="primary" id="btnRulesClose">Fermer</button></div>`;
  show('#rules', true);
  $('#btnRulesClose').onclick = () => show('#rules', false);
};

/* ------------------------------------------------------------------ */
/* Reprise après rechargement (mode en ligne)                          */
/* ------------------------------------------------------------------ */

(function boot() {
  const h = location.hash.replace(/^#/, '');
  if (h.includes(':')) {
    const [code, token] = h.split(':');
    connect(() => sendWs({ t: 'rejoin', code, token }));
  }
  $('#pname').focus();
})();
