'use strict';
// Zone « sur mesure » : un ou plusieurs États/provinces/territoires contigus d'un même pays, choisis
// dans l'assistant d'installation ou la page Réglages. Généralise le mécanisme introduit pour les
// États-Unis (voir wiki/Conception-zones-multi-regions.md) à plusieurs pays, sans dupliquer le code :
// un seul moteur ici, paramétré par un petit registre (REGISTRE ci-dessous) qui dit, pour chaque pays,
// où trouver son fichier de contours et combien de régions au plus peuvent être cochées ensemble.
//
// Code de zone : « US-CA » (une seule région), « CA-ON+QC » (plusieurs régions, jusqu'au plafond du
// pays). Les codes sont toujours rangés par ordre alphabétique dans le code de zone, pour qu'une même
// sélection donne toujours le même code (et le même nom de fichiers en cache sur le disque).
const path = require('path');
const { lireJson } = require('./fichiers');

// Un code région fait de 2 à 4 lettres majuscules : la plupart des pays utilisent 2 lettres (États
// américains, provinces canadiennes), l'Australie va jusqu'à 4 (NSW, QLD, ACT…).
const RE_REGION = '[A-Z]{2,4}';

// ---- Registre des pays qui proposent une zone « sur mesure » -----------------------------------
// fichier : contour détaillé dans donnees-ref/, drapeau : affiché dans le sélecteur de l'interface,
// maxRegions : nombre de cases cochables à la fois (voir le garde-fou mémoire plus bas pour le vrai
// plafond, bien plus contraignant que ce nombre).
const REGISTRE = {
  US: { fichier: 'etats-us.geojson', drapeau: '🇺🇸', maxRegions: 6 },
  CA: { fichier: 'regions-ca.geojson', drapeau: '🇨🇦', maxRegions: 6 },
  AU: { fichier: 'regions-au.geojson', drapeau: '🇦🇺', maxRegions: 6 },
};
const PAYS_CONNUS = Object.keys(REGISTRE); // ['US', 'CA', 'AU'], dans cet ordre pour le sélecteur

function paysConnu(pays) { return REGISTRE[String(pays || '').toUpperCase()]; }

// Expression régulière d'un code complet pour un pays donné, ex. /^US-([A-Z]{2,4})((?:\+[A-Z]{2,4}){0,5})$/
function reCode(pays) {
  const p = paysConnu(pays);
  if (!p) return null;
  return new RegExp(`^${pays}-(${RE_REGION})((?:\\+${RE_REGION}){0,${p.maxRegions - 1}})$`);
}
// Pays d'un code de zone (US-CA+NV -> 'US'), ou null si le code n'est d'aucun pays connu d'ici (département
// français, carré monde MN50E004…) : ne regarde que le préfixe, la validité complète est vérifiée à part.
function paysDuCode(code) {
  const m = /^([A-Z]{2})-/.exec(String(code || '').toUpperCase());
  return m && paysConnu(m[1]) ? m[1] : null;
}

const donneesParPays = {}; // chargées une seule fois par pays, à la demande
function donnees(pays) {
  const p = paysConnu(pays);
  if (!p) return null;
  if (!donneesParPays[pays]) donneesParPays[pays] = lireJson(path.join(__dirname, '..', 'donnees-ref', p.fichier));
  return donneesParPays[pays];
}
function feature(pays, code) {
  const d = donnees(pays);
  return d ? d.features.find((f) => f.properties.code === code) : null;
}
// Liste des régions d'un pays (pour le sélecteur de l'interface), triée par nom français
function listeRegions(pays) {
  const d = donnees(pays);
  if (!d) return [];
  return d.features.map((f) => ({ code: f.properties.code, nom: f.properties.nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
const codesValides = (pays) => { const d = donnees(pays); return d ? new Set(d.features.map((f) => f.properties.code)) : new Set(); };

function codesRegion(code) {
  const pays = paysDuCode(code);
  if (!pays) return [];
  const re = reCode(pays);
  const m = re.exec(String(code).toUpperCase());
  if (!m) return [];
  const codes = [m[1], ...m[2].split('+').filter(Boolean)];
  return [...new Set(codes)].sort();
}
// Code canonique (toujours trié) à partir d'un pays et d'une liste de régions choisies dans l'interface
function construireCode(pays, codes) {
  const p = paysConnu(pays);
  if (!p) return '';
  const u = [...new Set((codes || []).map((c) => String(c).trim().toUpperCase()))].filter(Boolean).sort();
  return u.length ? `${String(pays).toUpperCase()}-${u.join('+')}` : '';
}
function estCodeRegion(code) {
  const pays = paysDuCode(code);
  if (!pays) return false;
  const codes = codesRegion(code);
  if (!codes.length) return false;
  const valides = codesValides(pays);
  return codes.every((c) => valides.has(c));
}

// Rassemble les polygones (anneau extérieur + trous) de chaque région choisie dans un seul MultiPolygon :
// pas de vraie fusion géométrique (inutile ici, voir contourDepartement/dansDepartement qui testent juste
// « le point est dans l'un des anneaux »), mais un contour qui couvre l'union des régions sélectionnées.
function contourRegion(code) {
  const pays = paysDuCode(code);
  const codes = codesRegion(code);
  if (!pays || !codes.length) return null;
  const polygones = [];
  for (const c of codes) {
    const f = feature(pays, c);
    if (!f) return null;
    const g = f.geometry;
    if (g.type === 'Polygon') polygones.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polygones.push(...g.coordinates);
  }
  return { type: 'MultiPolygon', coordinates: polygones };
}
// Rectangle englobant [sud, ouest, nord, est]
function rectangleRegion(code) {
  const g = contourRegion(code);
  if (!g) return null;
  let sud = 90, ouest = 180, nord = -90, est = -180;
  for (const poly of g.coordinates) for (const anneau of poly) for (const [lon, lat] of anneau) {
    sud = Math.min(sud, lat); nord = Math.max(nord, lat); ouest = Math.min(ouest, lon); est = Math.max(est, lon);
  }
  return [sud, ouest, nord, est];
}
// Nom lisible, sans drapeau (le drapeau est ajouté côté interface, voir drapeauPays() et son usage dans
// administration.js/app.js, pour ne rien changer au texte déjà enregistré dans reglages.json par une
// installation US-… existante)
function nomRegion(code) {
  const pays = paysDuCode(code);
  const codes = codesRegion(code);
  if (!pays || !codes.length) return null;
  const noms = codes.map((c) => { const f = feature(pays, c); return f ? f.properties.nom : c; });
  return noms.join(' + ');
}
function drapeauPays(pays) { const p = paysConnu(pays); return p ? p.drapeau : ''; }
function maxRegions(pays) { const p = paysConnu(pays); return p ? p.maxRegions : 0; }
// Liste des pays proposés par le sélecteur « Zone sur mesure » (ordre du registre : US, CA, AU)
function listePays() { return PAYS_CONNUS.map((c) => ({ code: c, drapeau: REGISTRE[c].drapeau, max: REGISTRE[c].maxRegions })); }

// Distance minimale (en degrés, approximation suffisante à cette échelle) entre deux anneaux de points
function distanceAnneaux(a, b) {
  let min = Infinity;
  for (const [x1, y1] of a) {
    for (const [x2, y2] of b) {
      const d = (x1 - x2) ** 2 + (y1 - y2) ** 2;
      if (d < min) min = d;
      if (min === 0) return 0;
    }
  }
  return Math.sqrt(min);
}
// Seuil de contiguïté : les contours étant simplifiés (≈ 11 à 50 m selon le pays), deux régions limitrophes
// sont encore bien plus proches que ce seuil (≈ 6 km) ; au-delà, on considère qu'elles ne se touchent pas.
const SEUIL_CONTIGU_DEG = 0.06;
function anneauxRegion(pays, c) {
  const f = feature(pays, c);
  if (!f) return [];
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((p) => p[0]); // anneau extérieur de chaque polygone (îles, enclaves…)
}
// Les régions choisies forment-elles un seul bloc connexe ? Best-effort (bords simplifiés) : utilisé
// pour avertir l'utilisateur, jamais pour bloquer la sélection (un vrai calcul de frontière partagée
// serait bien plus lourd).
function sontContigus(pays, codes) {
  const u = [...new Set(codes)];
  if (u.length <= 1) return true;
  const anneaux = {}; for (const c of u) anneaux[c] = anneauxRegion(pays, c);
  const touchent = (c1, c2) => anneaux[c1].some((a1) => anneaux[c2].some((a2) => distanceAnneaux(a1, a2) < SEUIL_CONTIGU_DEG));
  // Parcours en largeur : toutes les régions doivent être reliées entre elles de proche en proche
  const vus = new Set([u[0]]), a_visiter = [u[0]];
  while (a_visiter.length) {
    const c = a_visiter.pop();
    for (const autre of u) if (!vus.has(autre) && touchent(c, autre)) { vus.add(autre); a_visiter.push(autre); }
  }
  return vus.size === u.length;
}

// Surface approximative de la zone (avec la marge de relief.js/monde.js, MARGE_MONDE = 0,4°), pour avertir
// avant d'enregistrer une zone que le relief (grille à 250 m, voir le garde-fou de creerRelief) refuserait
// ensuite. Même formule que celle de creerRelief, en plus simple (rectangle, pas le vrai contour :
// volontairement pessimiste). Commune aux trois pays : la grille de relief ne connaît pas le pays, juste
// le rectangle englobant de la zone.
const MARGE_RELIEF_DEG = 0.4;
function surfaceApproxKm2(code) {
  const z = rectangleRegion(code);
  if (!z) return 0;
  const latMoy = ((z[0] + z[2]) / 2) * (Math.PI / 180);
  return (z[2] - z[0] + 2 * MARGE_RELIEF_DEG) * (z[3] - z[1] + 2 * MARGE_RELIEF_DEG) * 111 * 111 * Math.cos(latMoy);
}
// Correspond au plafond par défaut de RELIEF_CELLULES_MAX (160 000 000 cellules × 0,0625 km²/cellule,
// ≈ 10 Mkm²) : choisi pour que même le Nunavut (la plus étendue des régions couvertes ici, ≈ 9,16 Mkm²
// de rectangle englobant) passe seul, avec une marge d'environ 9 % — voir
// wiki/Conception-zones-multi-regions.md pour le détail par région. Au-delà, seules des unions de
// plusieurs très grandes régions restent refusées (voir la note de conception).
const LIMITE_SURFACE_KM2 = 160_000_000 * 0.0625;

module.exports = {
  PAYS_CONNUS, paysConnu, paysDuCode, drapeauPays, maxRegions, listePays, estCodeRegion, codesRegion,
  construireCode, contourRegion, rectangleRegion, nomRegion, listeRegions, sontContigus,
  surfaceApproxKm2, LIMITE_SURFACE_KM2,
};
