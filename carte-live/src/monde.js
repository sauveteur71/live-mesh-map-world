'use strict';
// Relief hors de France : modèle Copernicus DEM GLO-30 (ESA, 30 m, monde entier), en accès libre sur AWS.
// Les zones d'étude hors de France sont des carrés de 1° × 1°, nommés d'après leur coin sud-ouest :
// « MN40W075 » = 40° à 41° N, 75° à 74° O. Une marge de 0,4° (≈ 44 km) les entoure pour que la couverture
// d'un point proche du bord ne soit pas tronquée.
const { fromCustomClient, BaseClient, Pool } = require('geotiff');

// Décodage des tuiles (DEFLATE + prédicteur flottant, ≈ 0,3 à 0,6 s par tuile) dans un fil séparé : dans le fil
// principal, chaque tuile figeait la carte plusieurs centaines de millisecondes. Un seul fil, créé pour le chargement
// puis arrêté : ≈ 50 Mo de plus pendant le chargement seulement (conteneur limité à 512 Mo). RELIEF_SANS_FIL=1 : décodage
// dans le fil principal, comme avant.
// Fil abandonné (bloqué, ou erreur dans le fil que geotiff 2.1.3 ne remonte pas) : décodage dans le fil principal,
// puis nouvel essai du fil séparé après 10 min (et non jusqu'au redémarrage).
const PANNE_POOL_MS = 10 * 60000;
let pool = null, utilisateursPool = 0, poolEnPanneDepuis = 0;
let journalMonde = () => {};
function prendrePool() {
  if (process.env.RELIEF_SANS_FIL === '1') return null;
  if (poolEnPanneDepuis) { if (Date.now() - poolEnPanneDepuis < PANNE_POOL_MS) return null; poolEnPanneDepuis = 0; journalMonde('[Relief] fil de décodage Copernicus réautorisé après 10 min'); }
  try { if (!pool) pool = new Pool(1); utilisateursPool++; return pool; } catch (e) { poolEnPanneDepuis = Date.now(); journalMonde('[Relief] fil de décodage Copernicus impossible, décodage dans le fil principal :', e.message); return null; }
}
function rendrePool(p) {
  if (!p || p !== pool) return;
  if (--utilisateursPool <= 0) { try { pool.destroy(); } catch { /* déjà arrêté */ } pool = null; utilisateursPool = 0; }
}
// Fil de décodage bloqué (il ne répond plus) : arrêté, et les tuiles suivantes décodées dans le fil principal.
// Une autre zone qui partageait ce fil le voit disparaître (fil !== pool) et passe elle aussi au fil principal.
function abandonnerPool(raison) {
  poolEnPanneDepuis = Date.now();
  journalMonde(`[Relief] fil de décodage Copernicus abandonné (${raison}) : décodage dans le fil principal pendant 10 min`);
  if (pool) { try { pool.destroy(); } catch { /* déjà arrêté */ } }
  pool = null; utilisateursPool = 0;
}
const avecDelai = (p, ms, quoi) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error(quoi + ' : délai dépassé')), ms).unref())]);
// Délais séparés : chaque requête HTTP vers AWS a le sien (DELAI_TELECHARGEMENT_MS, par plage d'octets), et le délai de
// décodage (180 s) ne couvre plus un téléchargement lent — un réseau lent n'est pas un fil bloqué, et n'abandonne pas le fil.
const DELAI_TELECHARGEMENT_MS = Number(process.env.COPERNICUS_DELAI_S) * 1000 || 60000;
class ClientTuile extends BaseClient {
  async request({ headers, signal } = {}) {
    const minuterie = AbortSignal.timeout(DELAI_TELECHARGEMENT_MS);
    const s = signal ? AbortSignal.any([signal, minuterie]) : minuterie;
    let reponse;
    try { reponse = await fetch(this.url, { headers, signal: s }); } catch (e) { throw minuterie.aborted ? new Error(`téléchargement de la tuile trop lent (${DELAI_TELECHARGEMENT_MS / 1000} s)`) : e; }
    return {
      ok: reponse.ok,
      status: reponse.status,
      getHeader: (n) => reponse.headers.get(n),
      getData: async () => { try { return await reponse.arrayBuffer(); } catch (e) { throw minuterie.aborted ? new Error(`téléchargement de la tuile trop lent (${DELAI_TELECHARGEMENT_MS / 1000} s)`) : e; } },
    };
  }
}
const ouvrirTuile = (url) => fromCustomClient(new ClientTuile(url), { allowFullFile: false });
const ceder = () => new Promise((r) => setImmediate(r));

const RE_CODE = /^M([NS])(\d{2})([EW])(\d{3})$/;
const MARGE_MONDE = 0.4;
const pad = (n, l) => String(Math.abs(n)).padStart(l, '0');

const estCodeMonde = (code) => RE_CODE.test(String(code || '').toUpperCase());
function codeMonde(lat, lon) {
  const la = Math.floor(lat), lo = Math.floor(lon);
  return `M${la >= 0 ? 'N' : 'S'}${pad(la, 2)}${lo >= 0 ? 'E' : 'W'}${pad(lo, 3)}`;
}
// [sud, ouest, nord, est]
function rectangleMonde(code) {
  const m = RE_CODE.exec(String(code || '').toUpperCase());
  if (!m) return null;
  const sud = (m[1] === 'N' ? 1 : -1) * Number(m[2]), ouest = (m[3] === 'E' ? 1 : -1) * Number(m[4]);
  return [sud, ouest, sud + 1, ouest + 1];
}
function contourMonde(code) {
  const r = rectangleMonde(code);
  if (!r) return null;
  const [s, o, n, e] = r;
  return { type: 'Polygon', coordinates: [[[o, s], [e, s], [e, n], [o, n], [o, s]]] };
}
const deg = (v, pos, neg) => `${Math.abs(v)}°${v >= 0 ? pos : neg}`;
function nomMonde(code) {
  const r = rectangleMonde(code);
  if (!r) return null;
  return `${deg(r[0], 'N', 'S')}–${deg(r[2], 'N', 'S')} · ${deg(r[1], 'E', 'W')}–${deg(r[3], 'E', 'W')}`;
}

// Tuile Copernicus de 1° contenant le coin sud-ouest (la, lo)
function urlTuile(la, lo) {
  const n = `Copernicus_DSM_COG_10_${la >= 0 ? 'N' : 'S'}${pad(la, 2)}_00_${lo >= 0 ? 'E' : 'W'}${pad(lo, 3)}_00_DEM`;
  return `${process.env.COPERNICUS_URL || 'https://copernicus-dem-30m.s3.amazonaws.com'}/${n}/${n}.tif`;
}

// Altitudes d'une grille régulière (ligne 0 = sud) : chaque tuile de 1° est lue une fois, en version réduite
// (aperçu du fichier, ≈ 120 m), puis échantillonnée en bilinéaire. Mer et tuiles absentes : NaN.
// Les tuiles sont lues une par une (et non trois à la fois) : la mémoire reste basse et la carte réactive.
async function grilleCopernicus({ sud, ouest, pasLat, pasLon, nLat, nLon }, progression = () => {}, arrete = () => false, journal = null) {
  if (journal) journalMonde = journal;
  const z = new Float32Array(nLat * nLon).fill(NaN);
  let fil = null, filPris = false; // fil de décodage pris à la première tuile à décoder (pas pour la mer)
  const nord = sud + (nLat - 1) * pasLat, est = ouest + (nLon - 1) * pasLon;
  const tuiles = [];
  for (let la = Math.floor(sud); la <= Math.floor(nord); la++) for (let lo = Math.floor(ouest); lo <= Math.floor(est); lo++) tuiles.push([la, lo]);
  let faites = 0;
  const lire = async ([la, lo]) => {
    if (arrete()) throw new Error('chargement interrompu');
    let r = null, w = 0, h = 0, absente = false;
    // Tuile absente du jeu de données (mer, zone sans relevé) : HTTP 403 ou 404
    try { const t = await fetch(urlTuile(la, lo), { method: 'HEAD', signal: AbortSignal.timeout(20000) }); absente = t.status === 403 || t.status === 404; } catch { /* on essaie quand même */ }
    for (let essai = 0; essai < 3 && !r && !absente; essai++) {
      try {
        if (!filPris) { filPris = true; fil = prendrePool(); }
        if (fil && fil !== pool) fil = null; // fil abandonné par une autre zone : il est détruit, on continue sans lui
        const tiff = await ouvrirTuile(urlTuile(la, lo));
        const im0 = await tiff.getImage();
        // ≈ 120 m : assez fin pour une grille de 250 m, et les aperçus du fichier évitent de tout télécharger
        const cw = Math.max(60, Math.round(im0.getWidth() / 4)), ch = Math.max(60, Math.round(im0.getHeight() / 4));
        // Plus petit aperçu au moins aussi fin que voulu (le premier d'un COG est l'image entière)
        let im = im0;
        const n = await tiff.getImageCount();
        for (let k = n - 1; k >= 1; k--) { const c = await tiff.getImage(k); if (c.getWidth() >= cw && c.getHeight() >= ch) { im = c; break; } }
        if (im === im0) {
          w = cw; h = ch;
          r = (await avecDelai(tiff.readRasters({ width: w, height: h, resampleMethod: 'bilinear', pool: fil || undefined }), 180000, 'décodage de la tuile'))[0];
        } else {
          // Lu en 4 bandes : la recopie des pixels (fil principal) est découpée, le décodage reste dans le fil séparé
          w = im.getWidth(); h = im.getHeight();
          const tout = new Float32Array(w * h), nb = fil ? 4 : 1;
          for (let b = 0; b < nb; b++) {
            const y0 = Math.floor((b * h) / nb), y1 = Math.floor(((b + 1) * h) / nb);
            const part = (await avecDelai(im.readRasters({ window: [0, y0, w, y1], pool: fil || undefined }), 180000, 'décodage de la tuile'))[0];
            tout.set(part, y0 * w);
            await ceder();
          }
          r = tout;
        }
      } catch (e) {
        if (fil && fil === pool && /délai dépassé/.test(e.message)) abandonnerPool(e.message);
        if (fil && fil !== pool) fil = null;
        if (essai === 2) throw new Error(`relief Copernicus indisponible (${e.message})`);
        await new Promise((res) => setTimeout(res, 2000 * (essai + 1)));
      }
    }
    if (r) {
      // Pixels : ligne 0 = nord, centrés (pixel-is-point décalé d'un demi-pixel négligé à cette échelle)
      const i0 = Math.max(0, Math.ceil((la - sud) / pasLat)), i1 = Math.min(nLat - 1, Math.floor((la + 1 - sud) / pasLat));
      const j0 = Math.max(0, Math.ceil((lo - ouest) / pasLon)), j1 = Math.min(nLon - 1, Math.floor((lo + 1 - ouest) / pasLon));
      await ceder();
      for (let i = i0; i <= i1; i++) {
        if ((i - i0) % 150 === 149) await ceder(); // recopie par paquets de lignes
        const fy = (1 - (sud + i * pasLat - la)) * (h - 1);
        const y = Math.min(h - 2, Math.max(0, Math.floor(fy))), dy = Math.min(1, Math.max(0, fy - y));
        for (let j = j0; j <= j1; j++) {
          const fx = (ouest + j * pasLon - lo) * (w - 1);
          const x = Math.min(w - 2, Math.max(0, Math.floor(fx))), dx = Math.min(1, Math.max(0, fx - x));
          const a = r[y * w + x], b = r[y * w + x + 1], c = r[(y + 1) * w + x], d = r[(y + 1) * w + x + 1];
          const v = a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
          z[i * nLon + j] = Number.isFinite(v) && v > -1000 ? v : NaN;
        }
      }
    }
    faites++;
    progression(Math.round((faites / tuiles.length) * 100));
  };
  try {
    for (const t of tuiles) { await lire(t); await ceder(); }
  } finally { rendrePool(fil); }
  return z;
}

// Villes et villages d'un carré mondial, ou de toute autre zone hors de France dont on a le rectangle englobant
// (OpenStreetMap : place=city|town|village avec population)
const SERVEURS_OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
async function lieuxZone(r) {
  if (!r) return [];
  const q = `[out:json][timeout:90];node["place"~"^(city|town|village)$"]["population"](${r.join(',')});out body;`;
  let derniere = null;
  for (const url of SERVEURS_OVERPASS) {
    try {
      const rep = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'live-mesh-map-world/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(120000) });
      if (!rep.ok) throw new Error('HTTP ' + rep.status);
      const j = await rep.json();
      return j.elements.map((e) => ({ nom: (e.tags && (e.tags['name:en'] || e.tags.name)) || '?', lat: e.lat, lon: e.lon, population: parseInt(String(e.tags.population).replace(/[^\d]/g, ''), 10) || 0 }))
        .filter((x) => x.population > 0);
    } catch (e) { derniere = e; }
  }
  throw new Error('OpenStreetMap (Overpass) : ' + (derniere ? derniere.message : 'indisponible'));
}
// Compatibilité : carré mondial par son code (MN50E004…)
const lieuxMonde = (code) => lieuxZone(rectangleMonde(code));

// Le carré et ses 8 voisins (3 × 3 carrés de 1°) : de quoi couvrir la zone de la carte et ses alentours
function voisinsMonde(code) {
  const r = rectangleMonde(code);
  if (!r) return [];
  const l = [];
  for (let dLat = -1; dLat <= 1; dLat++) for (let dLon = -1; dLon <= 1; dLon++) {
    const la = r[0] + dLat, lo = r[1] + dLon;
    if (la < -90 || la > 89) continue;
    l.push(codeMonde(la + 0.5, ((lo + 180 + 360) % 360) - 180 + 0.5));
  }
  return l;
}
module.exports = { voisinsMonde, lieuxMonde, lieuxZone, MARGE_MONDE, estCodeMonde, codeMonde, rectangleMonde, contourMonde, nomMonde, grilleCopernicus };
