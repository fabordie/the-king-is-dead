/*
 * Serveur de jeu — The King is Dead.
 *
 * Un seul processus : fichiers statiques + WebSocket sur le même port.
 * Le serveur est autoritaire : il détient l'état, revalide chaque coup via le
 * moteur, et n'envoie à chaque joueur qu'une vue filtrée de la partie.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

import { createGame, applyMove, viewFor, applyTheme } from './public/game.js';
import { chooseAiMove } from './public/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ */
/* Fichiers statiques                                                  */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Priorité aux vraies interfaces (Wi-Fi d'abord) et aux adresses domestiques. */
function scoreIface(e) {
  let s = 0;
  if (/wi-?fi|wlan/i.test(e.name)) s += 4;
  if (/ethernet|eth/i.test(e.name)) s += 2;
  if (e.address.startsWith('192.168.')) s += 1;
  return s;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/health') { res.writeHead(200); return res.end('ok'); }

  // Adresses du serveur sur le réseau local — affichées dans le salon pour
  // que l'hôte n'ait pas à les chercher dans la console.
  if (rel === '/lan') {
    const ips = [];
    for (const [name, list] of Object.entries(networkInterfaces())) {
      if (/virtual|vmware|vethernet|wsl|docker|loopback|hyper-v|tap|tun/i.test(name)) continue;
      for (const it of list || []) {
        if ((it.family === 'IPv4' || it.family === 4) && !it.internal) {
          ips.push({ name, address: it.address });
        }
      }
    }
    ips.sort((a, b) => scoreIface(b) - scoreIface(a));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ port: Number(PORT), ips }));
  }

  // La bibliothèque de QR code est servie depuis node_modules : le salon
  // affiche un QR de l'adresse locale pour éviter toute saisie au téléphone.
  if (rel === '/vendor/qrcode.js') {
    const qf = path.join(__dirname, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.js');
    return fs.readFile(qf, (err, data) => {
      if (err) { res.writeHead(404); return res.end('// qrcode-generator absent : npm install'); }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'max-age=86400' });
      res.end(data);
    });
  }

  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Interdit'); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

/* ------------------------------------------------------------------ */
/* Salons                                                              */
/* ------------------------------------------------------------------ */

/** @type {Map<string, Room>} */
const rooms = new Map();

/* ------------------------------------------------------------------ */
/* Sauvegarde : les salons sont écrits sur disque à chaque changement   */
/* (avec un léger délai de regroupement) et restaurés au démarrage.     */
/* Une partie survit ainsi à un crash ou à un redémarrage du serveur.   */
/* ------------------------------------------------------------------ */

const SAVE_FILE = process.env.SAVE_FILE || path.join(__dirname, 'parties.json');
let saveTimer = null;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveRooms, 1500);
}

function saveRooms() {
  saveTimer = null;
  try {
    const data = [];
    for (const room of rooms.values()) {
      data.push({
        code: room.code,
        host: room.host,
        touched: room.touched,
        state: room.state,
        players: room.players.map((p) => ({
          id: p.id, token: p.token, name: p.name, seat: p.seat,
          isBot: !!p.isBot, level: p.level,
        })),
        seatOfPlayer: [...room.seatOfPlayer],
        chat: room.chat,
      });
    }
    fs.writeFileSync(SAVE_FILE, JSON.stringify(data));
  } catch (e) {
    console.error('sauvegarde impossible :', e.message);
  }
}

function loadRooms() {
  try {
    if (!fs.existsSync(SAVE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    for (const r of data) {
      const room = new Room(r.code);
      room.host = r.host;
      room.touched = r.touched || Date.now();
      room.state = r.state;
      room.players = r.players.map((p) => ({ ...p, ws: null, connected: !!p.isBot }));
      room.seatOfPlayer = new Map(r.seatOfPlayer);
      room.chat = r.chat || [];
      // Le temps d'arrêt du serveur n'est facturé à personne.
      if (room.state && room.state.clock) room.state.clock.turnStart = Date.now();
      room.enginePlayers = room.players.filter((p) => p.seat !== null).sort((a, b) => a.seat - b.seat);
      rooms.set(r.code, room);
      if (room.state && room.state.phase !== 'finished') room.pumpBots();
    }
    if (rooms.size) console.log(`${rooms.size} salon(s) restauré(s) — les joueurs reprennent leur partie en rechargeant leur page.`);
  } catch (e) {
    console.error('restauration impossible :', e.message);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { if (saveTimer) clearTimeout(saveTimer); saveRooms(); process.exit(0); });
}
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O, pour la lecture au téléphone

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

class Room {
  constructor(code) {
    this.code = code;
    this.chat = [];         // messagerie du salon (60 derniers messages)
    this.players = [];      // { id, token, name, seat, ws, connected }
    this.host = null;
    this.state = null;      // état de partie une fois lancée
    this.seatOfPlayer = new Map(); // id joueur → siège dans le moteur
    this.touched = Date.now();
  }

  get started() { return this.state !== null; }

  find(id) { return this.players.find((p) => p.id === id); }

  broadcastRoom() {
    scheduleSave();
    const players = this.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, connected: p.connected, isBot: !!p.isBot }));
    for (const p of this.players) {
      if (p.isBot) continue;
      send(p.ws, { t: 'room', code: this.code, youId: p.id, token: p.token, players, host: this.host, started: this.started });
    }
  }

  broadcastState() {
    if (!this.state) return;
    scheduleSave();
    for (const p of this.players) {
      if (p.isBot) continue;
      const seat = this.seatOfPlayer.get(p.id);
      if (seat === undefined) continue;
      send(p.ws, { t: 'state', view: viewFor(this.state, seat) });
    }
  }

  /** Fait jouer les IA tant que c'est leur tour, avec un délai naturel. */
  pumpBots() {
    if (this.botTimer || !this.state || this.state.phase === 'finished') return;
    const pl = this.enginePlayers && this.enginePlayers[this.state.current];
    if (!pl || !pl.isBot) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const st = this.state;
      if (!st || st.phase === 'finished') return;
      const cur = this.enginePlayers[st.current];
      if (!cur || !cur.isBot) return;
      try {
        applyTheme(st.themeId);
        const mv = chooseAiMove(st, st.current, cur.level || 'normale');
        applyMove(st, st.current, mv);
      } catch {
        try { applyMove(st, st.current, { type: 'pass' }); } catch { /* rien */ }
      }
      this.touched = Date.now();
      this.broadcastState();
      this.pumpBots();
    }, 800);
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(msg)); } catch { /* ignoré */ } }
}
function fail(ws, message) { send(ws, { t: 'error', message }); }

/* ------------------------------------------------------------------ */
/* WebSocket                                                           */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({ server });
// Sans ce handler, une erreur du serveur HTTP (port occupé…) est réémise par
// le serveur WebSocket et fait planter le processus avant notre message propre.
wss.on('error', () => { /* traitée par server.on('error') */ });

// Les navigateurs mobiles coupent souvent le WebSocket sans le fermer
// proprement (veille de l'écran). Un ping toutes les 30 s repère les
// connexions mortes ; le joueur revient par la reconnexion automatique.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch { /* déjà close */ } continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* ignoré */ }
  }
}, 30000);

wss.on('connection', (ws) => {
  ws.ctx = { roomCode: null, playerId: null };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    try { handle(ws, msg); } catch (e) { fail(ws, e.message || 'Erreur inattendue.'); }
  });

  ws.on('close', () => {
    const { roomCode, playerId } = ws.ctx;
    const room = rooms.get(roomCode);
    if (!room) return;
    const p = room.find(playerId);
    if (p) { p.connected = false; p.ws = null; }
    room.broadcastRoom();
    // Salon vide et jamais lancé : on le supprime tout de suite.
    if (!room.started && room.players.every((x) => !x.connected)) rooms.delete(roomCode);
  });
});

function handle(ws, msg) {
  switch (msg.t) {
    case 'create': return onCreate(ws, msg);
    case 'join': return onJoin(ws, msg);
    case 'rejoin': return onRejoin(ws, msg);
    case 'seat': return onSeat(ws, msg);
    case 'addbot': return onAddBot(ws, msg);
    case 'removebot': return onRemoveBot(ws, msg);
    case 'start': return onStart(ws, msg);
    case 'move': return onMove(ws, msg);
    case 'chat': return onChat(ws, msg);
    default: return fail(ws, 'Message inconnu.');
  }
}

function cleanName(n) {
  return String(n || '').trim().slice(0, 18) || 'Anonyme';
}

function attach(ws, room, player) {
  ws.ctx = { roomCode: room.code, playerId: player.id };
  player.ws = ws;
  player.connected = true;
  room.touched = Date.now();
  if (room.chat.length) send(ws, { t: 'chatlog', log: room.chat });
}

function onCreate(ws, msg) {
  const room = new Room(newCode());
  rooms.set(room.code, room);
  const player = { id: randomUUID(), token: randomBytes(9).toString('hex'), name: cleanName(msg.name), seat: 0, ws, connected: true };
  room.players.push(player);
  room.host = player.id;
  attach(ws, room, player);
  room.broadcastRoom();
}

function onJoin(ws, msg) {
  const room = rooms.get(String(msg.code || '').toUpperCase());
  if (!room) return fail(ws, "Aucune partie ne porte ce code.");
  if (room.started) return fail(ws, 'La partie a déjà commencé.');
  if (room.players.length >= 4) return fail(ws, 'La table est complète (quatre joueurs).');
  const taken = new Set(room.players.map((p) => p.seat));
  const seat = [0, 1, 2, 3].find((s) => !taken.has(s));
  const player = { id: randomUUID(), token: randomBytes(9).toString('hex'), name: cleanName(msg.name), seat: seat ?? null, ws, connected: true };
  room.players.push(player);
  attach(ws, room, player);
  room.broadcastRoom();
}

function onRejoin(ws, msg) {
  const room = rooms.get(String(msg.code || '').toUpperCase());
  if (!room) return fail(ws, "Cette partie n'existe plus.");
  const player = room.players.find((p) => p.token === msg.token);
  if (!player) return fail(ws, 'Jeton de reconnexion inconnu.');
  attach(ws, room, player);
  room.broadcastRoom();
  if (room.started) room.broadcastState();
}

function onSeat(ws, msg) {
  const room = rooms.get(ws.ctx.roomCode);
  if (!room || room.started) return fail(ws, 'Impossible de changer de place maintenant.');
  const me = room.find(ws.ctx.playerId);
  if (!me) return;
  const seat = Number(msg.seat);
  if (!(seat >= 0 && seat <= 3)) return fail(ws, 'Siège invalide.');
  const occupant = room.players.find((p) => p.seat === seat);
  if (occupant && occupant.id !== me.id) return fail(ws, 'Ce siège est déjà pris.');
  me.seat = seat;
  room.broadcastRoom();
}

function onAddBot(ws, msg) {
  const room = rooms.get(ws.ctx.roomCode);
  if (!room || room.started) return fail(ws, 'Impossible d\'ajouter une IA maintenant.');
  if (room.host !== ws.ctx.playerId) return fail(ws, "Seul l'hôte peut ajouter une IA.");
  const seat = Number(msg.seat);
  if (!(seat >= 0 && seat <= 3)) return fail(ws, 'Siège invalide.');
  if (room.players.some((p) => p.seat === seat)) return fail(ws, 'Ce siège est occupé.');
  if (room.players.length >= 4) return fail(ws, 'La table est complète.');
  const n = room.players.filter((p) => p.isBot).length + 1;
  room.players.push({
    id: randomUUID(), token: null, name: `IA ${n}`, seat,
    ws: null, connected: true, isBot: true, level: msg.level === 'facile' ? 'facile' : 'normale',
  });
  room.broadcastRoom();
}

function onRemoveBot(ws, msg) {
  const room = rooms.get(ws.ctx.roomCode);
  if (!room || room.started) return fail(ws, 'Impossible de retirer une IA maintenant.');
  if (room.host !== ws.ctx.playerId) return fail(ws, "Seul l'hôte peut retirer une IA.");
  const i = room.players.findIndex((p) => p.isBot && p.seat === Number(msg.seat));
  if (i === -1) return fail(ws, 'Aucune IA sur ce siège.');
  room.players.splice(i, 1);
  room.broadcastRoom();
}

function onStart(ws, msg) {
  const room = rooms.get(ws.ctx.roomCode);
  if (!room) return fail(ws, 'Salon introuvable.');
  if (room.host !== ws.ctx.playerId) return fail(ws, "Seul l'hôte peut lancer la partie.");
  if (room.started) return fail(ws, 'La partie est déjà lancée.');

  const seated = room.players.filter((p) => p.seat !== null).sort((a, b) => a.seat - b.seat);
  if (seated.length < 2) return fail(ws, 'Il faut au moins deux joueurs installés.');

  // Les sièges sont compactés en 0..n-1 en conservant l'ordre horaire :
  // à quatre, les sièges 1 et 3 restent opposés, donc coéquipiers.
  // L'hôte choisit le mode à quatre : équipes (officiel) ou chacun pour soi.
  if (!seated.some((p) => !p.isBot)) return fail(ws, 'Il faut au moins un joueur humain.');

  room.state = createGame(seated.map((p) => ({ id: p.id, name: p.name })),
    (Math.random() * 1e9) | 0, { teams: msg.teams !== false, theme: msg.theme });
  seated.forEach((p, i) => room.seatOfPlayer.set(p.id, i));
  room.enginePlayers = seated;
  room.broadcastRoom();
  room.broadcastState();
  console.log(`[${room.code}] partie lancée — ${seated.map((p) => p.name + (p.isBot ? ' (IA)' : '')).join(', ')}`);
  room.pumpBots();
}

function onChat(ws, msg) {
  const room = rooms.get(ws.ctx.roomCode);
  if (!room) return;
  const me = room.find(ws.ctx.playerId);
  if (!me || me.isBot) return;
  const text = String(msg.text || '').trim().slice(0, 300);
  if (!text) return;
  const entry = { from: me.name, seat: me.seat, text, ts: Date.now() };
  room.chat.push(entry);
  if (room.chat.length > 60) room.chat.shift();
  room.touched = Date.now();
  scheduleSave();
  for (const p of room.players) {
    if (!p.isBot) send(p.ws, { t: 'chat', ...entry });
  }
}

function onMove(ws, msg) {
  const room = rooms.get(ws.ctx.roomCode);
  if (!room || !room.started) return fail(ws, 'Aucune partie en cours.');
  const seat = room.seatOfPlayer.get(ws.ctx.playerId);
  if (seat === undefined) return fail(ws, "Vous n'êtes pas assis à cette table.");
  try {
    applyTheme(room.state.themeId);
    applyMove(room.state, seat, msg.move);
  } catch (e) {
    return fail(ws, e.message);
  }
  room.touched = Date.now();
  room.broadcastState();
  room.pumpBots();
}

/* ------------------------------------------------------------------ */
/* Ménage : salons abandonnés depuis plus de six heures                */
/* ------------------------------------------------------------------ */

setInterval(() => {
  const cutoff = Date.now() - 6 * 3600 * 1000;
  for (const [code, room] of rooms) {
    if (room.touched < cutoff && room.players.every((p) => !p.connected)) rooms.delete(code);
  }
}, 15 * 60 * 1000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Le port ${PORT} est déjà utilisé — une autre partie tourne peut-être.`);
    console.error(`Fermez-la, ou relancez avec un autre port : PORT=3001 npm start`);
    process.exit(1);
  }
  throw err;
});

loadRooms();

server.listen(PORT, () => {
  console.log(`The King is Dead — serveur prêt sur http://localhost:${PORT}`);
});
