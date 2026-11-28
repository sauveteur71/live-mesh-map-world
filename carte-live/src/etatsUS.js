'use strict';
// Zone « sur mesure » : un État des États-Unis, ou une union de plusieurs États contigus choisis dans
// l'assistant d'installation ou la page Réglages. Contour détaillé : Natural Earth / US Census (us-atlas,
// licence libre, voir donnees-ref/etats-us.geojson), simplifié à 4 décimales (~11 m) pour rester léger.
//
// Code de zone : « US-CA » (un État) ou « US-CA+NV+OR » (plusieurs États, jusqu'à MAX_ETATS). Les codes sont
// toujours rangés par ordre alphabétique dans le code de zone, pour qu'une même sélection donne toujours le
// même code (et le même nom de fichiers en cache sur le disque).
const path = require('path');
const { lireJson } = require('./fichiers');

const MAX_ETATS = 6;
const RE_CODE = /^US-([A-Z]{2})((?:\+[A-Z]{2}){0,5})$/;

let geojson = null; // chargé une seule fois
function donnees() {
  if (!geojson) geojson = lireJson(path.join(__dirname, '..', 'donnees-ref', 'etats-us.geojson'));
  return geojson;
}
function feature(code) { return donnees().features.find((f) => f.properties.code === code); }

// Liste des 50 États + DC, triée par nom français (pour le sélecteur de l'interface)
function listeEtatsUS() {
  return donnees().features.map((f) => ({ code: f.properties.code, nom: f.properties.nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
const CODES_VALIDES = () => new Set(donnees().features.map((f) => f.properties.code));

function codesEtatsUS(code) {
  const m = RE_CODE.exec(String(code || '').toUpperCase());
  if (!m) return [];
  const codes = [m[1], ...m[2].split('+').filter(Boolean)];
  return [...new Set(codes)].sort();
}
// Code canonique (toujours trié) à partir d'une liste d'États choisis dans l'interface
function construireCode(codes) {
  const u = [...new Set((codes || []).map((c) => String(c).trim().toUpperCase()))].filter(Boolean).sort();
  return u.length ? `US-${u.join('+')}` : '';
}
function estCodeEtatsUS(code) {
  const m = RE_CODE.exec(String(code || '').toUpperCase());
  if (!m) return false;
  const codes = codesEtatsUS(code);
  if (!codes.length || codes.length > MAX_ETATS) return false;
  const valides = CODES_VALIDES();
  return codes.every((c) => valides.has(c));
}

// Rassemble les polygones (anneau extérieur + trous) de chaque État choisi dans un seul MultiPolygon :
// pas de vraie fusion géométrique (inutile ici, voir contourDepartement/dansDepartement qui testent juste
// « le point est dans l'un des anneaux »), mais un contour qui couvre l'union des États sélectionnés.
function contourEtatsUS(code) {
  const codes = codesEtatsUS(code);
  if (!codes.length) return null;
  const polygones = [];
  for (const c of codes) {
    const f = feature(c);
    if (!f) return null;
    const g = f.geometry;
    if (g.type === 'Polygon') polygones.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polygones.push(...g.coordinates);
  }
  return { type: 'MultiPolygon', coordinates: polygones };
}
// Rectangle englobant [sud, ouest, nord, est]
function rectangleEtatsUS(code) {
  const g = contourEtatsUS(code);
  if (!g) return null;
  let sud = 90, ouest = 180, nord = -90, est = -180;
  for (const poly of g.coordinates) for (const anneau of poly) for (const [lon, lat] of anneau) {
    sud = Math.min(sud, lat); nord = Math.max(nord, lat); ouest = Math.min(ouest, lon); est = Math.max(est, lon);
  }
  return [sud, ouest, nord, est];
}
function nomEtatsUS(code) {
  const codes = codesEtatsUS(code);
  if (!codes.length) return null;
  const noms = codes.map((c) => { const f = feature(c); return f ? f.properties.nom : c; });
  return noms.join(' + ');
}

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
// Seuil de contiguïté : les contours étant simplifiés (≈ 11 m), deux États limitrophes sont encore bien plus
// proches que ce seuil (≈ 6 km) ; au-delà, on considère qu'ils ne se touchent pas.
const SEUIL_CONTIGU_DEG = 0.06;
function anneauxEtat(c) {
  const f = feature(c);
  if (!f) return [];
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((p) => p[0]); // anneau extérieur de chaque polygone (îles, enclaves…)
}
// Les États choisis forment-ils un seul bloc connexe ? Best-effort (bords simplifiés) : utilisé pour avertir
// l'utilisateur, jamais pour bloquer la sélection (un vrai calcul de frontière partagée serait bien plus lourd).
function sontContigus(codes) {
  const u = [...new Set(codes)];
  if (u.length <= 1) return true;
  const anneaux = {}; for (const c of u) anneaux[c] = anneauxEtat(c);
  const touchent = (c1, c2) => anneaux[c1].some((a1) => anneaux[c2].some((a2) => distanceAnneaux(a1, a2) < SEUIL_CONTIGU_DEG));
  // Parcours en largeur : tous les États doivent être reliés entre eux de proche en proche
  const vus = new Set([u[0]]), a_visiter = [u[0]];
  while (a_visiter.length) {
    const c = a_visiter.pop();
    for (const autre of u) if (!vus.has(autre) && touchent(c, autre)) { vus.add(autre); a_visiter.push(autre); }
  }
  return vus.size === u.length;
}

// Surface approximative de la zone (avec la marge de relief.js/monde.js, MARGE_MONDE = 0,4°), pour avertir avant
// d'enregistrer une zone que le relief (grille à 250 m, voir le garde-fou de creerRelief) refuserait ensuite.
// Même formule que celle de creerRelief, en plus simple (rectangle, pas le vrai contour : volontairement pessimiste).
const MARGE_RELIEF_DEG = 0.4;
function surfaceApproxKm2(code) {
  const z = rectangleEtatsUS(code);
  if (!z) return 0;
  const latMoy = ((z[0] + z[2]) / 2) * (Math.PI / 180);
  return (z[2] - z[0] + 2 * MARGE_RELIEF_DEG) * (z[3] - z[1] + 2 * MARGE_RELIEF_DEG) * 111 * 111 * Math.cos(latMoy);
}
// Correspond au plafond par défaut de RELIEF_CELLULES_MAX (32 000 000 cellules × 0,0625 km²/cellule) :
// large d'un seul tenant (même le Texas ou la Californie passent), mais arrête les unions de plusieurs
// très grands États de l'Ouest américain (voir la note de conception, risques et limites assumées).
const LIMITE_SURFACE_KM2 = 32_000_000 * 0.0625;

module.exports = {
  MAX_ETATS, RE_CODE, estCodeEtatsUS, codesEtatsUS, construireCode, contourEtatsUS, rectangleEtatsUS,
  nomEtatsUS, listeEtatsUS, sontContigus, surfaceApproxKm2, LIMITE_SURFACE_KM2,
};
