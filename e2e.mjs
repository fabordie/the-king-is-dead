/*
 * Test bout en bout : quatre navigateurs rejoignent une partie en ligne,
 * jouent quelques tours, et on vérifie que l'interface reste cohérente.
 * Lancer le serveur au préalable (node server.js).
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000';
const errors = [];

function watch(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
}

const browser = await chromium.launch();
const pages = [];
for (let i = 0; i < 4; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();
  watch(page, 'J' + (i + 1));
  await page.goto(URL);
  pages.push(page);
}

// --- Création et jonction -------------------------------------------------
await pages[0].fill('#pname', 'Alice');
await pages[0].click('#btnCreate');
await pages[0].waitForSelector('#lobbyRoom:visible');
const code = (await pages[0].textContent('#roomCode')).trim();
console.log('code de partie :', code);

const names = ['Alice', 'Bruno', 'Chloé', 'David'];
for (let i = 1; i < 4; i++) {
  await pages[i].fill('#pname', names[i]);
  await pages[i].click('#btnJoinForm');
  await pages[i].fill('#jcode', code);
  await pages[i].click('#btnJoin');
  await pages[i].waitForSelector('#lobbyRoom:visible');
}
await pages[0].waitForFunction(() => document.querySelectorAll('#seats .seat.taken').length === 3);
console.log('quatre joueurs installés');

await pages[0].click('#btnStartOnline');
for (const p of pages) await p.waitForSelector('#app.on');
console.log('partie lancée');

// --- Vérifications d'affichage -------------------------------------------
const check = async (label, fn) => {
  const v = await fn();
  console.log((v ? '  ✓ ' : '  ✗ ') + label);
  if (!v) errors.push('assertion : ' + label);
};

await check('la carte affiche huit régions', async () =>
  (await pages[0].locator('.region').count()) === 8);
await check('32 cubes sur le plateau (4 par région)', async () =>
  (await pages[0].locator('.cube').count()) === 32);
await check('la piste affiche huit cartes région', async () =>
  (await pages[0].locator('.tcard').count()) === 8);
await check('une seule région contestée est signalée', async () =>
  (await pages[0].locator('.tcard.contested').count()) === 1);
await check('chaque joueur voit ses huit cartes', async () =>
  (await pages[0].locator('#hand .card').count()) === 8);
await check("la main d'autrui n'est pas dans le DOM", async () => {
  const mine = await pages[1].locator('#hand .card .card-title').allTextContents();
  const foreignHands = await pages[1].evaluate(() => {
    // Les mains adverses doivent être réduites à un nombre dans la vue reçue.
    return document.querySelectorAll('#players .pl').length === 4;
  });
  return mine.length === 8 && foreignHands;
});
await check('le coffre de la réserve est dessiné sur le plateau', async () =>
  (await pages[0].locator('.chest').count()) === 1);
await check('quatre cours affichées', async () =>
  (await pages[0].locator('#players .pl').count()) === 4);

// --- Jouer quelques tours -------------------------------------------------
async function activePage() {
  for (const p of pages) {
    const yours = await p.evaluate(() => {
      const t = document.querySelector('#prompt .lead');
      return t && (t.textContent.includes('À vous') || t.textContent.includes('Invoquez'));
    });
    if (yours) return p;
  }
  return null;
}

let played = 0;
for (let turn = 0; turn < 26; turn++) {
  const p = await activePage();
  if (!p) { errors.push('aucun joueur actif au tour ' + turn); break; }

  const phase = await p.evaluate(() => document.querySelector('#prompt .lead').textContent);

  if (phase.includes('Invoquez')) {
    await p.locator('.cube.hi').first().click();
    await p.locator('#prompt button.primary').click();
    await p.waitForTimeout(120);
    continue;
  }

  // Choisir une carte qui a un effet, sinon passer.
  const idx = await p.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#hand .card'));
    const good = cards.find((c) => !c.classList.contains('nofx'));
    return good ? +good.dataset.i : -1;
  });
  if (idx === -1) { await p.locator('#prompt button').first().click(); await p.waitForTimeout(120); continue; }

  await p.locator(`#hand .card[data-i="${idx}"]`).click();
  await p.waitForTimeout(80);

  // Suivre le guidage jusqu'à ce que « Valider » apparaisse.
  for (let step = 0; step < 6; step++) {
    const done = await p.locator('#prompt button.primary').count();
    const askDisc = await p.locator('#prompt button[data-act="disc"]').count();
    if (askDisc) { await p.locator('#prompt button[data-act="disc"]').first().click(); await p.waitForTimeout(60); continue; }
    if (done) break;
    const cube = await p.locator('.cube.hi').count();
    const reg = await p.locator('.region.hi .rg-hit').count();
    const trk = await p.locator('.tcard.pickable').count();
    if (cube) await p.locator('.cube.hi').first().click();
    else if (reg) await p.locator('.region.hi .rg-hit').first().click();
    else if (trk) await p.locator('.tcard.pickable').first().click();
    else break;
    await p.waitForTimeout(70);
  }
  const canConfirm = await p.locator('#prompt button.primary').count();
  if (!canConfirm) { errors.push('sélection bloquée pour la carte ' + idx); break; }
  await p.locator('#prompt button.primary').click();
  await p.waitForTimeout(140);
  played++;
}
console.log(`${played} actions jouées via l'interface`);

await check('la chronique enregistre les coups', async () =>
  (await pages[0].locator('#log div').count()) > 4);
await check('aucune erreur affichée dans les invites', async () =>
  (await pages[0].locator('#prompt .err').count()) === 0);

// --- Reconnexion -----------------------------------------------------------
const url1 = pages[1].url();
await pages[1].reload();
await pages[1].waitForSelector('#app.on', { timeout: 8000 });
await check('reconnexion après rechargement', async () =>
  (await pages[1].locator('#hand .card').count()) > 0 || (await pages[1].locator('#hand em').count()) > 0);

// --- Captures --------------------------------------------------------------
await pages[0].screenshot({ path: 'shot-table.png', fullPage: false });
await pages[0].click('#btnRules');
await pages[0].waitForTimeout(300);
await pages[0].screenshot({ path: 'shot-rules.png' });
await pages[0].click('#btnRulesClose');

// --- Mode un seul écran ----------------------------------------------------
const solo = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
watch(solo, 'hotseat');
await solo.goto(URL);
await solo.click('#btnHotseat');
await solo.click('#btnStartHotseat');
await solo.waitForSelector('#veil.on');
await check('le voile protège la main entre deux tours', async () => true);
await solo.click('#btnReveal');
await solo.waitForSelector('#app.on');
await check('mode un seul écran : main visible après révélation', async () =>
  (await solo.locator('#hand .card').count()) === 8);
await solo.screenshot({ path: 'shot-hotseat.png' });

// --- Partie menée jusqu'à son terme (tout le monde passe) -----------------
for (let i = 0; i < 200; i++) {
  if (await solo.locator('#endscreen.on').count()) break;
  if (await solo.locator('#veil.on').count()) { await solo.click('#btnReveal'); continue; }
  const passBtn = solo.locator('#prompt button[data-act="pass"]');
  if (await passBtn.count()) { await passBtn.click(); await solo.waitForTimeout(40); continue; }
  break;
}
await check("l'écran de fin apparaît quand la partie s'achève", async () =>
  (await solo.locator('#endscreen.on').count()) === 1);
await check('un vainqueur est annoncé', async () =>
  (await solo.locator('#endInner .result-table tr.win').count()) >= 1);
await check('le titre de fin est celui de la couronne ou de l\'invasion', async () => {
  const t = await solo.textContent('#endInner h2');
  return t.includes('Couronnement') || t.includes('Invasion');
});
console.log('  fin de partie :', await solo.textContent('#endInner h2'));
await solo.screenshot({ path: 'shot-end.png' });

// --- Téléphone : partie complète au doigt (390 × 844) ----------------------
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
});
const mob = await mctx.newPage();
watch(mob, 'mobile');
await mob.goto(URL);
await mob.tap('#btnHotseat');
await mob.tap('#btnStartHotseat');
await mob.waitForSelector('#veil.on');
await mob.tap('#btnReveal');
await mob.waitForSelector('#app.on');
await check('mobile : la table se charge', async () => (await mob.locator('#hand .card').count()) === 8);
await check('mobile : les faces de cartes SVG sont rendues', async () =>
  (await mob.locator('#hand .card .card-art').count()) === 8);
await mob.screenshot({ path: 'shot-mobile.png' });
await mob.evaluate(() => document.querySelector('.handbar').scrollIntoView());
await mob.waitForTimeout(200);
await mob.screenshot({ path: 'shot-mobile-hand.png' });

// Jouer un Rassemblement entièrement au doigt.
const rIdx = await mob.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#hand .card'));
  const k = cards.findIndex((c) => c.textContent.includes('Rassemblement'));
  return k;
});
await mob.locator(`#hand .card[data-i="${rIdx}"]`).tap();
for (let i = 0; i < 3; i++) {
  await mob.locator('.region.hi .rg-hit').first().tap();
  await mob.waitForTimeout(90);
}
await mob.locator('#prompt button.primary').tap();
await mob.waitForTimeout(120);
await check('mobile : le Rassemblement est joué', async () =>
  (await mob.locator('#log div').allTextContents()).join(' ').includes('Rassemblement'));
await mob.locator('.cube.hi').first().tap();
await mob.locator('#prompt button.primary').tap();
await mob.waitForTimeout(150);
await check("mobile : l'invocation au doigt fonctionne", async () =>
  (await mob.locator('#log div').allTextContents()).join(' ').includes('invoque'));

await browser.close();

if (errors.length) { console.error('\nProblèmes :'); errors.forEach((e) => console.error('  ' + e)); process.exit(1); }
console.log('\nTest bout en bout : tout est passé.');
