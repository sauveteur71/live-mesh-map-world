// Zone « sur mesure » (un ou plusieurs États américains limitrophes) : node --test tests/etatsUS.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const etatsUS = require('../src/etatsUS');
const relief = require('../src/relief');

test('États-Unis : code composite reconnu, toujours rangé par ordre alphabétique', () => {
  assert.equal(etatsUS.estCodeEtatsUS('US-CA'), true);
  assert.equal(etatsUS.estCodeEtatsUS('US-CA+NV+OR'), true);
  assert.deepEqual(etatsUS.codesEtatsUS('US-OR+CA+NV'), ['CA', 'NV', 'OR']);
  assert.equal(etatsUS.construireCode(['or', 'ca', 'nv']), 'US-CA+NV+OR');
});

test('États-Unis : codes invalides rejetés (État inconnu, trop d’États, autre format de zone)', () => {
  assert.equal(etatsUS.estCodeEtatsUS('US-ZZ'), false);
  assert.equal(etatsUS.estCodeEtatsUS('MN50E004'), false); // carré « monde », pas une zone États-Unis
  assert.equal(etatsUS.estCodeEtatsUS('43'), false);
  const trop = etatsUS.construireCode(['CA', 'NV', 'OR', 'WA', 'ID', 'UT', 'AZ']); // 7 États > MAX_ETATS
  assert.equal(etatsUS.estCodeEtatsUS(trop), false);
});

test('États-Unis : nom lisible et liste des 49 États + DC (Alaska exclu, voir note de conception)', () => {
  assert.equal(etatsUS.nomEtatsUS('US-CA+NV+OR'), 'Californie + Nevada + Oregon');
  const liste = etatsUS.listeEtatsUS();
  assert.equal(liste.length, 50);
  assert.ok(liste.some((e) => e.code === 'CA' && e.nom === 'Californie'));
  assert.ok(!liste.some((e) => e.code === 'AK')); // Alaska : à cheval sur l'antiméridien, non géré dans cette version
});

test('États-Unis : le contour réuni couvre bien les États choisis (et rien d’autre)', () => {
  const g = etatsUS.contourEtatsUS('US-CA+NV');
  assert.equal(g.type, 'MultiPolygon');
  const rect = etatsUS.rectangleEtatsUS('US-CA+NV');
  // Sacramento (Californie) et Las Vegas (Nevada) dans l'emprise ; New York largement en dehors
  assert.ok(rect[0] < 38.58 && rect[2] > 38.58 && rect[1] < -121.49 && rect[3] > -121.49);
  assert.ok(rect[0] < 36.17 && rect[2] > 36.17 && rect[1] < -115.14 && rect[3] > -115.14);
  assert.ok(rect[3] < -100); // New York (lon ≈ -74) hors de l'emprise Californie+Nevada
});

test('États-Unis : contiguïté (avertissement, jamais bloquant) — vrais voisins vs États séparés', () => {
  assert.equal(etatsUS.sontContigus(['CA']), true);
  assert.equal(etatsUS.sontContigus(['CA', 'NV', 'OR']), true); // bloc continu (Ouest américain)
  assert.equal(etatsUS.sontContigus(['CA', 'NY']), false); // Californie et New York ne se touchent pas
  assert.equal(etatsUS.sontContigus(['CA', 'TX']), false); // séparés par l'Arizona
});

test('États-Unis : surface approximative — un grand État seul passe, une très grande union d’États est refusée', () => {
  assert.ok(etatsUS.surfaceApproxKm2('US-CA') < etatsUS.LIMITE_SURFACE_KM2, 'la Californie seule doit passer');
  assert.ok(etatsUS.surfaceApproxKm2('US-TX') < etatsUS.LIMITE_SURFACE_KM2, 'le Texas seul doit passer');
  assert.ok(etatsUS.surfaceApproxKm2('US-CA+NV+OR+WA+ID+UT') > etatsUS.LIMITE_SURFACE_KM2, 'les 6 grands États de l’Ouest réunis doivent dépasser la limite (relief refusé)');
});

test('relief.js : contourDepartement()/nomDepartement() délèguent à etatsUS pour un code US-…', () => {
  const geom = relief.contourDepartement('US-OR+WA');
  assert.equal(geom.type, 'MultiPolygon');
  assert.equal(relief.nomDepartement('US-OR+WA'), 'Oregon + Washington');
  // Un code de département français ordinaire continue de fonctionner comme avant
  assert.equal(relief.nomDepartement('43'), 'Haute-Loire');
});
