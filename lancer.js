/*
 * Lanceur avec menu — démarre le serveur et ouvre le jeu, sans ligne de commande.
 * Double-cliquez sur Jouer.bat (Windows), Jouer.command (macOS) ou jouer.sh
 * (Linux) ; ou lancez « npm run menu ».
 */

import { spawn, execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { networkInterfaces } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

const BASE_PORT = Number(process.env.PORT || 3000);
const IS_WIN = process.platform === 'win32';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', B = '\x1b[1m', O = '\x1b[0m', D = '\x1b[2m';

function banner() {
  console.clear();
  console.log(`${Y}${B}
   ══════════════════════════════════════════
        T H E   K I N G   I S   D E A D
          le roi est mort — à vous le trône
   ══════════════════════════════════════════${O}
`);
}

/** Ouvre l'URL dans le navigateur par défaut, selon le système. */
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); }
  catch { console.log(`${D}Ouvrez ${url} dans votre navigateur.${O}`); }
}

/**
 * Adresses IPv4 locales, par ordre de vraisemblance : Wi-Fi d'abord, puis
 * Ethernet, en écartant les cartes virtuelles (VirtualBox, WSL, VPN…).
 */
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (/virtual|vmware|vethernet|wsl|docker|loopback|hyper-v|tap|tun/i.test(name)) continue;
    for (const it of list || []) {
      if ((it.family === 'IPv4' || it.family === 4) && !it.internal) out.push({ name, address: it.address });
    }
  }
  const score = (e) => (/wi-?fi|wlan/i.test(e.name) ? 4 : 0)
    + (/ethernet|eth/i.test(e.name) ? 2 : 0)
    + (e.address.startsWith('192.168.') ? 1 : 0);
  return out.sort((a, b) => score(b) - score(a));
}

/** Installe les dépendances au premier lancement (ou après une mise à jour). */
function ensureDeps() {
  const need = ['ws', 'qrcode-generator'].some(
    (d) => !fs.existsSync(path.join(__dirname, 'node_modules', d)));
  if (!need) return;
  console.log(`${D}Installation des dépendances…${O}`);
  execSync('npm install --omit=dev', { stdio: 'inherit' });
}

/** Ce port héberge-t-il déjà NOTRE jeu ? (page /health du serveur) */
async function gameAlreadyOn(port) {
  try {
    const r = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(900) });
    return r.ok && (await r.text()).trim() === 'ok';
  } catch { return false; }
}

/** Le port est-il libre ? (rien ne répond dessus) */
async function portFree(port) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(900) });
    return false;                 // quelque chose a répondu : occupé
  } catch { return true; }        // connexion refusée : libre
}

/**
 * Choisit le port : réutilise un serveur du jeu déjà lancé, sinon prend le
 * premier port libre à partir de BASE_PORT (une autre application peut
 * occuper 3000 — on ne plante plus, on glisse vers 3001, 3002…).
 */
async function pickPort() {
  for (let port = BASE_PORT; port < BASE_PORT + 10; port++) {
    if (await gameAlreadyOn(port)) return { port, reuse: true };
    if (await portFree(port)) return { port, reuse: false };
    console.log(`${D}Le port ${port} est occupé par une autre application — essai du suivant…${O}`);
  }
  throw new Error(`aucun port libre entre ${BASE_PORT} et ${BASE_PORT + 9}`);
}

/** Démarre le serveur de jeu sur le port donné et attend qu'il réponde. */
function startServer(port) {
  const child = spawn(process.execPath, ['server.js'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PORT: String(port) },
  });
  child.stdout.on('data', (d) => process.stdout.write(`${D}${d}${O}`));
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const probe = () => {
      fetch(`http://localhost:${port}/health`).then(() => resolve(child)).catch(() => {
        if (Date.now() - t0 > 15000) return reject(new Error('le serveur ne démarre pas'));
        setTimeout(probe, 300);
      });
    };
    setTimeout(probe, 300);
  });
}

/** Lance un tunnel public (localtunnel) et renvoie l'URL affichée. */
function startTunnel(port) {
  return new Promise((resolve) => {
    // Sous Windows, npx est un script .cmd : depuis Node 20+, il doit être
    // lancé via le shell (sinon « spawn EINVAL »). Arguments fixes : sans risque.
    const tun = spawn(IS_WIN ? 'npx.cmd' : 'npx',
      ['--yes', 'localtunnel', '--port', String(port)],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: IS_WIN });
    let done = false;
    const onData = (d) => {
      const m = String(d).match(/https:\/\/\S+/);
      if (m && !done) { done = true; resolve({ url: m[0], child: tun }); }
    };
    tun.stdout.on('data', onData);
    tun.stderr.on('data', onData);
    tun.on('exit', () => { if (!done) { done = true; resolve({ url: null, child: null }); } });
    setTimeout(() => { if (!done) { done = true; resolve({ url: null, child: tun }); } }, 25000);
  });
}

function keepAlive(children) {
  console.log(`\n${G}${B}La partie est servie.${O} ${D}Laissez cette fenêtre ouverte pendant que vous jouez.${O}`);
  console.log(`${D}Fermez-la (ou Ctrl+C) pour arrêter.${O}\n`);
  rl.close();
  const alive = children.filter(Boolean);
  const stop = () => { alive.forEach((c) => { try { c.kill(); } catch { /* déjà arrêté */ } }); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (alive.length === 0) {
    // Serveur réutilisé : rien à surveiller, on garde juste la fenêtre ouverte.
    setInterval(() => {}, 1 << 30);
  }
}

async function main() {
  banner();
  ensureDeps();

  console.log(`  ${B}1${O}  Jouer sur cet ordinateur ${D}(4 joueurs à tour de rôle, ou plusieurs onglets)${O}
  ${B}2${O}  Héberger une partie sur Internet ${D}(URL publique temporaire à partager)${O}
  ${B}3${O}  Héberger sur le réseau local ${D}(les 4 joueurs sur le même Wi-Fi)${O}
  ${B}4${O}  Quitter
`);
  const choice = (await ask(`Votre choix ${D}[1-4]${O} : `)).trim();

  if (choice === '4' || choice === '') { rl.close(); return; }

  if (!['1', '2', '3'].includes(choice)) {
    console.log(`${R}Choix inconnu.${O}`);
    rl.close();
    return;
  }

  let server = null;
  let port;
  try {
    const picked = await pickPort();
    port = picked.port;
    if (picked.reuse) {
      console.log(`${G}Un serveur du jeu tourne déjà sur le port ${port} — il est réutilisé.${O}`);
      console.log(`${D}(La partie en cours dessus, s'il y en a une, n'est pas touchée.)${O}`);
    } else {
      server = await startServer(port);
    }
  } catch (e) {
    console.log(`${R}Impossible de démarrer le serveur : ${e.message}${O}`);
    rl.close();
    return;
  }

  if (choice === '1') {
    const url = `http://localhost:${port}`;
    console.log(`\nAdresse locale : ${G}${url}${O}`);
    openBrowser(url);
    keepAlive([server]);
    return;
  }

  if (choice === '2') {
    console.log(`\n${D}Création du tunnel public (quelques secondes)…${O}`);
    const { url, child } = await startTunnel(port);
    if (!url) {
      console.log(`${R}Le tunnel n'a pas pu être créé (réseau ou npx indisponible).${O}`);
      console.log(`Repli : partagez votre écran, ou utilisez l'option 3 sur le même Wi-Fi.`);
      keepAlive([server]);
      return;
    }
    console.log(`
  ${B}Adresse à envoyer à vos trois partenaires :${O}
      ${G}${B}${url}${O}

  ${D}Chacun l'ouvre dans son navigateur, saisit son nom et rejoint avec
  le code de partie que vous verrez à l'écran. Si la page demande un
  mot de passe de tunnel, suivez l'instruction affichée (c'est votre
  adresse IP publique, montrée sur la page).${O}`);
    openBrowser(`http://localhost:${port}`);
    keepAlive([server, child]);
    return;
  }

  if (choice === '3') {
    const addrs = lanAddresses();
    console.log('');
    console.log('  ============================================================');
    if (addrs.length) {
      console.log('   ADRESSE A PARTAGER (appareils sur le meme Wi-Fi) :');
      console.log('');
      console.log(`       http://${addrs[0].address}:${port}`);
      if (addrs.length > 1) {
        console.log('');
        console.log('   Si elle ne repond pas, essayez :');
        for (const e of addrs.slice(1)) console.log(`       http://${e.address}:${port}   (${e.name})`);
      }
    } else {
      console.log('   Adresse locale introuvable automatiquement.');
      console.log('   Tapez « ipconfig » dans un autre terminal et cherchez');
      console.log('   « Adresse IPv4 » de votre carte Wi-Fi, puis partagez');
      console.log(`   http://CETTE-ADRESSE:${port}`);
    }
    console.log('  ============================================================');
    console.log('');
    console.log(`  ${D}L'adresse est aussi affichée dans l'écran « Créer une partie »`);
    console.log(`  du jeu. Si le pare-feu Windows demande une autorisation pour`);
    console.log(`  Node.js, acceptez (réseaux privés).${O}`);
    openBrowser(`http://localhost:${port}`);
    keepAlive([server]);
  }
}

main().catch((e) => { console.error(`${R}${e.stack || e}${O}`); process.exit(1); });
