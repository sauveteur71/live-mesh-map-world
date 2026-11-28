// Zone « sur mesure » : une ou plusieurs régions contiguës d'un même pays (États-Unis, Canada, Australie)
// node --test tests/regionsPays.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const regions = require('../src/regionsPays');
const relief = require('../src/relief');

test('code composite reconnu, toujours rangé par ordre alphabétique (générique à tout pays du registre)', () => {
  assert.equal(regions.estCodeRegion('US-CA'), true);
  assert.equal(regions.estCodeRegion('US-CA+NV+OR'), true);
  assert.equal(regions.estCodeRegion('CA-ON'), true);
  assert.equal(regions.estCodeRegion('CA-ON+QC'), true);
  assert.equal(regions.estCodeRegion('AU-NSW+VIC'), true);
  assert.deepEqual(regions.codesRegion('US-OR+CA+NV'), ['CA', 'NV', 'OR']);
  assert.deepEqual(regions.codesRegion('CA-QC+ON'), ['ON', 'QC']);
  assert.equal(regions.construireCode('us', ['or', 'ca', 'nv']), 'US-CA+NV+OR');
  assert.equal(regions.construireCode('CA', ['qc', 'on']), 'CA-ON+QC');
  assert.equal(regions.construireCode('au', ['vic', 'nsw']), 'AU-NSW+VIC');
});

test('codes invalides rejetés (pays inconnu, région inconnue, trop de régions, autre format de zone)', () => {
  assert.equal(regions.estCodeRegion('US-ZZ'), false);
  assert.equal(regions.estCodeRegion('CA-ZZ'), false); // code à 2 lettres mais aucune province de ce nom
  assert.equal(regions.estCodeRegion('FR-43'), false); // préfixe pays « FR » non enregistré ici
  assert.equal(regions.estCodeRegion('MN50E004'), false); // carré « monde », pas une zone « sur mesure »
  assert.equal(regions.estCodeRegion('43'), false); // département français ordinaire
  const trop = regions.construireCode('US', ['CA', 'NV', 'OR', 'WA', 'ID', 'UT', 'AZ']); // 7 > maxRegions
  assert.equal(regions.estCodeRegion(trop), false);
  assert.equal(regions.paysDuCode('CA-ON'), 'CA');
  assert.equal(regions.paysDuCode('43'), null);
});

test('Canada : 13 provinces/territoires (aucune limitation d’antiméridien, contrairement à l’Alaska pour les USA)', () => {
  const liste = regions.listeRegions('CA');
  assert.equal(liste.length, 13);
  assert.ok(liste.some((e) => e.code === 'QC' && e.nom === 'Québec'));
  assert.ok(liste.some((e) => e.code === 'ON' && e.nom === 'Ontario'));
  assert.ok(liste.some((e) => e.code === 'NU' && e.nom === 'Nunavut'));
  assert.equal(regions.nomRegion('CA-ON+QC'), 'Ontario + Québec');
});

test('Australie : 8 États/territoires continentaux (îles éloignées exclues, voir regionsPays et la note de conception)', () => {
  const liste = regions.listeRegions('AU');
  assert.equal(liste.length, 8);
  assert.ok(liste.some((e) => e.code === 'NSW' && e.nom === 'Nouvelle-Galles du Sud'));
  assert.ok(liste.some((e) => e.code === 'WA' && e.nom === 'Australie-Occidentale'));
  assert.equal(regions.nomRegion('AU-NSW+VIC'), 'Nouvelle-Galles du Sud + Victoria');
});

test('le contour réuni couvre bien les régions choisies (et rien d’autre), pour chaque pays', () => {
  const gCa = regions.contourRegion('CA-ON+QC');
  assert.equal(gCa.type, 'MultiPolygon');
  const rectCa = regions.rectangleRegion('CA-ON+QC');
  // Toronto (Ontario) et Montréal (Québec) dans l'emprise ; Vancouver largement à l'ouest
  assert.ok(rectCa[0] < 43.65 && rectCa[2] > 43.65 && rectCa[1] < -79.38 && rectCa[3] > -79.38);
  assert.ok(rectCa[0] < 45.50 && rectCa[2] > 45.50 && rectCa[1] < -73.57 && rectCa[3] > -73.57);
  assert.ok(rectCa[1] > -123); // Vancouver (lon ≈ -123) hors de l'emprise Ontario+Québec

  const gAu = regions.contourRegion('AU-NSW+VIC');
  assert.equal(gAu.type, 'MultiPolygon');
  const rectAu = regions.rectangleRegion('AU-NSW+VIC');
  // Sydney (NSW) et Melbourne (VIC) dans l'emprise ; Perth largement à l'ouest
  assert.ok(rectAu[0] < -33.87 && rectAu[2] > -33.87 && rectAu[1] < 151.21 && rectAu[3] > 151.21);
  assert.ok(rectAu[0] < -37.81 && rectAu[2] > -37.81 && rectAu[1] < 144.96 && rectAu[3] > 144.96);
  assert.ok(rectAu[1] > 140); // Perth (lon ≈ 116) hors de l'emprise NSW+VIC
});

test('contiguïté (avertissement, jamais bloquant) — vrais voisins vs régions séparées, pour chaque pays', () => {
  assert.equal(regions.sontContigus('CA', ['ON']), true);
  assert.equal(regions.sontContigus('CA', ['ON', 'QC']), true); // vrais voisins
  assert.equal(regions.sontContigus('CA', ['BC', 'NL']), false); // Colombie-Britannique et Terre-Neuve ne se touchent pas
  assert.equal(regions.sontContigus('AU', ['NSW', 'VIC']), true); // vrais voisins
  assert.equal(regions.sontContigus('AU', ['WA', 'NSW']), false); // séparés par l'Australie-Méridionale
});

test('surface approximative : contrairement aux États américains (chaque État, même très grand, passe seul), plusieurs provinces canadiennes et États australiens dépassent la limite à eux seuls — assumé et documenté dans le wiki, pas une erreur de ce module', () => {
  assert.ok(regions.surfaceApproxKm2('CA-AB') < regions.LIMITE_SURFACE_KM2, 'l’Alberta (province moyenne) doit passer seule');
  assert.ok(regions.surfaceApproxKm2('CA-ON') > regions.LIMITE_SURFACE_KM2, 'l’Ontario, très étendu, dépasse la limite à lui seul (voir le wiki)');
  assert.ok(regions.surfaceApproxKm2('CA-QC') > regions.LIMITE_SURFACE_KM2, 'le Québec, très étendu, dépasse la limite à lui seul (voir le wiki)');
  assert.ok(regions.surfaceApproxKm2('CA-NU') > regions.LIMITE_SURFACE_KM2, 'le Nunavut, immense et proche du pôle, dépasse largement la limite à lui seul');
  assert.ok(regions.surfaceApproxKm2('AU-TAS') < regions.LIMITE_SURFACE_KM2, 'la Tasmanie (sans Macquarie Island, exclue) doit passer seule');
  assert.ok(regions.surfaceApproxKm2('AU-NSW') < regions.LIMITE_SURFACE_KM2, 'la Nouvelle-Galles du Sud (sans Lord Howe Island, exclue) doit passer seule');
  assert.ok(regions.surfaceApproxKm2('AU-QLD') > regions.LIMITE_SURFACE_KM2, 'le Queensland, très étendu, dépasse la limite à lui seul (voir le wiki)');
});

test('relief.js : contourDepartement()/nomDepartement() délèguent à regionsPays pour un code CA-… ou AU-…', () => {
  const geom = relief.contourDepartement('CA-ON+QC');
  assert.equal(geom.type, 'MultiPolygon');
  assert.equal(relief.nomDepartement('CA-ON+QC'), 'Ontario + Québec');
  assert.equal(relief.nomDepartement('AU-NSW'), 'Nouvelle-Galles du Sud');
  // Un code de département français ordinaire continue de fonctionner comme avant
  assert.equal(relief.nomDepartement('43'), 'Haute-Loire');
});

test('liste des pays du registre et leur plafond de régions', () => {
  const liste = regions.listePays();
  assert.deepEqual(liste.map((p) => p.code), ['US', 'CA', 'AU']);
  assert.ok(liste.every((p) => p.max >= 1 && p.drapeau));
  assert.equal(regions.maxRegions('US'), 6);
  assert.equal(regions.maxRegions('FR'), 0); // pays non enregistré ici (les départements français ne passent pas par ce module)
});
