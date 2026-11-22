// Tests automatiques de l'interface : node tests/interface.js
// Lance une carte vide (dossier de données temporaire, MQTT injoignable), crée le compte administrateur,
// puis ouvre la page dans Chromium (Playwright) et vérifie que l'essentiel marche : aucune erreur JavaScript,
// styles appliqués, onglets, aide, recherche (Ctrl+K, code DFCI), mode anglais sans restes de français,
// carte publique et graphe des liens. Code de sortie 1 au premier problème, avec une capture d'écran.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('Playwright manquant : npm i --no-save playwright && npx playwright install --with-deps chromium'); process.exit(2); }

const PORT = Number(process.env.PORT_ESSAI || 8399);
const BASE = `http://127.0.0.1:${PORT}`;
const donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'carte-essai-'));
const sorties = path.join(__dirname, 'resultats');
fs.mkdirSync(sorties, { recursive: true });
const ADMIN = { identifiant: 'essai', motDePasse: 'essai-' + Math.random().toString(36).slice(2, 12) };

let serveur, navigateur, echecs = 0;
const ok = (m) => console.log('  ✓ ' + m);
const ko = (m) => { echecs++; console.log('  ✗ ' + m); };

// Foyers satellites de démonstration (la carte ne lit pas NASA FIRMS pendant l'essai)
fs.writeFileSync(path.join(donnees, 'feux.json'), JSON.stringify({ maj: Date.now(), foyers: [
  { lat: 45.05, lon: 3.9, heure: Date.now() - 3600000, source: 'VIIRS NOAA-20', confiance: 'haute', frp: 9.5, nuit: false },
  { lat: 43.5, lon: 5.2, heure: Date.now() - 20 * 3600000, source: 'MODIS', confiance: 'normale', frp: 3, nuit: true },
  { lat: 44.9, lon: 4.1, heure: Date.now() - 1800000, source: 'Meteosat SEVIRI', geo: true, confiance: 'haute', frp: 20, nuit: null },
] }));
function demarrerServeur() {
  serveur = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), FICHIER_BASE: path.join(donnees, 'carte-live.db'), MQTT_URL: 'mqtt://127.0.0.1:1', DEPARTEMENT: '43', MESHCORE: 'oui', ADMIN_MOT_DE_PASSE: '', AGENTS_PORT: String(PORT + 5), SMTP_HOTE: 'fichier', CARTE_ADRESSE: 'https://carte.essai', STATS_PAYS: 'non', RELIEF_MONDE_ERDDAP: 'http://127.0.0.1:1/erddap' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream(path.join(sorties, 'serveur.log'));
  serveur.stdout.pipe(log); serveur.stderr.pipe(log);
}
async function attendreServeur() {
  for (let k = 0; k < 60; k++) {
    try { const r = await fetch(BASE + '/api/installation'); if (r.ok) return; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('le serveur ne répond pas (voir tests/resultats/serveur.log)');
}
async function creerAdmin() {
  const r = await fetch(BASE + '/api/installation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ compte: ADMIN }) });
  if (!r.ok) throw new Error('installation : ' + (await r.text()));
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie.includes('=')) throw new Error('installation : pas de cookie de session');
  const [nom, valeur] = cookie.split('=');
  return { name: nom, value: valeur, domain: '127.0.0.1', path: '/' };
}

// Page ouverte avec surveillance des erreurs JavaScript et des réponses 5xx
async function ouvrir(contexte, url) {
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('JS : ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|tile|tuile/i.test(m.text())) erreurs.push('console : ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 500 && r.url().startsWith(BASE)) erreurs.push(`HTTP ${r.status()} : ${r.url().slice(BASE.length)}`); });
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  return { page, erreurs };
}
async function capture(page, nom) { try { await page.screenshot({ path: path.join(sorties, nom + '.png') }); } catch { /* page fermée */ } }
function bilanErreurs(erreurs, quoi) {
  if (erreurs.length) ko(`${quoi} : ${erreurs.length} erreur(s)\n      ` + [...new Set(erreurs)].slice(0, 8).join('\n      '));
  else ok(`${quoi} : aucune erreur JavaScript`);
}

async function essaiCarteFrancais(contexte) {
  console.log('Carte (administrateur, français)');
  const { page, erreurs } = await ouvrir(contexte, '/');
  // Styles chargés : le bandeau du haut n'a pas le fond blanc par défaut et les boutons sont stylés
  const styles = await page.evaluate(() => {
    const b = document.querySelector('.onglets button') || document.querySelector('button');
    const cs = b && getComputedStyle(b);
    return { fond: getComputedStyle(document.body).backgroundColor, bouton: cs && cs.backgroundColor, bord: cs && cs.borderTopStyle, feuilles: document.styleSheets.length };
  });
  if (styles.feuilles && styles.fond !== 'rgba(0, 0, 0, 0)' && styles.fond !== 'rgb(255, 255, 255)' && styles.bouton && styles.bouton !== 'rgb(239, 239, 239)') ok('feuille de style appliquée');
  else ko('feuille de style non appliquée : ' + JSON.stringify(styles));
  if (await page.locator('#carte .leaflet-pane').count()) ok('carte Leaflet affichée'); else ko('carte Leaflet absente');
  if (await page.locator('#dlg-installation[open]').count()) ko('l’assistant d’installation s’ouvre alors que le compte existe');
  // Rubriques (barre du haut du panneau) puis onglets de la rubrique Réseau
  const groupe = async (g) => { const b = page.locator(`.groupes [data-groupe="${g}"]`); if (!(await b.count()) || !(await b.isVisible())) return false; await b.click(); await page.waitForTimeout(400); return true; };
  for (const [g, vue] of [['messages', 'messages'], ['couverture', 'sites'], ['gerer', 'gestion'], ['reglages', 'reglages'], ['reseau', 'reseau']]) {
    if (!(await groupe(g))) { ko(`rubrique ${g} invisible pour l’administrateur`); continue; }
    if (await page.locator(`section[data-vue="${vue}"].actif`).count()) ok(`rubrique ${g}`); else ko(`rubrique ${g} : la vue ${vue} ne s’affiche pas`);
  }
  for (const o of ['noeuds', 'trafic', 'analyse', 'reseau']) {
    const b = page.locator(`.onglets [data-onglet="${o}"]`);
    if (!(await b.count()) || !(await b.isVisible())) { ko(`onglet ${o} invisible`); continue; }
    await b.click();
    await page.waitForTimeout(300);
    if (await page.locator(`section[data-vue="${o}"].actif`).count()) ok(`onglet ${o}`); else ko(`onglet ${o} : la vue ne s’affiche pas`);
  }
  // Hub Réglages : la sauvegarde complète et la restauration y sont
  await groupe('reglages');
  const hub = await page.locator('#hub-reglages').innerText();
  if (/Sauvegarde complète/.test(hub) && /Restaurer une sauvegarde complète/.test(hub)) ok('Réglages : sauvegarde et restauration complètes'); else ko('Réglages : lignes de sauvegarde complète absentes');
  await groupe('reseau');
  // Aide : fiche ouverte avec la page du wiki
  await page.locator('#btn-aide').click();
  await page.waitForTimeout(1500);
  const aide = (await page.locator('#fiche:not([hidden]) #fiche-contenu').innerText().catch(() => '')).trim();
  if (aide.length > 200 && !/indisponible|Chargement/.test(aide.slice(0, 80))) ok('aide ouverte'); else ko('l’aide ne s’ouvre pas : ' + JSON.stringify(aide.slice(0, 100)));
  await capture(page, 'aide-fr');
  // Ctrl+K : recherche d'un réglage
  await page.locator('#carte').click({ position: { x: 300, y: 300 } }).catch(() => {});
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  if (await page.locator('#dlg-chercher[open]').count()) {
    await page.locator('#chercher-reglage').fill('mqtt');
    await page.waitForTimeout(300);
    const n = await page.locator('#resultats-reglage > *').count();
    if (n) ok(`Ctrl+K : ${n} résultat(s) pour « mqtt »`); else ko('Ctrl+K : aucun résultat pour « mqtt »');
  } else ko('Ctrl+K n’ouvre pas la recherche');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  // Recherche d'un code DFCI : carreau dessiné sur la carte
  await page.locator('#recherche-lieu').fill('KD42F7.5');
  await page.waitForTimeout(400);
  const r = await page.locator('#resultats-lieu li').first().innerText().catch(() => '');
  if (/DFCI/.test(r) && /KD42F7\.5/.test(r)) {
    await page.locator('#recherche-lieu').press('Enter');
    await page.waitForTimeout(800);
    const poly = await page.locator('#carte path[stroke="#ff5a1f"]').count();
    if (poly) ok('recherche DFCI : carreau tracé'); else ko('recherche DFCI : aucun contour sur la carte');
  } else ko('recherche DFCI : pas de résultat « DFCI » (obtenu : ' + JSON.stringify(r) + ')');
  // Couche des feux actifs
  const f = await page.evaluate(() => fetch('/api/feux').then((x) => x.json())).catch(() => ({}));
  if ((f.foyers || []).some((x) => x.lat === 45.05 && x.dfci)) ok(`feux actifs : ${f.foyers.length} foyer(s) servi(s), avec code DFCI`); else ko('feux actifs : ' + JSON.stringify(f).slice(0, 200));
  await page.evaluate(() => { const b = document.querySelector('.bascule[data-couche="feux"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  const nf = await page.locator('#carte path[fill="#ff1f1f"], #carte path[fill="#a0522d"]').count();
  const ng = await page.locator('#carte path[stroke-dasharray="5 4"]').count();
  if (ng >= 1) ok('feux actifs : foyer Meteosat dessiné (cercle de 2 km)'); else ko('feux actifs : foyer Meteosat absent');
  if (nf >= 2) ok(`feux actifs : couche affichée (${nf} foyers)`); else ko('feux actifs : ' + nf + ' foyer(s) dessiné(s)');
  await page.evaluate(() => { const b = document.querySelector('.bascule[data-couche="feux"]'); if (b) b.click(); });
  // Responsable d'un nœud et « pour le joindre »
  const rp = await page.evaluate(async () => {
    const post = await fetch('/api/noeuds/305419896/responsable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personne: 'F4XYZ Essai', contact: '06 00 00 00 00' }) }).then((x) => x.json());
    const l = await fetch('/api/responsables').then((x) => x.json());
    const j = await fetch('/api/noeuds/305419896/joindre').then((x) => x.json());
    return { post, l: l['305419896'], j };
  }).catch((e) => ({ erreur: e.message }));
  if (rp.l && rp.l.personne === 'F4XYZ Essai' && rp.l.contact) ok('responsable d’un nœud enregistré'); else ko('responsable : ' + JSON.stringify(rp).slice(0, 200));
  if (rp.j && Array.isArray(rp.j.lignes)) ok('pour le joindre : réponse valide'); else ko('pour le joindre : ' + JSON.stringify(rp.j).slice(0, 200));
  // Auteur d'un message cliquable : menu fiche / message direct / carte
  const menu = await page.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = boutonAuteur(305419896); document.body.appendChild(d);
    d.querySelector('[data-auteur]').click();
    const m = document.querySelector('.menu-noeud'); const t = m ? m.textContent : '';
    if (m) m.remove(); d.remove(); return t;
  }).catch((e) => 'erreur ' + e.message);
  if (/Fiche du nœud/.test(menu) && /Message direct/.test(menu)) ok('auteur de message : menu fiche et message direct'); else ko('auteur de message : ' + menu);
  // --- Non-régression : bugs signalés le 15/11 ---
  // 1. « Alertes météo » : la fiche s'affiche même sans choix de canaux mémorisé (et ne garde pas l'ancienne fiche)
  const ao = await page.evaluate(async () => {
    try { localStorage.removeItem('gaulix_canaux_envoi'); } catch { /* */ }
    $('#fiche-contenu').innerHTML = '<div id="ancienne-fiche">fiche d’un nœud supprimé</div>';
    ao.info = await fetch('/api/alertes-officielles').then((x) => x.json());
    let err = null; try { ficheAlertesOff(); } catch (e) { err = e.message; }
    return { err, ancienne: !!document.getElementById('ancienne-fiche'), alertes: !!document.querySelector('#fiche-contenu .alertes-off'), cache: $('#fiche').hidden };
  }).catch((e) => ({ err: e.message }));
  if (!ao.err && !ao.ancienne && ao.alertes && !ao.cache) ok('alertes météo : fiche affichée, l’ancienne fiche est remplacée'); else ko('alertes météo : ' + JSON.stringify(ao));
  // 2. Nouveaux messages : la pastille de la rubrique « Messages » suit le compteur aussitôt
  const nl = await page.evaluate(() => {
    nonLus['mc:public'] = 3; majBadgesMessages();
    const g = document.querySelector('.groupes button[data-groupe="messages"] .pastille-groupe');
    const t = g ? g.textContent : '';
    delete nonLus['mc:public']; majBadgesMessages();
    return { t, apres: !!document.querySelector('.groupes button[data-groupe="messages"] .pastille-groupe') };
  }).catch((e) => ({ t: 'erreur ' + e.message }));
  if (nl.t === '3' && !nl.apres) ok('nouveaux messages : pastille de la rubrique Messages'); else ko('pastille Messages : ' + JSON.stringify(nl));
  // 3. Programmer (MeshCore) : les opérations lancées par la carte elle-même sont marquées « automatique »
  const auto = await page.evaluate(async () => {
    const src = await fetch('/meshcore.js').then((x) => x.text());
    return /etiquette-auto/.test(src) && /🤖 automatique/.test(src);
  }).catch(() => false);
  if (auto) ok('programmer : opérations automatiques signalées'); else ko('programmer : étiquette « automatique » absente');
  // 4. Réglages avancés (variables du .env) : liste, fiche, refus d'une valeur hors bornes (sans redémarrer)
  const va = await page.evaluate(async () => {
    const l = await fetch('/api/reglages/variables').then((x) => x.json());
    const secretVisible = l.variables.some((v) => v.type === 'secret' && v.valeur !== undefined);
    const refus = await fetch('/api/reglages/variables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variables: { SEUIL_BATTERIE_POURCENT: '250' } }) });
    const inconnu = await fetch('/api/reglages/variables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variables: { PORT: '80' } }) });
    await ficheReglagesAvances();
    const n = document.querySelectorAll('#f-avances [data-va]').length;
    return { nb: l.variables.length, secretVisible, refus: refus.status, inconnu: inconnu.status, champs: n };
  }).catch((e) => ({ erreur: e.message }));
  if (va.nb > 30 && !va.secretVisible && va.refus === 400 && va.inconnu === 400 && va.champs === va.nb) ok(`réglages avancés : ${va.nb} réglages, secrets jamais renvoyés, valeurs hors bornes refusées`); else ko('réglages avancés : ' + JSON.stringify(va));
  // 5. Brokers supplémentaires réglables dans la fenêtre Broker MQTT ; adresse invalide refusée (sans redémarrer)
  const bk = await page.evaluate(async () => {
    const m = await fetch('/api/mqtt').then((x) => x.json());
    const refus = await fetch('/api/reglages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mqtt: { brokers: 'http://pas-un-broker' } }) });
    const masque = await fetch('/api/reglages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mqtt: { brokers: 'mqtts://nom:***@inconnu:8883' } }) });
    return { champ: typeof m.brokersReglage === 'string', refus: refus.status, masque: masque.status };
  }).catch((e) => ({ erreur: e.message }));
  if (bk.champ && bk.refus === 400 && bk.masque === 400) ok('brokers supplémentaires : réglables, adresses invalides refusées'); else ko('brokers supplémentaires : ' + JSON.stringify(bk));
  await capture(page, 'carte-fr');
  bilanErreurs(erreurs, 'carte en français');
  await page.close();
}

// En anglais : textes d'interface sans morceaux de français (hors noms et contenus des utilisateurs, translate="no")
const RESTES_FRANCAIS = /\bà day\b|\b(les|des|aucun|aucune|avec|pour|depuis|réglages|nœuds?|réseau|carte|signalements?|équipes?|couverture|télécharger|envoyer|supprimer|enregistrer|liens|passerelles?|dernières?|heures|jours|vus?|sauts?|reçus?|émis)\b/i;
async function textesVisibles(page, selecteur) {
  return page.evaluate((sel) => {
    const out = [];
    const racine = document.querySelector(sel) || document.body;
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (t.length < 3) continue;
      const el = n.parentElement;
      if (!el || el.closest('[translate="no"], script, style, .leaflet-control-attribution, .leaflet-map-pane, .mono, code')) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue; // caché
      out.push(t);
    }
    return out;
  }, selecteur);
}
async function essaiAnglais(contexte) {
  console.log('Carte en anglais');
  const { page, erreurs } = await ouvrir(contexte, '/');
  await page.evaluate(() => { localStorage.setItem('gaulix_langue', 'en'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  if ((await page.evaluate(() => document.documentElement.lang)) === 'en') ok('interface passée en anglais'); else ko('la langue anglaise ne s’applique pas');
  const restes = new Set();
  const relever = async () => { for (const t of await textesVisibles(page, 'body')) if (RESTES_FRANCAIS.test(t)) restes.add(t.slice(0, 120)); };
  for (const g of ['reseau', 'messages', 'couverture', 'gerer', 'reglages']) {
    const b = page.locator(`.groupes [data-groupe="${g}"]`);
    if (!(await b.count()) || !(await b.isVisible())) continue;
    await b.click();
    await page.waitForTimeout(700);
    await relever();
    if (g === 'reseau') for (const o of ['noeuds', 'trafic', 'analyse']) { const t = page.locator(`.onglets [data-onglet="${o}"]`); if (await t.isVisible().catch(() => false)) { await t.click(); await page.waitForTimeout(600); await relever(); } }
  }
  if (restes.size) ko(`${restes.size} texte(s) restés en français :\n      ` + [...restes].slice(0, 15).join('\n      '));
  else ok('aucun reste de français dans les onglets');
  await capture(page, 'carte-en');
  bilanErreurs(erreurs, 'carte en anglais');
  await page.evaluate(() => { localStorage.setItem('gaulix_langue', 'fr'); });
  await page.close();
}

// Mode consultation (lien « Explorer en détail ») : même connecté en administrateur, rien à modifier ni à émettre
async function essaiConsultation(contexte) {
  console.log('Carte détaillée en consultation (compte administrateur connecté)');
  const { page, erreurs } = await ouvrir(contexte, '/?consultation&vue=45.1,3.9,12');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const r = await page.evaluate(() => ({
    bandeau: !!document.querySelector('.bandeau-consultation'),
    admin: etat.admin || etat.gestion || etat.membre,
    gerer: !!document.querySelector('[data-groupe="gerer"]') && !!document.querySelector('[data-groupe="gerer"]').offsetParent,
    connecter: !!document.querySelector('#outil-connecter') && !!document.querySelector('#outil-connecter').offsetParent,
    zoom: carte.getZoom(),
  }));
  if (r.bandeau && r.gerer && !r.connecter) ok('consultation : bandeau affiché, tous les écrans, pas de module à relier'); else ko('consultation : ' + JSON.stringify(r));
  if (r.zoom === 12) ok('consultation : même vue que la carte publique'); else ko('consultation : zoom ' + r.zoom + ' au lieu de 12');
  await capture(page, 'consultation');
  bilanErreurs(erreurs, 'consultation');
  await page.close();
}

// Démonstration pour tout visiteur, sans compte : tous les écrans, secrets masqués, aucune écriture
async function essaiDemoVisiteur(navig) {
  console.log('Démonstration (visiteur sans compte)');
  const contexte = await navig.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/?consultation');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const r = await page.evaluate(async () => {
    const vis = (q) => { const e = document.querySelector(q); return !!e && !!e.offsetParent; };
    const reg = await fetch('/api/reglages').then((x) => x.status === 200 ? x.json() : x.status);
    const sansDemo = await fetch('/api/reglages', { headers: { 'X-Demo': '' } }).then((x) => x.status).catch(() => 0);
    const comptes = await fetch('/api/comptes').then((x) => x.status);
    let ecriture = 'acceptée';
    try { await fetch('/api/reglages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (e) { ecriture = e.message; }
    return { messages: vis('[data-groupe="messages"]'), gerer: vis('[data-groupe="gerer"]'), connexion: vis('#btn-admin'), canaux: reg && reg.canaux, mqttUtil: reg && reg.mqtt && reg.mqtt.utilisateur, sansDemo, comptes, ecriture };
  });
  if (r.messages && r.gerer && !r.connexion) ok('démonstration : Messages et Gérer visibles, pas de connexion ni d’inscription'); else ko('démonstration : ' + JSON.stringify(r));
  if (typeof r.canaux === 'string' && !/AQ==/.test(r.canaux) && [401, 403].includes(r.comptes)) ok('démonstration : réglages lisibles, clés masquées, comptes refusés'); else ko('démonstration (lecture) : ' + JSON.stringify(r));
  if (/Démonstration/.test(r.ecriture)) ok('démonstration : écriture bloquée'); else ko('démonstration : écriture ' + r.ecriture);
  await capture(page, 'demo');
  bilanErreurs(erreurs.filter((e) => !/HTTP 401|401/.test(e)), 'démonstration');
  await contexte.close();
}

// Modules USB simulés (Web Serial) : un module Meshtastic répond 0x94 0xC3, un companion MeshCore répond « > » code 13
function simulerUsb() {
  const ecoutes = { connect: [], disconnect: [] };
  class Port {
    constructor(genre) { this.genre = genre; this.readable = null; this.writable = null; }
    getInfo() { return { usbVendorId: 0x10c4, usbProductId: 0xea60 }; }
    async open() {
      if (this.readable) throw new DOMException('port already open', 'InvalidStateError');
      const p = this; let ctl;
      this.readable = new ReadableStream({ start(c) { ctl = c; } });
      this.fermer = () => { try { ctl.close(); } catch { /* déjà */ } };
      this.writable = new WritableStream({ write(o) {
        try {
          if (p.genre === 'mt' && o[0] === 0x94) ctl.enqueue(new Uint8Array([0x94, 0xc3, 0, 2, 8, 1]));
          if (p.genre === 'mc' && o[0] === 0x3c) ctl.enqueue(new Uint8Array([0x3e, 4, 0, 13, 9, 1, 2, 3]));
        } catch { /* flux fermé */ }
      } });
    }
    async close() { if (this.fermer) this.fermer(); this.readable = null; this.writable = null; }
    async setSignals() {}
  }
  const ports = [new Port('mt')];
  const serie = { getPorts: async () => ports.slice(), requestPort: async () => { throw new DOMException('aucun', 'NotFoundError'); }, addEventListener: (t, f) => ecoutes[t] && ecoutes[t].push(f) };
  Object.defineProperty(Navigator.prototype, 'serial', { get: () => serie, configurable: true });
  window.__usb = {
    brancher(genre) { const p = new Port(genre); ports.push(p); ecoutes.connect.forEach((f) => f({ target: p })); },
    debrancher(genre) { const i = ports.findIndex((p) => p.genre === genre); if (i < 0) return; const p = ports.splice(i, 1)[0]; ecoutes.disconnect.forEach((f) => f({ target: p })); },
  };
}

// Agent 1.7 « direct » simulé : il annonce un module déjà reconnu, la carte le relie tout de suite ; débranché, il disparaît.
// Puis l'agent prêt à l'emploi : le programme téléchargé porte l'adresse de la carte et le code à la fin.
// Nœuds d'un autre preset et écoute UDP : les panneaux s'ouvrent et s'affichent sans erreur
async function essaiRejoindre(navig, cookie) {
  console.log('Page « Rejoindre le réseau »');
  const entetes = { Cookie: `${cookie.name}=${cookie.value}`, 'Content-Type': 'application/json' };
  const avant = await fetch(BASE + '/api/rejoindre');
  if (avant.status === 404) ok('page Rejoindre : non publiée par défaut'); else ko('page Rejoindre publiée sans action de l’administrateur');
  const refus = await fetch(BASE + '/api/rejoindre/reglages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (refus.status === 401 || refus.status === 403) ok('page Rejoindre : réglages refusés sans compte'); else ko('page Rejoindre : réglages acceptés sans compte (' + refus.status + ')');
  const mauvais = await fetch(BASE + '/api/rejoindre/reglages', { method: 'POST', headers: entetes, body: JSON.stringify({ lienCanal: 'https://exemple.fr/x' }) });
  if (mauvais.status === 400) ok('page Rejoindre : lien de canal invalide refusé'); else ko('page Rejoindre : lien invalide accepté');
  const lien = 'https://meshtastic.org/e/#CgMSAQESBggBQANIAQ';
  const e = await fetch(BASE + '/api/rejoindre/reglages', { method: 'POST', headers: entetes, body: JSON.stringify({ actif: true, presentation: 'Bienvenue sur le réseau d’essai', lienCanal: lien, limiteSauts: 4, antennes: 'Antenne A\nAntenne B', donsLien: 'https://exemple.org/dons', mcFrequence: '869,618 MHz' }) });
  if (e.ok) ok('page Rejoindre : réglages enregistrés'); else ko('page Rejoindre : enregistrement refusé ' + e.status);
  const contexte = await navig.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/rejoindre');
  await page.waitForSelector('.canal .qr svg', { timeout: 10000 }).catch(() => {});
  const r = await page.evaluate(() => ({ texte: document.querySelector('main').textContent, qr: document.querySelectorAll('.qr svg').length, lien: (document.querySelector('a.bouton.principal') || {}).href, large: document.documentElement.scrollWidth > innerWidth + 1 }));
  if (r.qr === 2 && r.lien === lien) ok('page Rejoindre : QR du canal, lien vers l’appli, QR de la page'); else ko('page Rejoindre : QR ou lien manquant ' + JSON.stringify({ qr: r.qr, lien: r.lien }));
  if (/Limite de sauts/.test(r.texte) && /4/.test(r.texte) && /Antenne B/.test(r.texte) && /869,618 MHz/.test(r.texte) && /Soutenir le réseau/.test(r.texte) && /Les règles du réseau/.test(r.texte)) ok('page Rejoindre : sauts, rôles, règles, antennes, MeshCore, dons'); else ko('page Rejoindre : contenu incomplet');
  if (!r.large) ok('page Rejoindre : pas de défilement horizontal sur téléphone'); else ko('page Rejoindre : déborde en largeur sur téléphone');
  if (process.env.CAPTURE_REJOINDRE) await page.screenshot({ path: process.env.CAPTURE_REJOINDRE, fullPage: true });
  bilanErreurs(erreurs, 'page Rejoindre');
  // Réseau MeshCore seul : lien du canal et limite de sauts vides → pas de partie Meshtastic
  await fetch(BASE + '/api/rejoindre/reglages', { method: 'POST', headers: entetes, body: JSON.stringify({ lienCanal: '', limiteSauts: '' }) });
  const ctx2 = await navig.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' }); // nouveau contexte : /api/rejoindre est gardé 60 s en cache
  await ctx2.addInitScript(() => { try { localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const seul = await ouvrir(ctx2, '/rejoindre');
  await seul.page.waitForSelector('footer', { timeout: 10000 }).catch(() => {});
  const t2 = await seul.page.evaluate(() => document.querySelector('main').textContent);
  if (!/Régler votre nœud Meshtastic/.test(t2) && /Régler votre nœud MeshCore/.test(t2) && /LoRa · MeshCore/.test(t2)) ok('page Rejoindre : partie Meshtastic masquée quand elle est laissée vide'); else ko('page Rejoindre : partie Meshtastic affichée alors que vide');
  await ctx2.close();
  await fetch(BASE + '/api/rejoindre/reglages', { method: 'POST', headers: entetes, body: JSON.stringify({ lienCanal: lien, limiteSauts: 4 }) });
  const pub = await ouvrir(contexte, '/publique');
  await pub.page.waitForTimeout(1500);
  if (await pub.page.evaluate(() => !document.getElementById('lien-rejoindre').hidden)) ok('carte publique : bouton « Rejoindre le réseau »'); else ko('carte publique : bouton Rejoindre absent');
  await contexte.close();
}

async function essaiAutresPresets(navig, cookie) {
  console.log('Nœuds à inviter et écoute UDP');
  const contexte = await navig.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
  await contexte.addCookies([cookie]);
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const t = await page.evaluate(async () => { await ficheAutresPresets(); return document.querySelector('#fiche-contenu').textContent; });
  if (/Nœuds à inviter/.test(t) && /Votre réseau est en/.test(t) && /Modules sentinelles/.test(t)) ok('panneau « Nœuds à inviter » : preset du réseau, sentinelles, liste'); else ko('panneau « Nœuds à inviter » : ' + t.slice(0, 200));
  const bouton = await page.evaluate(() => { const b = document.querySelector('#outil-inviter'); return b ? !b.hidden : null; });
  if (bouton) ok('bouton « Nœuds à inviter » dans Outils pour l’administrateur'); else ko('bouton « Nœuds à inviter » absent');
  await page.evaluate(() => ouvrirBroker());
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => document.querySelector('#mqtt-contenu').textContent);
  if (/Modules du réseau local \(UDP\)/.test(b) && /Désactivé/.test(b)) ok('broker : rubrique « Modules du réseau local (UDP) », désactivée par défaut'); else ko('broker : rubrique UDP absente');
  bilanErreurs(erreurs, 'nœuds à inviter');
  await contexte.close();
}

async function essaiRegistreEtExports(navig, cookie) {
  console.log('Registre des relais, calculette des pertes, export KML');
  const contexte = await navig.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
  await contexte.addCookies([cookie]);
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const t = await page.evaluate(async () => { await ficheRegistreRelais(); return document.querySelector('#fiche-contenu').textContent; });
  if (/Registre des relais/.test(t) && /Autorisation/.test(t) && /Exporter le registre/.test(t)) ok('registre des relais : tableau, autorisations, export CSV'); else ko('registre des relais : ' + t.slice(0, 120));
  const calc = await page.evaluate(() => {
    const champ = document.querySelector('#form-profil input[name="pertes"]');
    const b = champ && champ.parentElement.querySelector('.calculette-btn');
    if (!b) return null;
    b.click();
    const p = champ.parentElement.querySelector('.calculette-pertes');
    p.querySelector('[data-c="long"]').value = '10'; p.querySelector('[data-c="conn"]').value = '2';
    p.querySelector('[data-c="long"]').dispatchEvent(new Event('input'));
    p.querySelector('[data-c="ok"]').click();
    return Number(champ.value);
  });
  if (calc > 2 && calc < 4) ok(`calculette des pertes : 10 m de RG213 + 2 connecteurs = ${calc} dB`); else ko('calculette des pertes : ' + calc);
  const kml = await (await fetch(BASE + '/api/export/reseau.kml')).text();
  const direct = await fetch(BASE + '/api/export/reseau-direct.kml');
  const derriereProxy = await (await fetch(BASE + '/api/export/reseau-direct.kml?origine=' + encodeURIComponent('https://127.0.0.1:' + PORT), { headers: { 'X-Forwarded-Host': '127.0.0.1:' + PORT } })).text();
  const autreHote = await (await fetch(BASE + '/api/export/reseau-direct.kml?origine=' + encodeURIComponent('https://exemple.org'))).text();
  if (/<href>https:\/\/127\.0\.0\.1:\d+\/api\/export\/reseau\.kml<\/href>/.test(derriereProxy) && !/exemple\.org/.test(autreHote)) ok('lien KML en direct : adresse https vue par le navigateur, autre hôte refusé'); else ko('lien KML en direct : ' + derriereProxy.slice(0, 200));
  if (/^<\?xml/.test(kml) && /<kml /.test(kml) && /Relais et passerelles/.test(kml) && /reseau\.kml/.test(await direct.text()) && /reseau-direct\.kml/.test(direct.headers.get('content-disposition') || '')) ok('export KML pour ATAK (réseau et lien en direct)'); else ko('export KML');
  bilanErreurs(erreurs, 'registre et exports');
  await contexte.close();
}
async function essaiAdministrationALaDemande(navig, cookie) {
  console.log('Écrans d’administration chargés à la demande');
  // Visiteur : le fichier d'administration n'est pas téléchargé
  const ctxV = await navig.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
  await ctxV.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const pv = await ctxV.newPage();
  let charge = false;
  pv.on('request', (r) => { if (/\/administration\.js/.test(r.url())) charge = true; });
  await pv.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await pv.waitForTimeout(4500);
  if (!charge) ok('visiteur : écrans d’administration non téléchargés'); else ko('visiteur : administration.js téléchargé');
  await ctxV.close();
  // Administrateur : chaque écran s'ouvre par son relais, sans erreur
  const contexte = await navig.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
  await contexte.addCookies([cookie]);
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  const essais = [
    ['ficheMaj', 'Mise à jour'], ['ouvrirBroker', 'MQTT'], ['ficheFrance', 'France'], ['ficheModeles', 'odèle'], ['ficheV28', '2.8'],
    ['ficheRegistreRelais', 'Registre des relais'], ['ficheAutresPresets', 'preset'],
  ];
  for (const [f, attendu] of essais) {
    const t = await page.evaluate(async (nom) => {
      try { await window[nom](); await new Promise((r) => setTimeout(r, 400)); } catch (e) { return 'ERREUR ' + e.message; }
      const d = document.querySelector('dialog[open]');
      const txt = (d ? d.textContent : '') + ' ' + document.querySelector('#fiche-contenu').textContent;
      document.querySelectorAll('dialog[open]').forEach((x) => x.close());
      return txt;
    }, f);
    if (!/^ERREUR/.test(t) && t.includes(attendu)) ok(`${f} : écran ouvert`); else ko(`${f} : ${t.slice(0, 140)}`);
  }
  // Cache du relief : espace occupé, purge, plafond et relief mondial dans l'écran du relief
  const cacheRel = await page.evaluate(async () => {
    await ficheFrance();
    for (let k = 0; k < 30 && !(document.querySelector('#bloc-cache-relief h3')); k++) await new Promise((r) => setTimeout(r, 200));
    const b = document.querySelector('#bloc-cache-relief');
    return b ? { titre: b.textContent.includes('Relief téléchargé'), purge: !!b.querySelector('#cr-tout'), plafond: !!b.querySelector('#cr-plafond'), grossier: !!b.querySelector('#cr-grossier') } : null;
  });
  if (cacheRel && cacheRel.titre && cacheRel.purge && cacheRel.plafond && cacheRel.grossier) ok('relief : espace occupé, purge, plafond et relief mondial affichés'); else ko('cache du relief : ' + JSON.stringify(cacheRel));
  const purgeVide = await page.evaluate(async () => { const r = await postJson('/api/relief/cache', { purger: { joursInactifs: 30 } }); return r && r.purge && Array.isArray(r.purge.supprimees) && r.principale && r.principale.code; });
  if (purgeVide) ok('purge du relief : réponse correcte, zone de la carte gardée'); else ko('purge du relief : réponse inattendue');
  const refuse = await fetch(BASE + '/api/relief/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purger: { tout: true } }) });
  if (refuse.status === 401) ok('purge du relief refusée sans connexion admin'); else ko('purge du relief sans connexion : HTTP ' + refuse.status);
  for (const pan of ['comptes', 'journal', 'sauvegardes', 'reglages', 'frequentation']) {
    const t = await page.evaluate(async (p) => { await ouvrirDlg(p); await new Promise((r) => setTimeout(r, 700)); const x = document.querySelector(`#pan-${p}`); const v = x ? x.textContent.trim().length : 0; document.querySelectorAll('dialog[open]').forEach((d) => d.close()); return v; }, pan);
    if (t > 20) ok(`gestion › ${pan} : rempli`); else ko(`gestion › ${pan} vide`);
  }
  // Message direct vers un nœud dont le module n'a pas la clé : avertissement avant l'envoi, canal proposé
  const avert = await page.evaluate(async () => {
    await preparerEnvoi(); const f = $('#form-envoi'); if (!f || f.hidden) return 'formulaire caché';
    const n = [...etat.noeuds.values()].find((x) => x.num !== (etat.radio && etat.radio.noeudLocal)) || { num: 0x1234567 };
    f.vers.insertAdjacentHTML('beforeend', `<option value="d${n.num}">test</option>`); f.vers.value = 'd' + n.num;
    envoi.clesConnues = new Set(); avertirCleDirect(); const a = !!$('#avert-cle') && /clé publique/.test($('#avert-cle').textContent);
    envoi.clesConnues = new Set([n.num]); avertirCleDirect(); const b = !$('#avert-cle');
    return a && b ? 'ok' : `a=${a} b=${b}`;
  });
  if (avert === 'ok') ok('message direct sans clé publique : averti avant l’envoi'); else ko('avertissement clé publique : ' + avert);
  const relais = await page.evaluate(() => ['ficheMaj', 'ouvrirBroker', 'editeurReglages', 'rendreComptes'].filter((n) => window[n].relais).length);
  if (relais === 0) ok('relais remplacés par les vraies fonctions'); else ko(`${relais} relais non remplacé(s)`);
  bilanErreurs(erreurs, 'administration à la demande');
  await contexte.close();
}
async function essaiVue3D(navig) {
  console.log('Vue 3D du réseau');
  const contexte = await navig.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_langue', 'en'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/relief3d.html');
  await page.waitForTimeout(2000);
  const v = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, carte: !!window.carte3d && !!document.querySelector('#carte3d canvas'), legende: document.querySelector('#legende').textContent }));
  if (v.carte) ok('vue 3D : carte MapLibre affichée'); else ko('vue 3D : carte absente');
  if (v.h1 === '3D network view' && /Good link/.test(v.legende) && !/Relais|Nœud/.test(v.legende)) ok('vue 3D : traduite en anglais'); else ko('vue 3D en anglais : ' + v.h1 + ' / ' + v.legende.slice(0, 80));
  await capture(page, 'vue-3d');
  bilanErreurs(erreurs, 'vue 3D');
  await contexte.close();
}
async function essaiProfil3D(navig) {
  console.log('Profil 3D d’une liaison');
  const contexte = await navig.newContext({ viewport: { width: 1280, height: 800 } });
  // Altitudes simulées (le service IGN n'est pas joignable pendant les essais) : une bosse au milieu qui coupe la visée
  const serie = [];
  for (let i = 0; i <= 40; i++) {
    const d = i * 250, sol = 800 + 400 * Math.exp(-(((i - 20) / 5) ** 2)), visee = 806 + (i / 40) * 100;
    serie.push({ d, sol, solCourbe: sol, visee, fresnel: i === 0 || i === 40 ? 0 : 20 * Math.sin((Math.PI * i) / 40) });
  }
  await contexte.route('**/api/profil?**', (r) => r.fulfill({ json: {
    a: { num: null, nom: 'Sommet A', lat: 45.05, lon: 3.85, sol: 800, antenne: 6 }, b: { num: null, nom: 'Sommet B', lat: 45.08, lon: 3.97, sol: 900, antenne: 6 },
    distanceKm: 10, sourceAltitude: 'essai', preset: 'LONG_FAST', parametres: { frequenceMHz: 869.525 }, serie,
    obstacle: { distanceKm: 5, degagementM: -350, v: 20 }, verdict: 'Obstruée par le relief à 5.0 km (350 m au-dessus de la ligne de visée)',
    bilan: { fspl: 111, diffraction: 30, puissanceRecue: -110, bruit: -117, sensibilite: -137, snrEstime: 7, snrLimite: -20, marge: 27 }, mesure: {},
  } }));
  const { page, erreurs } = await ouvrir(contexte, '/relief3d.html?profil=1&aLat=45.05&aLon=3.85&bLat=45.08&bLon=3.97&ha=6&hb=6');
  await page.waitForTimeout(2500);
  const v = await page.evaluate(() => {
    const c = window.carte3d;
    const src = c && c.getSource('profil-visee');
    return { couches: c ? ['profil-trace', 'profil-fresnel', 'profil-visee'].filter((id) => c.getLayer(id)).length : 0,
      troncons: src ? src.serialize().data.features.length : 0, h1: document.querySelector('h1').textContent,
      info: (document.querySelector('#profil-info') || {}).textContent || '', etiquettes: document.querySelectorAll('.etiq-profil').length,
      bloque: !!document.querySelector('.etiq-profil.bloque') };
  });
  if (v.couches === 3 && v.troncons >= 40) ok('profil 3D : visée, Fresnel et tracé dessinés'); else ko('profil 3D : ' + JSON.stringify(v));
  if (/Sommet A → Sommet B/.test(v.h1) && /Obstruée|Blocked/.test(v.info) && v.etiquettes === 3 && v.bloque) ok('profil 3D : titre, verdict et obstacle signalés'); else ko('profil 3D (textes) : ' + JSON.stringify(v));
  await capture(page, 'profil-3d');
  bilanErreurs(erreurs, 'profil 3D');
  await contexte.close();
}
async function essaiMotDePasseOublie(navig, cookie) {
  console.log('Mot de passe oublié (e-mail, lien de l’administrateur)');
  const H = { 'Content-Type': 'application/json', Cookie: `${cookie.name}=${cookie.value}` };
  const appel = async (m, url, b, h = H) => { const r = await fetch(BASE + url, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); return { statut: r.status, j: await r.json().catch(() => ({})), cookie: r.headers.get('set-cookie') }; };
  const SANS = { 'Content-Type': 'application/json' };
  const a1 = (await appel('POST', '/api/comptes', { identifiant: 'oubli-mail', motDePasse: 'Ancien-mdp-2026', email: 'oubli@exemple.fr' })).j;
  const a2 = (await appel('POST', '/api/comptes', { identifiant: 'oubli-admin', motDePasse: 'Ancien-mdp-2026' })).j;
  // Par e-mail : lien écrit dans courriels-essai (SMTP_HOTE=fichier), même réponse pour un compte inconnu
  const dossier = path.join(donnees, 'courriels-essai');
  const etat = (await appel('GET', '/api/mot-de-passe/oubli', null, SANS)).j;
  const r1 = await appel('POST', '/api/mot-de-passe/oubli', { identifiant: 'oubli@exemple.fr' }, SANS);
  const inconnu = await appel('POST', '/api/mot-de-passe/oubli', { identifiant: 'personne-de-ce-nom' }, SANS);
  const mails = fs.existsSync(dossier) ? fs.readdirSync(dossier) : [];
  const mail = mails.length ? JSON.parse(fs.readFileSync(path.join(dossier, mails[mails.length - 1]), 'utf8')) : {};
  const jeton = (/https:\/\/carte\.essai\/\?reinit=([\w-]+)/.exec(mail.text || '') || [])[1];
  if (etat.courriel && r1.statut === 200 && JSON.stringify(r1.j) === JSON.stringify(inconnu.j) && mails.length === 1 && mail.to && mail.to[0].address === 'oubli@exemple.fr' && jeton) ok('mot de passe oublié : lien envoyé par e-mail, même réponse pour un compte inconnu'); else ko('oubli par e-mail : ' + JSON.stringify({ etat, r1: r1.j, inconnu: inconnu.j, mails: mails.length, to: mail.to }));
  const court = await appel('POST', '/api/mot-de-passe/reinitialiser', { jeton, nouveau: 'court' }, SANS);
  const bon = await appel('POST', '/api/mot-de-passe/reinitialiser', { jeton, nouveau: 'Nouveau-mdp-2026' }, SANS);
  const encore = await appel('POST', '/api/mot-de-passe/reinitialiser', { jeton, nouveau: 'Autre-mdp-2026!' }, SANS);
  const ancien = await appel('POST', '/api/connexion', { identifiant: 'oubli-mail', motDePasse: 'Ancien-mdp-2026' }, SANS);
  const nouveau = await appel('POST', '/api/connexion', { identifiant: 'oubli-mail', motDePasse: 'Nouveau-mdp-2026' }, SANS);
  if (court.statut === 400 && bon.statut === 200 && bon.j.connecte && /gaulix_session=/.test(bon.cookie || '') && encore.statut === 400 && ancien.statut === 401 && nouveau.statut === 200) ok('mot de passe oublié : nouveau mot de passe par le lien, lien à usage unique, ancien refusé'); else ko('réinitialisation : ' + JSON.stringify({ court: court.statut, bon: bon.j, encore: encore.statut, ancien: ancien.statut, nouveau: nouveau.statut }));
  // Sans e-mail : demande signalée aux administrateurs, qui créent le lien
  await appel('POST', '/api/mot-de-passe/oubli', { identifiant: 'oubli-admin' }, SANS);
  const liste = (await appel('GET', '/api/comptes')).j;
  const vu = liste.find((c) => c.id === a2.id) || {};
  const lien = (await appel('POST', '/api/comptes/' + a2.id, { lienReinit: true })).j;
  const parAdmin = await appel('POST', '/api/mot-de-passe/reinitialiser', { jeton: lien.jeton, nouveau: 'Admin-donne-2026' }, SANS);
  const apres = ((await appel('GET', '/api/comptes')).j.find((c) => c.id === a2.id) || {});
  if (vu.reinitDemande && lien.jeton && parAdmin.statut === 200 && !apres.reinitDemande && fs.readdirSync(dossier).length === 1) ok('mot de passe oublié sans e-mail : demande visible des administrateurs, lien créé par l’administrateur'); else ko('oubli sans e-mail : ' + JSON.stringify({ demande: vu.reinitDemande, lien: !!lien.jeton, parAdmin: parAdmin.j, apres: apres.reinitDemande }));
  // Interface : lien « Mot de passe oublié ? » et page du lien reçu
  const ctx = await navig.newContext({ viewport: { width: 1200, height: 850 }, locale: 'fr-FR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page } = await ouvrir(ctx, '/');
  await page.waitForTimeout(1200);
  await page.click('#btn-admin');
  await page.waitForTimeout(400);
  await page.click('#btn-oubli');
  await page.waitForTimeout(500);
  await page.fill('#form-oubli input[name=identifiant]', 'oubli-admin');
  await page.click('#form-oubli button[type=submit]');
  await page.waitForTimeout(800);
  const note = await page.textContent('#note-oubli');
  const l2 = (await appel('POST', '/api/comptes/' + a2.id, { lienReinit: true })).j;
  await page.goto(BASE + '/?reinit=' + l2.jeton);
  await page.waitForTimeout(1800);
  const visible = await page.evaluate(() => !document.querySelector('#form-reinit').hidden && document.querySelector('#dlg-compte').open && !/reinit=/.test(location.search));
  await page.fill('#form-reinit input[name=nouveau]', 'Via-la-page-2026');
  await page.fill('#form-reinit input[name=confirmation]', 'Via-la-page-2026');
  await Promise.all([page.waitForNavigation({ timeout: 8000 }).catch(() => {}), page.click('#form-reinit button[type=submit]')]);
  await page.waitForTimeout(1500);
  const connecte = await page.evaluate(async () => (await (await fetch('/api/compte')).json() || {}).identifiant);
  if (/Demande envoyée/.test(note) && visible && connecte === 'oubli-admin') ok('page : « Mot de passe oublié ? », lien reçu, nouveau mot de passe et connexion'); else ko('page mot de passe oublié : ' + JSON.stringify({ note, visible, connecte }));
  await ctx.close();
  // Identifiant « NOM Prénom » et fiche modifiée par l'administrateur
  const f1 = await appel('POST', '/api/comptes', { identifiant: '  DELAGE   Fabrice ', indicatif: 'f1ukz', motDePasse: 'Provisoire-2026' });
  const ren = await appel('POST', '/api/comptes/' + f1.j.id, { identifiant: 'Fabrice D\u2019Elage', indicatif: 'F1UKZ', email: 'fabrice@exemple.fr' });
  const pris = await appel('POST', '/api/comptes/' + f1.j.id, { identifiant: 'oubli-mail' });
  const fiche = ((await appel('GET', '/api/comptes')).j.find((c) => c.id === f1.j.id) || {});
  const cx = await appel('POST', '/api/connexion', { identifiant: 'fabrice d\u2019elage', motDePasse: 'Provisoire-2026' }, SANS);
  if (f1.statut === 200 && f1.j.identifiant === 'DELAGE Fabrice' && ren.statut === 200 && pris.statut === 400 && fiche.identifiant === 'Fabrice D\u2019Elage' && fiche.email === 'fabrice@exemple.fr' && cx.statut === 200) ok('comptes : identifiant « NOM Prénom », renommé par l’administrateur (doublon refusé), connexion avec le nouveau nom'); else ko('identifiant NOM Prénom : ' + JSON.stringify({ f1: f1.j, ren: ren.j, pris: pris.statut, fiche, cx: cx.statut }));
  for (const id of [a1.id, a2.id, f1.j.id]) await appel('DELETE', '/api/comptes/' + id);
}

async function essaiFrequentation(navig, cookie) {
  console.log('Fréquentation (visiteurs, pays, provenance)');
  const H = { Cookie: `${cookie.name}=${cookie.value}` };
  const avant = await (await fetch(BASE + '/api/frequentation?jours=7', { headers: H })).json();
  const ua = 'Mozilla/5.0 (Windows NT 10.0) Essai/1.0';
  for (let k = 0; k < 3; k++) await fetch(BASE + '/', { headers: { 'User-Agent': ua, Referer: 'https://l.facebook.com/l.php?u=x' } });
  await fetch(BASE + '/', { headers: { 'User-Agent': 'Googlebot/2.1' } });
  await fetch(BASE + '/', { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) CarteLiveAndroid/2.28.12' } });
  const f = await (await fetch(BASE + '/api/frequentation?jours=7', { headers: H })).json();
  const page = (n) => (f.pages.find((x) => x.page === n) || {}).visites || 0;
  const pageAv = (n) => (avant.pages.find((x) => x.page === n) || {}).visites || 0;
  const fb = (f.provenances.find((x) => x.provenance === 'facebook.com') || {}).visites || 0;
  const lan = f.pays.find((x) => x.pays === 'LAN');
  const anonyme = await fetch(BASE + '/api/frequentation');
  if (page('carte') - pageAv('carte') === 3 && page('appli Android') - pageAv('appli Android') === 1 && fb >= 3 && lan && f.aujourdhui.visiteurs - avant.aujourdhui.visiteurs === 2 && anonyme.status === 401 && !JSON.stringify(f).includes('127.0.0.1')) ok('fréquentation : pages, visiteurs uniques du jour, provenance Facebook, réseau local, robots ignorés, sans adresse IP, réservé aux administrateurs');
  else ko('fréquentation : ' + JSON.stringify({ pages: f.pages, avant: avant.pages, fb, lan, v: [avant.aujourdhui, f.aujourdhui], anonyme: anonyme.status }));
  const ctx = await navig.newContext({ viewport: { width: 1366, height: 800 }, locale: 'fr-FR' });
  await ctx.addCookies([cookie]);
  await ctx.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page: pg, erreurs } = await ouvrir(ctx, '/');
  await pg.waitForTimeout(800);
  const e = await pg.evaluate(async () => { await ouvrirDlg('frequentation'); await new Promise((r) => setTimeout(r, 1200)); const z = document.querySelector('#pan-frequentation'); return { cartes: z.querySelectorAll('.carte-freq').length, colonnes: z.querySelectorAll('.colonne-freq').length, fb: /facebook\.com/.test(z.textContent), lan: /Réseau local/.test(z.textContent), deborde: document.querySelector('#dlg-gestion').scrollWidth - document.querySelector('#dlg-gestion').clientWidth }; });
  await capture(pg, 'frequentation');
  if (e.cartes === 4 && e.colonnes === 30 && e.fb && e.lan && e.deborde <= 2 && !erreurs.length) ok('Gérer › Fréquentation : chiffres, visiteurs par jour, pays et provenance'); else ko('écran fréquentation : ' + JSON.stringify({ ...e, erreurs }));
  await ctx.close();
}

// Passerelle d'un membre : sa radio (simulée derrière la WebSocket de la page) reste en écoute, porte son identifiant,
// ne remplace aucun module ; il y écrit les canaux de la carte et de son ADRASEC (clés jamais montrées), avec place libérée.
function fausseRadio(ws, num) {
  const { racine } = require('../src/decodeur');
  const FromRadio = racine.lookupType('meshtastic.FromRadio'), ToRadio = racine.lookupType('meshtastic.ToRadio'), Admin = racine.lookupType('meshtastic.AdminMessage');
  const cle = (n) => Buffer.alloc(32, n);
  const canaux = [
    { index: 0, role: 1, settings: { name: '', psk: Buffer.from([1]) } },
    { index: 1, role: 2, settings: { name: 'Fr_Balise', psk: Buffer.from([1]) } },
    { index: 2, role: 2, settings: { name: 'Perso', psk: cle(7), moduleSettings: { positionPrecision: 13 } } },
    ...[3, 4, 5, 6, 7].map((i) => ({ index: i, role: 0, settings: {} })),
  ];
  const ordres = [];
  const envoyer = (o) => { const c = FromRadio.encode(FromRadio.create(o)).finish(); const t = Buffer.from([0x94, 0xc3, c.length >> 8, c.length & 255]); ws.send(Buffer.concat([t, Buffer.from(c)])); };
  let tampon = Buffer.alloc(0);
  ws.on('message', (d, binaire) => {
    if (!binaire) return;
    tampon = Buffer.concat([tampon, Buffer.from(d)]);
    for (;;) {
      const i = tampon.indexOf(Buffer.from([0x94, 0xc3]));
      if (i < 0) { tampon = tampon.subarray(Math.max(0, tampon.length - 1)); break; }
      tampon = tampon.subarray(i);
      if (tampon.length < 4) break;
      const n = tampon.readUInt16BE(2); if (tampon.length < 4 + n) break;
      const tr = ToRadio.decode(tampon.subarray(4, 4 + n)); tampon = tampon.subarray(4 + n);
      if (tr.wantConfigId) {
        envoyer({ myInfo: { myNodeNum: num } });
        envoyer({ nodeInfo: { num, user: { id: '!' + num.toString(16), longName: 'Radio de Paul', shortName: 'PAUL' } } });
        envoyer({ config: { lora: { modemPreset: 0, hopLimit: 3, region: 3 } } });
        for (const c of canaux) envoyer({ channel: c });
        envoyer({ configCompleteId: tr.wantConfigId });
      } else if (tr.packet && tr.packet.decoded && tr.packet.decoded.portnum === 6) {
        const a = Admin.decode(tr.packet.decoded.payload);
        ordres.push({ vers: tr.packet.to >>> 0, a: Object.keys(Admin.toObject(a)).filter((k) => a[k] != null)[0] });
        if (a.setChannel) canaux[a.setChannel.index] = Admin.toObject(a, { defaults: false }).setChannel;
      }
    }
  });
  return { canaux, ordres };
}
async function essaiPasserelleMembre(navig, cookie) {
  console.log('Member gateway and channel set');
  const WebSocket = require('ws');
  const HA = { 'Content-Type': 'application/json', Cookie: `${cookie.name}=${cookie.value}` };
  const appelA = async (m, url, b) => { const r = await fetch(BASE + url, { method: m, headers: HA, body: b ? JSON.stringify(b) : undefined }); return { statut: r.status, j: await r.json().catch(() => ({})) }; };
  const paul = (await appelA('POST', '/api/comptes', { identifiant: 'Paul passerelle', motDePasse: 'Essai-paul-2026!!' })).j;
  const cx = await fetch(BASE + '/api/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: 'Paul passerelle', motDePasse: 'Essai-paul-2026!!' }) });
  const cookieP = (cx.headers.get('set-cookie') || '').split(';')[0];
  const HP = { 'Content-Type': 'application/json', Cookie: cookieP };
  const appelP = async (m, url, b) => { const r = await fetch(BASE + url, { method: m, headers: HP, body: b ? JSON.stringify(b) : undefined }); return { statut: r.status, j: await r.json().catch(() => ({})) }; };
  // Jeu de canaux de la carte (administrateur)
  const jc = await appelA('PUT', '/api/jeux-canaux/carte', { canaux: [{ nom: 'ADRASEC43', cle: 'aleatoire', positions: true }, { nom: 'Alerte', cle: 'publique' }, { nom: 'Fr_EMCOM', cle: 'publique' }] });
  const ja = jc;
  const refusP = await appelP('PUT', '/api/jeux-canaux/carte', { canaux: [] });
  const mauvais = await appelA('PUT', '/api/jeux-canaux/carte', { canaux: [{ nom: 'Accentué_é', cle: 'publique' }] });
  const vueP = await appelP('GET', '/api/jeux-canaux');
  const texte = JSON.stringify([jc.j, ja.j, vueP.j]);
  const adr = (vueP.j.jeux || []).find((x) => x.portee === 'carte');
  if (jc.statut === 200 && ja.statut === 200 && refusP.statut === 401 && mauvais.statut === 400 && adr && adr.canaux.length === 3 && !adr.modifiable && !adr.canaux[0].empreinte && ja.j.canaux[0].empreinte && !/psk|"cle"|[A-Za-z0-9+/]{40,}={0,2}/.test(texte)) ok('channel set: set by the administrator, keys never sent back (fingerprint for whoever edits it)');
  else ko('jeux de canaux : ' + JSON.stringify({ jc: jc.statut, ja: ja.statut, refusP: refusP.statut, mauvais: mauvais.statut, adr }).slice(0, 400));
  // Radio de Paul reliée par « sa page » : demande « principal », reçoit « en écoute » avec son identifiant
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws/module?nom=Radio%20USB&source=USB&role=principal', { headers: { Cookie: cookieP } });
  const premier = new Promise((r) => ws.on('message', (d, bin) => { if (!bin) r(JSON.parse(d.toString())); }));
  await new Promise((r, k) => { ws.once('open', r); ws.once('error', k); });
  const radio = fausseRadio(ws, 0x11223344);
  const info = await Promise.race([premier, new Promise((r) => setTimeout(() => r({}), 3000))]);
  let mien = null;
  for (let k = 0; k < 30; k++) { mien = (await appelP('GET', '/api/passerelle/miennes')).j; if (mien.passerelles && mien.passerelles[0] && mien.passerelles[0].radio && mien.passerelles[0].radio.connecte) break; await new Promise((r) => setTimeout(r, 300)); }
  const p0 = mien.passerelles && mien.passerelles[0];
  const ecA = await appelA('GET', '/api/ecoutes');
  const vueAdmin = (ecA.j.meshtastic || []).find((x) => x.hote === info.hote);
  const anonyme = await new Promise((r) => { const w = new WebSocket(BASE.replace('http', 'ws') + '/ws/module'); w.on('open', () => { w.close(); r('ouverte'); }); w.on('error', () => r('refusée')); w.on('unexpected-response', () => r('refusée')); });
  if (info.role === 'ecoute' && /paul-passerelle/.test(info.hote || '') && p0 && p0.radio.connecte && p0.radio.canaux.length === 8 && p0.radio.canaux[2].chiffrement === 'prive' && !JSON.stringify(mien).includes('BwcH') && vueAdmin && /Paul passerelle/.test(vueAdmin.compte) && anonyme === 'refusée') ok('member gateway: listening only, named after the account, seen by the administrator, channels read without keys, refused without an account');
  else ko('passerelle membre : ' + JSON.stringify({ info, p0, vueAdmin, anonyme }).slice(0, 500));
  // Page de Paul : « Devenir passerelle » et le panneau des canaux de sa radio
  const ctx = await navig.newContext({ viewport: { width: 1366, height: 860 }, locale: 'fr-FR' });
  const [n, v] = cookieP.split('=');
  await ctx.addCookies([{ name: n, value: v, domain: '127.0.0.1', path: '/' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(ctx, '/');
  await page.waitForTimeout(800);
  const e1 = await page.evaluate(async (hote) => {
    const bouton = document.querySelector('#outil-connecter').textContent;
    moduleNav.etat = 'relie'; moduleNav.hote = hote; moduleNav.type = 'usb'; moduleNav.role = 'ecoute';
    await ouvrirConnexion();
    await new Promise((r) => setTimeout(r, 1500));
    const z = document.querySelector('#cx-canaux');
    const cases = [...z.querySelectorAll('[data-ajout]')].map((x) => x.dataset.nom + (x.checked ? '+' : ''));
    return { bouton, titre: document.querySelector('#fiche-contenu h2').textContent, serie: !!document.querySelector('[data-cx="serie"]'), role: document.querySelector('#cx-role').hidden, grille: z.querySelectorAll('.case-canal').length, cases, clair: !z.querySelector('.avert-clair').hidden, liberer: !z.querySelector('.liberer-canaux').hidden, bouton2: !!document.querySelector('#cx-ecrire') };
  }, info.hote);
  await capture(page, 'passerelle-membre');
  if (/Devenir passerelle/.test(e1.bouton) && /Devenir passerelle/.test(e1.titre) && !e1.serie && e1.role && e1.grille === 8 && e1.cases.join(',') === 'ADRASEC43+,Alerte+,Fr_EMCOM+' && e1.clair && !e1.liberer && e1.bouton2 && !erreurs.length) ok('member page: “Become a gateway”, radio channels and set to tick, unencrypted warning');
  else ko('page passerelle : ' + JSON.stringify({ ...e1, erreurs }));
  // Écriture : 3 canaux à ajouter, 5 places libres ; « Perso » (clé privée, précision 13) reste à sa place
  const w1 = await appelP('POST', '/api/passerelle/canaux', { hote: info.hote, ajouter: adr.canaux.map((c) => ({ portee: 'carte', id: c.id })) });
  const noms = radio.canaux.map((c) => (c.role ? (c.settings && c.settings.name) || '' : '-'));
  const k3 = radio.canaux.find((c) => c.settings && c.settings.name === 'ADRASEC43');
  const versLui = radio.ordres.every((o) => o.vers === 0x11223344);
  // Radio pleine : il faut libérer ; refus clair puis écriture avec un emplacement libéré
  const autre = (await appelA('PUT', '/api/jeux-canaux/carte', { canaux: [...adr.canaux.map((c) => ({ id: c.id, nom: c.nom, cle: '' })), { nom: 'C6', cle: 'publique' }, { nom: 'C7', cle: 'publique' }, { nom: 'C8', cle: 'aleatoire' }] })).j;
  const ids = (nm) => autre.canaux.filter((c) => nm.includes(c.nom)).map((c) => ({ portee: 'carte', id: c.id }));
  const plein = await appelP('POST', '/api/passerelle/canaux', { hote: info.hote, ajouter: ids(['C6', 'C7', 'C8']) });
  const libere = await appelP('POST', '/api/passerelle/canaux', { hote: info.hote, ajouter: ids(['C6', 'C7', 'C8']), liberer: [1] });
  const noms2 = radio.canaux.map((c) => (c.role ? (c.settings && c.settings.name) || '' : '-'));
  const perso = radio.canaux.find((c) => c.settings && c.settings.name === 'Perso');
  const autreCompte = await appelA('POST', '/api/passerelle/canaux', { hote: 'agent-inconnu', ajouter: ids(['C6']) });
  if (w1.statut === 200 && noms.join(',') === ',Fr_Balise,Perso,ADRASEC43,Alerte,Fr_EMCOM,-,-' && k3 && Buffer.from(k3.settings.psk).length === 32 && k3.settings.moduleSettings.positionPrecision === 32 && versLui && radio.ordres[0].a === 'beginEditSettings'
    && plein.statut === 400 && /libérez encore 1/.test(plein.j.erreur) && libere.statut === 200 && noms2.join(',') === ',Perso,ADRASEC43,Alerte,Fr_EMCOM,C6,C7,C8' && perso.settings.moduleSettings.positionPrecision === 13 && Buffer.from(perso.settings.psk).equals(Buffer.alloc(32, 7)) && autreCompte.statut === 400)
    ok('channels written to the member’s radio: added, private key, slot freed on request, kept channel moved intact, read back');
  else ko('écriture des canaux : ' + JSON.stringify({ w1, noms, k3: !!k3, versLui, ordre0: radio.ordres[0], plein, libere: libere.statut, noms2, autre: autreCompte.statut }).slice(0, 700));
  // Coupure par l'administrateur : la passerelle ne peut plus se relier (12 h)
  await appelA('DELETE', '/api/ecoutes', { hote: info.hote, port: 1 });
  await new Promise((r) => setTimeout(r, 500));
  const apres = (await appelP('GET', '/api/passerelle/miennes')).j;
  const ws2 = await new Promise((r) => { const w = new WebSocket(BASE.replace('http', 'ws') + '/ws/module?nom=Radio%20USB', { headers: { Cookie: cookieP } }); w.on('open', () => { w.close(); r('ouverte'); }); w.on('unexpected-response', () => r('refusée')); w.on('error', () => r('refusée')); });
  if (ws.readyState !== 1 && ws2 === 'refusée' && /coupée par un administrateur/.test(apres.refus || '')) ok('gateway cut off by the administrator: refused afterwards, reason shown to the member'); else ko('coupure passerelle : ' + JSON.stringify({ etat: ws.readyState, ws2, refus: apres.refus }));
  try { ws.close(); } catch { /* déjà */ }
  await ctx.close();
}

async function essaiAgentDirect(cookie) {
  console.log('Agent zéro question (simulé)');
  const net = require('net');
  const entetes = { Cookie: `${cookie.name}=${cookie.value}` };
  const ag = await (await fetch(BASE + '/api/radio/agents', { headers: entetes })).json();
  const sock = net.connect(ag.port, '127.0.0.1');
  const reponse = await new Promise((okp, kop) => {
    sock.once('error', kop);
    sock.once('connect', () => sock.write(JSON.stringify({ v: 1, code: ag.code, nom: 'PC-ESSAI · ttyUSB0', source: 'USB ttyUSB0', version: '1.7', direct: true, protocole: 'meshtastic', role: 'principal' }) + '\n'));
    let t = ''; sock.on('data', (x) => { t += x.toString('latin1'); if (t.includes('\n')) okp(t.split('\n')[0]); });
    setTimeout(() => okp(t || '(rien)'), 5000);
  });
  if (reponse === 'OK direct') ok('agent direct accepté par la carte'); else ko('agent direct : réponse ' + reponse);
  await new Promise((r) => setTimeout(r, 800));
  const actif = async () => ((await (await fetch(BASE + '/api/radio/modules', { headers: entetes })).json()).actif || {}).hote;
  const a1 = await actif();
  if (a1 === 'agent-pc-essai-ttyusb0') ok('module de l’agent devenu module principal tout de suite'); else ko('module principal après l’agent : ' + a1);
  sock.destroy();
  await new Promise((r) => setTimeout(r, 1200));
  const a2 = await actif();
  if (a2 !== 'agent-pc-essai-ttyusb0') ok('module débranché : retiré, retour au module d’avant'); else ko('module de l’agent toujours principal après débranchement');
  const refus = await new Promise((okp) => {
    const s2 = net.connect(ag.port, '127.0.0.1', () => s2.write(JSON.stringify({ v: 1, code: 'FAUX-FAUX-FAUX', nom: 'Intrus', direct: true, protocole: 'meshtastic' }) + '\n'));
    let t = ''; s2.on('data', (x) => { t += x; }); s2.on('close', () => okp(t)); s2.on('error', () => okp(t)); setTimeout(() => { s2.destroy(); okp(t); }, 5000);
  });
  if (/^ERREUR/.test(refus)) ok('agent direct avec un faux code refusé'); else ko('faux code : ' + refus);
  const dossier = path.join(__dirname, '..', 'public', 'agent'), f = path.join(dossier, 'live-mesh-agent-linux-amd64');
  const creeDossier = !fs.existsSync(dossier);
  fs.mkdirSync(dossier, { recursive: true }); fs.writeFileSync(f, Buffer.from('\x7fELF programme factice'));
  try {
    const r = await fetch(BASE + '/api/agent/pret/live-mesh-agent-linux-amd64', { headers: entetes });
    const b = Buffer.from(await r.arrayBuffer());
    const m = b.toString('utf8').match(/\nCARTE-LIVE-AGENT(\{.*\})\n$/);
    const j = m ? JSON.parse(m[1]) : {};
    if (r.ok && b.subarray(0, 4).toString('latin1') === '\x7fELF' && j.code === ag.code && j.serveurs && j.serveurs[0] === `127.0.0.1:${ag.port}`) ok('agent prêt à l’emploi : programme intact, adresse et code ajoutés à la fin');
    else ko('agent prêt à l’emploi : ' + r.status + ' ' + JSON.stringify(j));
    const visiteur = await fetch(BASE + '/api/agent/pret/live-mesh-agent-linux-amd64');
    if (visiteur.status === 401 || visiteur.status === 403) ok('agent prêt à l’emploi refusé sans compte administrateur'); else ko('agent prêt à l’emploi sans compte : HTTP ' + visiteur.status);
  } finally {
    fs.rmSync(f, { force: true });
    if (creeDossier) fs.rmSync(dossier, { recursive: true, force: true });
  }
}

async function essaiUsbAuto(navig, cookie) {
  console.log('Modules USB de ce PC reliés tout seuls (simulés)');
  const contexte = await navig.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
  await contexte.addCookies([cookie]);
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  await contexte.addInitScript(simulerUsb);
  const { page, erreurs } = await ouvrir(contexte, '/');
  const attendre = async (f, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await page.evaluate(f)) return true; await page.waitForTimeout(300); } return false; };
  if (await attendre(() => moduleNav.etat === 'relie')) ok('module Meshtastic déjà autorisé : relié tout seul au chargement'); else ko('module Meshtastic non relié au chargement (état ' + await page.evaluate(() => moduleNav.etat + ' ' + moduleNav.erreur) + ')');
  await page.evaluate(() => window.__usb.debrancher('mt'));
  if (await attendre(() => moduleNav.etat === 'aucun', 5000)) ok('module débranché : libéré tout de suite, sans reconnexion'); else ko('module débranché toujours occupé (' + await page.evaluate(() => moduleNav.etat) + ')');
  await page.evaluate(() => window.__usb.brancher('mc'));
  if (await attendre(() => mc.nav.etat === 'relie')) ok('companion MeshCore branché : reconnu et relié tout seul'); else ko('companion MeshCore non relié (' + await page.evaluate(() => mc.nav.etat + ' ' + mc.nav.erreur) + ')');
  await page.evaluate(() => window.__usb.brancher('mt'));
  if (await attendre(() => moduleNav.etat === 'relie')) ok('nouveau module Meshtastic branché : relié à côté du companion'); else ko('nouveau module Meshtastic non relié');
  const annonces = await page.evaluate(() => [...document.querySelectorAll('#annonces .annonce')].map((d) => d.textContent).join(' | '));
  if (/Meshtastic relié/.test(annonces) && /MeshCore relié/.test(annonces)) ok('annonces « relié » affichées'); else ko('annonces manquantes : ' + annonces);
  await page.evaluate(() => { debrancherModuleNav(); mcDebrancherNav(); });
  bilanErreurs(erreurs.filter((e) => !/HTTP 401|401|WebSocket/.test(e)), 'USB automatique');
  await contexte.close();
}

async function essaiEcran150(navig) {
  console.log('Ordinateur à 150 % (1280 × 620)');
  const contexte = await navig.newContext({ viewport: { width: 1280, height: 620 }, locale: 'fr-FR' });
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/');
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); const v = document.querySelector('.marque .version'); if (v) v.textContent = 'v2.22.0 · v2.22.1 disponible'; });
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const b = (q) => { const e = document.querySelector(q); return e && e.offsetParent !== null ? e.getBoundingClientRect() : null; };
    const croise = (x, y) => !!x && !!y && x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
    const barre = b('.barre'), outils = b('.outils'), rech = b('.recherche-lieu'), pan = b('.panneau'), leg = b('.legende');
    return { barreOutils: croise(barre, outils), rechOutils: croise(rech, outils), rechBarre: croise(rech, barre), panOutils: croise(pan, outils), legOutils: croise(leg, outils) };
  });
  if (!Object.values(g).some(Boolean)) ok('écran à 150 % : barre, outils, recherche, panneau et légende sans chevauchement'); else ko('écran à 150 % : chevauchement ' + JSON.stringify(g));
  await capture(page, 'ecran-150');
  bilanErreurs(erreurs.filter((e) => !/HTTP 401|401/.test(e)), 'écran à 150 %');
  await contexte.close();
}

async function essaiTelephone(navig) {
  console.log('Téléphone (portrait)');
  const contexte = await navig.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  // Badge « vX disponible » sur une 2e ligne : la barre grandit, la recherche et le bouton ◎ doivent rester dessous
  await page.evaluate(() => { const v = document.querySelector('.marque .version'); if (v) v.textContent = 'v2.22.0 · v2.22.1 disponible'; });
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => { const b = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; }; const a = b('.barre'), s = b('.recherche-lieu'), l = b('.leaflet-top.leaflet-right'); return { barre: a && a.bottom, rech: s && [s.top, s.bottom], bouton: l && l.top }; });
  if (g.barre && g.rech && g.rech[0] >= g.barre && (!g.bouton || g.bouton >= g.rech[1])) ok('téléphone : recherche et bouton ◎ sous la barre du haut, sans chevauchement'); else ko('téléphone : chevauchement en haut ' + JSON.stringify(g));
  // Tiroir plein avec texte agrandi (réglage Android) : jamais sous le titre ni la recherche, bouton ▾ pour réduire
  await page.evaluate(() => { document.documentElement.style.fontSize = '130%'; document.querySelectorAll('.marque, .recherche-lieu').forEach((e) => { e.style.fontSize = '130%'; }); window.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const p = document.querySelector('.poignee-tiroir'); for (let i = 0; i < 3 && !document.body.classList.contains('tiroir-plein'); i++) { p.dispatchEvent(new PointerEvent('pointerdown', { clientY: 500, pointerId: 1, bubbles: true })); p.dispatchEvent(new PointerEvent('pointerup', { clientY: 500, pointerId: 1, bubbles: true })); } });
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => { const r = (q) => document.querySelector(q).getBoundingClientRect(); const b = document.querySelector('.reduire-tiroir'); return { plein: document.body.classList.contains('tiroir-plein'), haut: r('.panneau').top, rech: r('.recherche-lieu').bottom, barre: r('.barre').bottom, bouton: b && b.offsetParent !== null }; });
  if (t.plein && t.haut >= Math.max(t.rech, t.barre) && t.bouton) ok('téléphone : tiroir plein sous le titre et la recherche, bouton ▾ visible'); else ko('téléphone : tiroir ' + JSON.stringify(t));
  await page.tap('.reduire-tiroir');
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.body.classList.contains('tiroir-reduit'))) ok('téléphone : bouton ▾ réduit le tiroir'); else ko('téléphone : ▾ sans effet');
  await capture(page, 'telephone');
  bilanErreurs(erreurs.filter((e) => !/HTTP 401|401/.test(e)), 'téléphone');
  await contexte.close();
}

// Recherche dans les messages : droits (visiteur, démonstration, administrateur), champ, surlignage, clic = message
// affiché à sa place dans son canal ; téléphone : résultats lisibles
async function essaiRechercheMessages(navig, cookie) {
  console.log('Recherche dans les messages');
  // Messages écrits directement dans la base de la carte : les déclencheurs SQLite tiennent l'index à jour
  const Database = require('better-sqlite3');
  const db = new Database(path.join(donnees, 'carte-live.db'));
  db.pragma('busy_timeout = 5000');
  const h = Date.now() - 600000;
  // Jamais INSERT OR REPLACE sur « noeuds » : l'index des noms (déclencheurs) ne verrait pas la suppression
  db.prepare('INSERT INTO noeuds (num, id, nom_long, nom_court, premier_vu, dernier_vu) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(num) DO UPDATE SET nom_long = excluded.nom_long, nom_court = excluded.nom_court').run(0x5a1e0042, '!5a1e0042', 'Olivier F4GLD', 'GLD', h, h);
  const ins = db.prepare("INSERT INTO paquets (id_paquet, de, vers, canal, port, heure, texte) VALUES (?, ?, ?, ?, 'texte', ?, ?)");
  ins.run(900001, 0x5a1e0042, 0xffffffff, 'LongFast', h, 'Bonjour depuis le Mézenc');
  ins.run(900002, 0x5a1e0043, 0xffffffff, 'LongFast', h + 1000, 'Qui a vu mon CHAPEAU ?');
  ins.run(900003, 0x5a1e0043, 0xffffffff, 'Equipe', h + 2000, 'Chapeau rangé au local');
  ins.run(900004, 0x5a1e0043, 0x5a1e0042, 'LongFast', h + 3000, 'Message direct pour Olivier');
  db.close();
  const appel = async (url, entetes = {}) => { const r = await fetch(BASE + url, { headers: entetes }); return { statut: r.status, j: await r.json().catch(() => ({})) }; };
  const anonyme = await appel('/api/messages/recherche?q=chapeau');
  const demo = await appel('/api/messages/recherche?q=chapeau', { 'X-Demo': '1' });
  const demoNom = await appel('/api/messages/recherche?q=f4gld', { 'X-Demo': '1' });
  const admin = await appel('/api/messages/recherche?q=chap%C3%A9au', { Cookie: `${cookie.name}=${cookie.value}` });
  const adminNom = await appel('/api/messages/recherche?q=F4GLD', { Cookie: `${cookie.name}=${cookie.value}` });
  const textes = (x) => (x.j.resultats || []).map((m) => m.texte);
  if (anonyme.statut === 401) ok('recherche : refusée à un visiteur non connecté'); else ko('recherche visiteur : ' + anonyme.statut);
  // Démonstration : la référence d'un résultat n'est pas masquée (champ « ref », pas « cle »), le clic ouvre le bon message
  if (demo.statut === 200 && (demo.j.resultats || []).every((m) => /^mt\d+$/.test(m.ref) && !('cle' in m))) ok('recherche (démonstration) : référence « ref » lisible, pas de champ masqué'); else ko('recherche démonstration ref : ' + JSON.stringify((demo.j.resultats || []).map((m) => [m.ref, m.cle])));
  // Débit : 10 recherches par minute en démonstration, puis 429
  let refus = 0, message = '';
  for (let k = 0; k < 12; k++) { const r = await appel('/api/messages/recherche?q=chapeau' + k, { 'X-Demo': '1' }); if (r.statut === 429) { refus++; message = r.j.erreur; } }
  const membre = await appel('/api/messages/recherche?q=chapeau', { Cookie: `${cookie.name}=${cookie.value}` });
  if (refus === 4 && /une minute/.test(message) && membre.statut === 200) ok('recherche : 10 par minute en démonstration (4 refus sur 12 après les 2 premières), membre connecté non bloqué'); else ko(`recherche : limite de débit, refus = ${refus}, membre ${membre.statut}`);
  if (demo.statut === 200 && JSON.stringify(textes(demo)) === JSON.stringify(['Qui a vu mon CHAPEAU ?']) && JSON.stringify(textes(demoNom)) === JSON.stringify(['Bonjour depuis le Mézenc'])) ok('recherche (démonstration) : canaux publics seulement, jamais les messages directs');
  else ko('recherche démonstration : ' + JSON.stringify([demo.statut, textes(demo), textes(demoNom)]));
  if (JSON.stringify(textes(admin)) === JSON.stringify(['Chapeau rangé au local', 'Qui a vu mon CHAPEAU ?']) && JSON.stringify(textes(adminNom)) === JSON.stringify(['Message direct pour Olivier', 'Bonjour depuis le Mézenc'])) ok('recherche (administrateur) : accents ignorés, tous canaux, expéditeur et destinataire par leur nom');
  else ko('recherche administrateur : ' + JSON.stringify([textes(admin), textes(adminNom)]));
  // Dans la page : champ, résultats surlignés, clic = message repéré dans son canal
  for (const [nom, vue] of [['ordinateur', { width: 1400, height: 900 }], ['téléphone', { width: 390, height: 844 }]]) {
    const contexte = await navig.newContext({ viewport: vue, locale: 'fr-FR', hasTouch: nom === 'téléphone', isMobile: nom === 'téléphone' });
    await contexte.addCookies([cookie]);
    await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); localStorage.removeItem('filtreMessages'); } catch { /* */ } });
    const { page, erreurs } = await ouvrir(contexte, '/');
    await page.evaluate(() => allerGroupe('messages'));
    await page.waitForTimeout(500);
    await page.fill('#recherche-messages', 'chapeau');
    await page.waitForSelector('#resultats-recherche .resultat-recherche', { timeout: 5000 }).catch(() => {});
    const r = await page.evaluate(() => ({
      n: document.querySelectorAll('#resultats-recherche .resultat-recherche').length,
      marques: [...document.querySelectorAll('#resultats-recherche mark')].map((m) => m.textContent),
      listeCachee: getComputedStyle(document.querySelector('#messages')).display === 'none',
      large: document.documentElement.scrollWidth <= innerWidth + 1,
    }));
    if (r.n === 2 && r.marques.includes('CHAPEAU') && r.marques.includes('Chapeau') && r.listeCachee && r.large) ok(`recherche (${nom}) : 2 résultats, terme surligné, liste remplacée`); else ko(`recherche (${nom}) : ` + JSON.stringify(r));
    await capture(page, 'recherche-messages-' + (nom === 'téléphone' ? 'telephone' : 'ordinateur'));
    if (nom === 'ordinateur') {
      await page.click('#resultats-recherche .resultat-recherche:nth-child(3) .texte'); // 2e résultat : LongFast
      await page.waitForSelector('#messages .message.repere', { timeout: 5000 }).catch(() => {});
      const c = await page.evaluate(() => ({ filtre: filtreMessages, repere: (document.querySelector('#messages .message.repere .texte') || {}).textContent, visible: getComputedStyle(document.querySelector('#messages')).display !== 'none' }));
      if (c.filtre === 'c:LongFast' && c.repere === 'Qui a vu mon CHAPEAU ?' && c.visible) ok('recherche : clic = message repéré dans son canal'); else ko('recherche clic : ' + JSON.stringify(c));
      // Le nom de l'expéditeur suffit ; Échap efface et rend la liste
      await page.fill('#recherche-messages', 'gld');
      await page.waitForFunction(() => [...document.querySelectorAll('#resultats-recherche mark')].some((m) => m.textContent === 'GLD'), null, { timeout: 5000 }).catch(() => {});
      const parNom = await page.evaluate(() => [...document.querySelectorAll('#resultats-recherche .resultat-recherche .texte')].map((x) => x.textContent));
      await page.press('#recherche-messages', 'Escape');
      const apres = await page.evaluate(() => ({ champ: $('#recherche-messages').value, cache: $('#resultats-recherche').hidden }));
      if (JSON.stringify(parNom) === JSON.stringify(['Message direct pour Olivier', 'Bonjour depuis le Mézenc']) && apres.champ === '' && apres.cache) ok('recherche : par nom court de l’expéditeur, Échap efface'); else ko('recherche par nom : ' + JSON.stringify({ parNom, apres }));
    }
    bilanErreurs(erreurs, 'recherche (' + nom + ')');
    await contexte.close();
  }
}

// Secteurs d'alerte et mode urgence : secteur dessiné à la souris, bascule urgence (bandeau, carte, tableau de crise), retour normal
async function essaiUrgenceEtSecteurs(navig, cookie) {
  console.log('Secteurs d’alerte et mode urgence');
  const H = { 'Content-Type': 'application/json', Cookie: `${cookie.name}=${cookie.value}` };
  const appel = async (m, url, b, h = H) => { const r = await fetch(BASE + url, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); return { statut: r.status, j: await r.json().catch(() => ({})) }; };
  const ctx = await navig.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
  await ctx.addCookies([cookie]);
  await ctx.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(ctx, '/');
  // Secteur : polygone dessiné sur la carte puis créé
  await page.evaluate(() => ficheSecteurs()); await page.waitForTimeout(1200);
  await page.locator('.nouveau-sa [data-poly]').click();
  for (const [x, y] of [[520, 320], [820, 330], [780, 600], [500, 580]]) { await page.mouse.click(x, y); await page.waitForTimeout(120); }
  await page.locator('#barre-dessin [data-finir]').click();
  await page.locator('.nouveau-sa [data-c="nom"]').fill('Secteur essai');
  await page.locator('.nouveau-sa [data-c="noeuds"]').fill('!5a1e0001');
  await page.locator('.nouveau-sa [data-creer]').click(); await page.waitForTimeout(1200);
  const l = await appel('GET', '/api/secteurs');
  const sec = (l.j.secteurs || []).find((x) => x.nom === 'Secteur essai');
  if (sec && sec.forme === 'polygone' && sec.points.length === 4 && sec.membres.length === 1) ok('secteur dessiné à la souris et créé'); else ko('secteur : ' + JSON.stringify(l.j).slice(0, 200));
  if (await page.locator('.leaflet-secteurs-pane path').count()) ok('secteur tracé sur la carte'); else ko('secteur absent de la carte');
  const pub = await appel('GET', '/api/secteurs', null, {});
  if (pub.statut === 401) ok('secteurs refusés au public'); else ko('secteurs lisibles sans compte : ' + pub.statut);
  // Fuites vers les visiteurs (I4) : équipe avec une position de membre et un secteur ; anonyme → 401 ; démonstration → vidé
  const eq = await appel('POST', '/api/equipes', { nom: 'EssaiEq', positions: true });
  if (eq.statut === 200) {
    await appel('POST', '/api/equipes/' + eq.j.id + '/membres', { ajouter: [0x5a1e0042], insister: false }).catch(() => {});
    const anonEq = await appel('GET', '/api/equipes', null, {});
    const demoEq = await appel('GET', '/api/equipes', null, { 'X-Demo': '1' });
    const adminEq = await appel('GET', '/api/equipes');
    const e1 = (demoEq.j.equipes || []).find((x) => x.nom === 'EssaiEq') || {};
    const vide = e1 && (e1.sos || []).length === 0 && (e1.secteurs || []).length === 0 && !e1.zone && (e1.membres || []).every((m) => m.position == null);
    if (anonEq.statut === 401 && demoEq.statut === 200 && vide && adminEq.statut === 200) ok('équipes : 401 pour un anonyme ; en démonstration, ni demandes d’aide, ni positions, ni secteurs'); else ko('fuite équipes : ' + JSON.stringify({ anon: anonEq.statut, demo: demoEq.statut, e1 }).slice(0, 300));
    await appel('DELETE', '/api/equipes/' + eq.j.id, { retirerDesNoeuds: false });
  } else ko('création d’équipe pour l’essai : ' + JSON.stringify(eq.j));
  const rapAnon = await fetch(BASE + '/rapport');
  const rapDemo = await fetch(BASE + '/rapport', { headers: { 'X-Demo': '1' } });
  const rapDemoTexte = await rapDemo.text();
  if (rapAnon.status === 401 && rapDemo.status === 200 && !/Secteur essai/.test(rapDemoTexte)) ok('rapport : 401 pour un anonyme, sans alerte de secteur en démonstration'); else ko('rapport : ' + JSON.stringify({ anon: rapAnon.status, demo: rapDemo.status, secteur: /Secteur essai/.test(rapDemoTexte) }));
  // Mode urgence : activé (bandeau, carte en crise, tableau), puis terminé
  const a = await appel('POST', '/api/urgence', { actif: true, motif: 'Essai automatique' });
  await page.waitForTimeout(1500);
  const enCrise = await page.evaluate(() => ({ classe: document.body.classList.contains('mode-urgence'), bandeau: (document.querySelector('#bandeau-urgence') || {}).textContent || '' }));
  if (a.statut === 200 && enCrise.classe && /URGENCE/.test(enCrise.bandeau) && /Essai automatique/.test(enCrise.bandeau)) ok('mode urgence : bandeau et carte en crise reçus en direct'); else ko('mode urgence activé : ' + JSON.stringify({ a, enCrise }));
  await page.locator('#bandeau-urgence').click(); await page.waitForTimeout(1200);
  const tableau = await page.locator('#fiche-contenu').innerText().catch(() => '');
  if (/Tableau de crise/.test(tableau) && /Mode urgence activé par/.test(tableau)) ok('tableau de crise et journal'); else ko('tableau de crise : ' + tableau.slice(0, 160));
  await capture(page, 'mode-urgence');
  const deux = await appel('POST', '/api/urgence', { actif: true });
  if (deux.statut === 400) ok('double activation refusée'); else ko('double activation : ' + deux.statut);
  // Gestionnaire : lit le tableau de crise et note au journal, mais n'active ni ne termine le mode urgence
  await appel('POST', '/api/comptes', { identifiant: 'Gilles gestion', motDePasse: 'Essai-gilles-2026!!', role: 'gestionnaire' });
  const cx = await fetch(BASE + '/api/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: 'Gilles gestion', motDePasse: 'Essai-gilles-2026!!' }) });
  const HG = { 'Content-Type': 'application/json', Cookie: (cx.headers.get('set-cookie') || '').split(';')[0] };
  const finG = await appel('POST', '/api/urgence', { actif: false }, HG);
  const lectureG = await appel('GET', '/api/urgence', null, HG);
  const noteG = await appel('POST', '/api/urgence/note', { texte: 'Note du gestionnaire' }, HG);
  if (finG.statut === 403 && lectureG.statut === 200 && lectureG.j.actif && lectureG.j.tableau && noteG.statut === 200) ok('gestionnaire : 403 pour terminer, tableau lisible, note acceptée'); else ko('gestionnaire : ' + JSON.stringify({ fin: finG.statut, lecture: lectureG.statut, note: noteG.statut }));
  const f = await appel('POST', '/api/urgence', { actif: false });
  const actG = await appel('POST', '/api/urgence', { actif: true }, HG);
  if (actG.statut === 403) ok('gestionnaire : 403 pour activer le mode urgence'); else ko('gestionnaire active le mode urgence : ' + actG.statut);
  await page.waitForTimeout(1500);
  const apres = await page.evaluate(() => ({ classe: document.body.classList.contains('mode-urgence'), bandeau: !!document.querySelector('#bandeau-urgence') }));
  if (f.statut === 200 && !apres.classe && !apres.bandeau) ok('mode urgence terminé : affichage habituel'); else ko('fin du mode urgence : ' + JSON.stringify({ f: f.statut, apres }));
  const csv = await fetch(BASE + '/api/urgence/journal.csv?crise=' + (f.j.derniere || {}).id, { headers: H });
  if (csv.status === 200 && /heure_utc;heure_locale;type/.test(await csv.text())) ok('journal de crise exporté (CSV)'); else ko('export du journal de crise : ' + csv.status);
  await appel('DELETE', '/api/secteurs/' + (sec ? sec.id : 'x'));
  bilanErreurs(erreurs, 'secteurs et urgence');
  await ctx.close();
}
// Mur des donateurs : un don saisi par l'administrateur → bandeau visible sur la carte et sur la page publique,
// sans recouvrir la barre du haut, la recherche, le panneau, la légende ni les boutons ; croix = fermé ; caché en urgence
async function essaiPartager(navig, cookie) {
  console.log('Panneau « Carte publique et exports » (téléphone, administrateur)');
  const contexte = await navig.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await contexte.addCookies([cookie]);
  await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
  const { page, erreurs } = await ouvrir(contexte, '/');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await page.evaluate(() => fichePartager());
  await page.waitForFunction(() => !/Chargement…/.test(document.querySelector('#donateurs-reglages') ? document.querySelector('#donateurs-reglages').textContent : ''), null, { timeout: 8000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const liens = [...document.querySelectorAll('#fiche-contenu .ligne.sans-pastille .titre a')].map((a) => ({ texte: a.textContent.trim(), largeur: Math.round(a.getBoundingClientRect().width), tronque: a.scrollWidth > a.clientWidth + 1 }));
    const z = document.querySelector('#donateurs-reglages');
    return { liens, donateurs: z ? z.textContent.slice(0, 60) : null };
  });
  const coupes = m.liens.filter((l) => l.tronque || l.largeur < 60);
  if (m.liens.length >= 7 && !coupes.length) ok('liens d’export : libellés entiers (' + m.liens.length + ' lignes, pas de texte coupé)'); else ko('liens d’export coupés : ' + JSON.stringify(coupes.length ? coupes : m.liens));
  if (m.donateurs && !/^\s*Chargement/.test(m.donateurs)) ok('mur des donateurs : réglages chargés'); else ko('mur des donateurs : toujours « Chargement… » : ' + m.donateurs);
  await capture(page, 'partager-telephone');
  if (erreurs.length) ko('panneau Partager : ' + erreurs.join(' | ')); else ok('panneau Partager : aucune erreur JavaScript');
  await contexte.close();
}

async function essaiDonateurs(navig, cookie) {
  console.log('Mur des donateurs');
  const entetes = { 'Content-Type': 'application/json', Cookie: `${cookie.name}=${cookie.value}` };
  const poster = (url, corps) => fetch(BASE + url, { method: 'POST', headers: entetes, body: JSON.stringify(corps) });
  let r = await poster('/api/donateurs/manuel', { nom: '42BARBE', pays: 'FR', montant: 20, accord: true });
  const ajout = await r.json().catch(() => ({}));
  if (r.ok && ajout.id) ok('don manuel ajouté par l’API admin'); else ko('don manuel : ' + r.status + ' ' + JSON.stringify(ajout));
  r = await poster('/api/donateurs/manuel', { nom: 'Sans accord', accord: false });
  if (r.status === 400) ok('don sans accord refusé'); else ko('don sans accord : ' + r.status);
  r = await poster('/api/donateurs/manuel', { nom: 'Pays faux', pays: 'France', accord: true });
  if (r.status === 400) ok('pays autre qu’un code à 2 lettres refusé'); else ko('pays faux : ' + r.status);
  // Liens « Faire un don » : seulement quand la source est activée, tirés des réglages
  await poster('/api/donateurs/reglages', { helloasso: { actif: true, organisation: 'asso-essai', formulaire: 'form-1' }, githubSponsors: { actif: false } });
  const pub = await (await fetch(BASE + '/api/donateurs')).json();
  const nomsOk = (pub.liste || []).length === 1 && pub.liste[0].nom === '42B***' && pub.liste[0].montant == null && !('date' in pub.liste[0]);
  if (nomsOk) ok('liste publique : nom abrégé (42B***), montant masqué, pas de date'); else ko('liste publique : ' + JSON.stringify(pub));
  if (pub.liens && pub.liens.helloasso === 'https://www.helloasso.com/associations/asso-essai/formulaires/form-1' && pub.liens.github === null) ok('liens tirés des réglages, GitHub absent (source désactivée)'); else ko('liens : ' + JSON.stringify(pub.liens));
  // Journal d'audit : le nom du donateur n'y figure pas
  const audit = await (await fetch(BASE + '/api/audit', { headers: entetes })).json().catch(() => []);
  const lignes = JSON.stringify(audit);
  if (/donateurs\/manuel/.test(lignes) && !/42BARBE/.test(lignes)) ok('journal d’audit : action notée sans le nom du donateur'); else ko('journal d’audit : ' + lignes.slice(0, 300));
  // Rectangle du bandeau et chevauchements avec les éléments à ne pas couvrir
  const mesurer = (page, selecteurs) => page.evaluate((sel) => {
    const e = document.getElementById('bandeau-donateurs');
    if (!e) return { present: false };
    const r = e.getBoundingClientRect();
    const croise = (x, y) => x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom;
    const chevauche = [];
    for (const q of sel) document.querySelectorAll(q).forEach((o) => { const b = o.getBoundingClientRect(); if (b.width && b.height && getComputedStyle(o).visibility !== 'hidden' && getComputedStyle(o).display !== 'none' && croise(r, b)) chevauche.push(q); });
    const liens = [...e.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]);
    return { present: true, visible: getComputedStyle(e).display !== 'none' && r.width > 0, dedans: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      texte: (e.querySelector('.don-texte') || {}).textContent, liens, croix: !!e.querySelector('.fermer-bandeau'), chevauche, largeur: Math.round(r.width), style: getComputedStyle(e).position };
  }, selecteurs);
  const attendre = (page) => page.waitForFunction(() => { const e = document.getElementById('bandeau-donateurs'); return e && (e.querySelector('.don-texte') || {}).textContent; }, null, { timeout: 8000 }).catch(() => {});
  const CARTE = ['.barre', '.outils', '.recherche-lieu', '.panneau', '.legende', '.leaflet-control', '.deplier', '.bandeau-urgence', '.bandeau-crise'];
  for (const [nom, vue, mobile] of [['ordinateur', { width: 1400, height: 900 }, false], ['téléphone', { width: 390, height: 844 }, true], ['tablette', { width: 1024, height: 700 }, false]]) {
    const ctx = await navig.newContext({ viewport: vue, locale: 'fr-FR', isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
    const { page, erreurs } = await ouvrir(ctx, '/');
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    await attendre(page);
    const m = await mesurer(page, CARTE);
    if (m.visible && m.dedans && /42B\*\*\* 🇫🇷 a donné pour soutenir le projet/.test(m.texte || '') && m.croix) ok(`${nom} : bandeau des donateurs visible (« ${m.texte} »)`); else ko(`${nom} : bandeau ` + JSON.stringify(m));
    if (m.visible && !m.chevauche.length) ok(`${nom} : bandeau sans chevauchement de la barre du haut, de la recherche, du panneau, de la légende ni des boutons`); else ko(`${nom} : bandeau chevauche ` + JSON.stringify(m.chevauche));
    if (nom === 'ordinateur') {
      if (m.liens.length === 1 && m.liens[0][0] === 'Faire un don' && m.liens[0][1] === 'https://www.helloasso.com/associations/asso-essai/formulaires/form-1' && m.liens[0][2] === '_blank' && m.liens[0][3] === 'noopener') ok('ordinateur : lien « Faire un don » des réglages, nouvel onglet, pas de lien GitHub'); else ko('ordinateur : liens ' + JSON.stringify(m.liens));
      // Mode urgence : le bandeau s'efface
      await page.evaluate(() => document.body.classList.add('mode-urgence'));
      const u = await mesurer(page, []);
      if (!u.visible) ok('ordinateur : bandeau caché en mode urgence'); else ko('ordinateur : bandeau visible en mode urgence');
      await page.evaluate(() => document.body.classList.remove('mode-urgence'));
    }
    await capture(page, 'donateurs-' + nom.normalize('NFD').replace(/[^a-z]/g, ''));
    if (nom === 'téléphone') {
      await page.click('#bandeau-donateurs .fermer-bandeau');
      const ferme = await page.evaluate(() => ({ parti: !document.getElementById('bandeau-donateurs'), memo: localStorage.getItem('gaulix_donateurs_masque') }));
      if (ferme.parti && ferme.memo === '1') ok('téléphone : croix = bandeau fermé et mémorisé'); else ko('téléphone : croix ' + JSON.stringify(ferme));
    }
    bilanErreurs(erreurs, 'donateurs (' + nom + ')');
    await ctx.close();
  }
  // Page publique (sans style.css) : le bandeau a son style, en bas, sans toucher le bandeau du haut ni la légende
  for (const [nom, vue] of [['ordinateur', { width: 1280, height: 800 }], ['téléphone', { width: 390, height: 844 }]]) {
    const ctx = await navig.newContext({ viewport: vue, locale: 'fr-FR', isMobile: nom === 'téléphone', hasTouch: nom === 'téléphone' });
    const { page, erreurs } = await ouvrir(ctx, '/publique.html');
    await attendre(page);
    const m = await mesurer(page, ['.bandeau', '.legende', '.leaflet-control', '#bandeau-monde']);
    if (m.visible && m.dedans && m.style === 'fixed' && m.largeur > 150 && /42B\*\*\*/.test(m.texte || '')) ok(`page publique (${nom}) : bandeau stylé et visible`); else ko(`page publique (${nom}) : bandeau ` + JSON.stringify(m));
    if (m.visible && !m.chevauche.length) ok(`page publique (${nom}) : sans chevauchement`); else ko(`page publique (${nom}) : chevauche ` + JSON.stringify(m.chevauche));
    await capture(page, 'donateurs-publique-' + (nom === 'téléphone' ? 'telephone' : 'ordinateur'));
    if (nom === 'ordinateur') {
      await page.click('#bandeau-donateurs .fermer-bandeau');
      if (await page.evaluate(() => !document.getElementById('bandeau-donateurs') && localStorage.getItem('publique_donateurs_masque') === '1')) ok('page publique : croix = bandeau fermé'); else ko('page publique : croix');
    }
    bilanErreurs(erreurs, 'donateurs (page publique, ' + nom + ')');
    await ctx.close();
  }
  // Nettoyage : le don retiré ne pollue pas les autres essais
  await fetch(BASE + '/api/donateurs/manuel/' + ajout.id, { method: 'DELETE', headers: entetes });
  await poster('/api/donateurs/reglages', { helloasso: { actif: false } });
}

async function essaiPagesPubliques(navig) {
  for (const [url, nom, attendu] of [['/publique.html', 'carte publique', '#carte .leaflet-pane, .leaflet-pane'], ['/topologie.html', 'graphe des liens', 'svg, canvas']]) {
    console.log(nom[0].toUpperCase() + nom.slice(1) + ' (visiteur)');
    const contexte = await navig.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
    await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); } catch { /* */ } });
    const { page, erreurs } = await ouvrir(contexte, url);
    if (await page.locator(attendu).count()) ok(`${nom} affichée`); else ko(`${nom} : contenu absent`);
    if (url === '/publique.html') { const h = await page.getAttribute('#lien-explorer', 'href').catch(() => null); if (h && h.startsWith('/?consultation&vue=')) ok('carte publique : lien « Explorer en détail »'); else ko('carte publique : lien d’exploration ' + h); }
    await capture(page, nom.replace(/ /g, '-'));
    bilanErreurs(erreurs, nom);
    await contexte.close();
  }
}

// Fenêtre « Secteurs d'alerte » : de quelles équipes parle la liste déroulante, et où les créer.
// Le cas « aucune équipe » est celui où l'utilisateur est perdu : le message doit lui dire quoi faire.
async function essaiSecteursEquipes(navig, cookie) {
  console.log('Secteurs d’alerte : lien vers les équipes de la carte');
  const H = { 'Content-Type': 'application/json', Cookie: `${cookie.name}=${cookie.value}` };
  const appel = async (m, url, b) => { const r = await fetch(BASE + url, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { statut: r.status, j: await r.json().catch(() => ({})) }; };
  const vider = async () => { const l = await appel('GET', '/api/equipes'); for (const e of l.j.equipes || []) await appel('DELETE', '/api/equipes/' + e.id, { retirerDesNoeuds: false }); };
  const ouvrirSecteurs = async (vue, mobile) => {
    const ctx = await navig.newContext({ viewport: vue, locale: 'fr-FR', ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await ctx.addCookies([cookie]);
    await ctx.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
    const o = await ouvrir(ctx, '/');
    await o.page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    await o.page.evaluate(() => ficheSecteurs());
    await o.page.waitForTimeout(1200);
    return { ctx, ...o };
  };
  const mesurer = (page) => page.evaluate(() => {
    const z = document.querySelector('.nouveau-sa');
    const al = z && z.querySelector('.alerte.attention');
    const note = z && z.querySelector('small.note');
    const lien = z && z.querySelector('[data-vers-equipes]');
    return { alerte: al ? al.textContent.replace(/\s+/g, ' ').trim() : null, note: note ? note.textContent.replace(/\s+/g, ' ').trim() : null,
      lien: lien ? lien.textContent.trim() : null, couleurAlerte: al ? getComputedStyle(al).color : null,
      options: [...(z ? z.querySelectorAll('[data-c="equipe"] option') : [])].map((o) => o.textContent),
      debordeX: document.documentElement.scrollWidth > innerWidth + 1 };
  });

  // 1) Aucune équipe sur la carte (ordinateur et téléphone 390 px)
  await vider();
  for (const [nom, vue, mobile] of [['ordinateur', { width: 1400, height: 900 }, false], ['téléphone 390 px', { width: 390, height: 844 }, true]]) {
    const { ctx, page, erreurs } = await ouvrirSecteurs(vue, mobile);
    const m = await mesurer(page);
    if (m.alerte && /Aucune équipe n’existe encore sur cette carte/.test(m.alerte) && /Programmer › 👥 Équipes/.test(m.alerte) && /Autres nœuds suivis/.test(m.alerte))
      ok(`${nom} : sans équipe, la fenêtre dit de quelles équipes il s’agit, où en créer une et quoi faire en attendant`);
    else ko(`${nom} : message « aucune équipe » : ` + JSON.stringify(m).slice(0, 300));
    if (m.lien === 'Créer une équipe de la carte') ok(`${nom} : lien « Créer une équipe de la carte »`); else ko(`${nom} : lien absent (${m.lien})`);
    if (m.couleurAlerte && !/rgba?\(0, 0, 0/.test(m.couleurAlerte)) ok(`${nom} : message lisible (${m.couleurAlerte})`); else ko(`${nom} : couleur du message : ${m.couleurAlerte}`);
    if (!m.debordeX) ok(`${nom} : pas de débordement horizontal`); else ko(`${nom} : la page déborde en largeur`);
    if (m.options.length === 1 && /aucune/.test(m.options[0])) ok(`${nom} : liste déroulante réduite à « — aucune — »`); else ko(`${nom} : options : ` + JSON.stringify(m.options));
    await capture(page, 'secteurs-equipes-' + (mobile ? 'telephone' : 'ordinateur'));
    // Le lien mène bien à l'écran où l'on crée les équipes
    await page.evaluate(() => document.querySelector('.nouveau-sa [data-vers-equipes]').click());
    await page.waitForTimeout(1500);
    const arrive = await page.evaluate(() => ({ equipes: !!document.querySelector('#fiche-contenu .equipes'), titre: (document.querySelector('#fiche-contenu h2') || {}).textContent || '' }));
    if (arrive.equipes) ok(`${nom} : le lien ouvre l’écran des équipes (${arrive.titre.trim().slice(0, 30)})`); else ko(`${nom} : le lien n’ouvre pas les équipes : ` + JSON.stringify(arrive));
    await capture(page, 'secteurs-vers-equipes-' + (mobile ? 'telephone' : 'ordinateur'));
    bilanErreurs(erreurs, `secteurs sans équipe (${nom})`);
    await ctx.close();
  }

  // 2) Une équipe existe : la phrase change, le lien reste, l'équipe est proposée
  const eq = await appel('POST', '/api/equipes', { nom: 'EqLien' });
  if (eq.statut !== 200) { ko('création de l’équipe d’essai : ' + JSON.stringify(eq.j).slice(0, 120)); return; }
  const { ctx, page, erreurs } = await ouvrirSecteurs({ width: 1400, height: 900 }, false);
  const m2 = await mesurer(page);
  if (m2.note && /Équipes de la carte/.test(m2.note) && /Programmer › 👥 Équipes/.test(m2.note) && !m2.alerte) ok('avec une équipe : la fenêtre rappelle d’où viennent les équipes');
  else ko('avec une équipe : ' + JSON.stringify(m2).slice(0, 300));
  if (m2.lien === 'Voir les équipes de la carte') ok('avec une équipe : lien « Voir les équipes de la carte »'); else ko('lien : ' + m2.lien);
  if (m2.options.some((o) => /EqLien/.test(o))) ok('l’équipe créée est proposée dans la liste'); else ko('options : ' + JSON.stringify(m2.options));
  bilanErreurs(erreurs, 'secteurs avec une équipe');
  await ctx.close();
  await appel('DELETE', '/api/equipes/' + eq.j.id, { retirerDesNoeuds: false });
}

// Boîte « Identifiant du nœud à écouter » : propositions au fil de la frappe, clavier, champ qui reste libre
async function essaiSuggestionsNoeuds(navig, cookie) {
  console.log('Boîte de saisie : propositions de nœuds au fil de la frappe');
  for (const [nom, vue, mobile] of [['ordinateur', { width: 1400, height: 900 }, false], ['téléphone 390 px', { width: 390, height: 844 }, true]]) {
    const ctx = await navig.newContext({ viewport: vue, locale: 'fr-FR', ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await ctx.addCookies([cookie]);
    await ctx.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
    const { page, erreurs } = await ouvrir(ctx, '/');
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    // Beaucoup de nœuds : on vérifie que la liste reste courte et que la frappe reste réactive
    await page.evaluate(() => {
      etat.noeuds.set(0x5a1e0043, { num: 0x5a1e0043, id: '!5a1e0043', nomCourt: 'MZN4', nomLong: 'Mézenc 43 relais' });
      etat.noeuds.set(0x5a1e0044, { num: 0x5a1e0044, id: '!5a1e0044', nomCourt: 'PUY1', nomLong: 'Le Puy-en-Velay 43' });
      for (let i = 0; i < 3000; i++) { const n = 0x60000000 + i; etat.noeuds.set(n, { num: n, id: '!' + n.toString(16), nomCourt: 'R' + i, nomLong: 'Remplissage ' + i }); }
      window.__portee = testPortee();
    });
    await page.waitForSelector('#dlg-saisir[open] #saisir-champ', { timeout: 5000 });
    // Accents et casse ignorés : « mezenc » trouve « Mézenc 43 relais »
    const t0 = Date.now();
    await page.locator('#saisir-champ').fill('mezenc');
    await page.waitForFunction(() => { const p = document.querySelector('#saisir-props'); return p && !p.hidden && p.children.length; }, null, { timeout: 4000 }).catch(() => {});
    const delai = Date.now() - t0;
    const l1 = await page.evaluate(() => ({
      nb: document.querySelectorAll('#saisir-props button').length,
      premier: (document.querySelector('#saisir-props button b') || {}).textContent || '',
      detail: (document.querySelector('#saisir-props button small') || {}).textContent || '',
      role: (document.querySelector('#saisir-props') || {}).getAttribute('role'),
      combo: document.querySelector('#saisir-champ').getAttribute('role'),
      deploye: document.querySelector('#saisir-champ').getAttribute('aria-expanded'),
      debordeX: document.querySelector('#dlg-saisir').scrollWidth > innerWidth + 1,
    }));
    if (l1.nb >= 1 && /Mézenc 43 relais/.test(l1.premier)) ok(`${nom} : « mezenc » propose « ${l1.premier} » (accents et casse ignorés)`); else ko(`${nom} : propositions : ` + JSON.stringify(l1));
    if (/!5a1e0043/.test(l1.detail)) ok(`${nom} : l’identifiant est montré sous le nom`); else ko(`${nom} : détail : ${l1.detail}`);
    if (l1.role === 'listbox' && l1.combo === 'combobox' && l1.deploye === 'true') ok(`${nom} : liste annoncée aux lecteurs d’écran (combobox / listbox)`); else ko(`${nom} : accessibilité : ` + JSON.stringify(l1));
    if (!l1.debordeX) ok(`${nom} : la boîte ne déborde pas en largeur`); else ko(`${nom} : la boîte déborde en largeur`);
    // Plafond des propositions avec 3 000 nœuds, et réactivité
    await page.locator('#saisir-champ').fill('r1');
    await page.waitForTimeout(400);
    const nb2 = await page.evaluate(() => document.querySelectorAll('#saisir-props button').length);
    if (nb2 > 0 && nb2 <= 8) ok(`${nom} : au plus 8 propositions avec 3 000 nœuds (${nb2})`); else ko(`${nom} : ${nb2} propositions`);
    if (delai < 3000) ok(`${nom} : propositions affichées en ${delai} ms`); else ko(`${nom} : propositions trop lentes (${delai} ms)`);
    // Clavier : ↓ vise la première, Entrée la prend et remplit le champ
    await page.locator('#saisir-champ').fill('puy');
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowDown');
    const vise1 = await page.evaluate(() => { const b = document.querySelector('#saisir-props button'); return { classe: b && b.classList.contains('vise'), choisi: b && b.getAttribute('aria-selected'), actif: document.querySelector('#saisir-champ').getAttribute('aria-activedescendant') }; });
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => ({ valeur: document.querySelector('#saisir-champ').value, cachee: document.querySelector('#saisir-props').hidden, ouverte: !!document.querySelector('#dlg-saisir[open]') }));
    if (vise1.classe && vise1.choisi === 'true' && vise1.actif === 'saisir-prop-0') ok(`${nom} : ↓ vise la première proposition (annoncée)`); else ko(`${nom} : ↓ : ` + JSON.stringify(vise1));
    if (apres.valeur === '!5a1e0044' && apres.cachee && apres.ouverte) ok(`${nom} : Entrée prend la proposition et remplit le champ sans valider la boîte`); else ko(`${nom} : après Entrée : ` + JSON.stringify(apres));
    // Échap referme d'abord la liste, puis la boîte
    await page.locator('#saisir-champ').fill('mezenc');
    await page.waitForTimeout(400);
    await capture(page, 'suggestions-noeuds-' + (mobile ? 'telephone' : 'ordinateur'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const ech1 = await page.evaluate(() => ({ cachee: document.querySelector('#saisir-props').hidden, ouverte: !!document.querySelector('#dlg-saisir[open]') }));
    if (ech1.cachee && ech1.ouverte) ok(`${nom} : Échap referme la liste sans fermer la boîte`); else ko(`${nom} : premier Échap : ` + JSON.stringify(ech1));
    // Champ libre : un identifiant inconnu de la carte est accepté tel quel
    await page.locator('#saisir-champ').fill('!deadbeef');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    const libre = await page.evaluate(() => ({ num: typeof portee !== 'undefined' ? portee.num : null, ouverte: !!document.querySelector('#dlg-saisir[open]') }));
    if (libre.num === 0xdeadbeef && !libre.ouverte) ok(`${nom} : un identifiant inconnu de la carte reste acceptable (écoute lancée)`); else ko(`${nom} : champ libre : ` + JSON.stringify(libre));
    await page.evaluate(() => { try { arreterPortee(); } catch { /* */ } });
    bilanErreurs(erreurs, `propositions de nœuds (${nom})`);
    await ctx.close();
  }
}

(async () => {
  let code = 0;
  try {
    demarrerServeur();
    await attendreServeur();
    const cookie = await creerAdmin();
    navigateur = await chromium.launch();
    const contexte = await navigateur.newContext({ viewport: { width: 1400, height: 900 }, locale: 'fr-FR' });
    await contexte.addCookies([cookie]);
    await contexte.addInitScript(() => { try { localStorage.setItem('gaulix_visite', 'true'); if (!localStorage.getItem('gaulix_langue')) localStorage.setItem('gaulix_langue', 'fr'); } catch { /* */ } });
    await essaiCarteFrancais(contexte);
    await essaiAnglais(contexte);
    await essaiConsultation(contexte);
    await contexte.close();
    await essaiDemoVisiteur(navigateur);
    await essaiAutresPresets(navigateur, cookie);
    await essaiRejoindre(navigateur, cookie);
    await essaiRegistreEtExports(navigateur, cookie);
    await essaiVue3D(navigateur);
    await essaiProfil3D(navigateur);
    await essaiAdministrationALaDemande(navigateur, cookie);
    await essaiMotDePasseOublie(navigateur, cookie);
    await essaiFrequentation(navigateur, cookie);
    await essaiPasserelleMembre(navigateur, cookie);
    await essaiAgentDirect(cookie);
    await essaiUsbAuto(navigateur, cookie);
    await essaiEcran150(navigateur);
    await essaiTelephone(navigateur);
    await essaiRechercheMessages(navigateur, cookie);
    await essaiUrgenceEtSecteurs(navigateur, cookie);
    await essaiSecteursEquipes(navigateur, cookie);
    await essaiSuggestionsNoeuds(navigateur, cookie);
    await essaiDonateurs(navigateur, cookie);
    await essaiPartager(navigateur, cookie);
    await essaiPagesPubliques(navigateur);
    code = echecs ? 1 : 0;
    console.log(echecs ? `\n${echecs} problème(s) : captures et journal dans tests/resultats/` : '\nTout est bon ✓');
  } catch (e) {
    console.error('Essai interrompu :', e.message);
    code = 1;
  } finally {
    if (navigateur) await navigateur.close().catch(() => {});
    // Attendre la fin réelle du serveur : il peut encore écrire (relief, donateurs…) pendant la suppression du dossier
    if (serveur) { const fin = new Promise((r) => { serveur.once('exit', r); setTimeout(r, 5000); }); serveur.kill(); await fin; }
    try { fs.rmSync(donnees, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) { console.error('Dossier d’essai non supprimé :', e.message); }
    process.exit(code);
  }
})();
