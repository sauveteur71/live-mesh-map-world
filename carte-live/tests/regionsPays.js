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

test('surface approximative : chaque région passe seule, y compris le Nunavut (le plafond par défaut a été relevé exprès pour ça) — seules les unions de plusieurs très grandes régions restent refusées', () => {
  assert.ok(regions.surfaceApproxKm2('CA-AB') < regions.LIMITE_SURFACE_KM2, 'l’Alberta (province moyenne) passe seule');
  assert.ok(regions.surfaceApproxKm2('CA-ON') < regions.LIMITE_SURFACE_KM2, 'l’Ontario passe seul');
  assert.ok(regions.surfaceApproxKm2('CA-QC') < regions.LIMITE_SURFACE_KM2, 'le Québec passe seul');
  assert.ok(regions.surfaceApproxKm2('CA-NU') < regions.LIMITE_SURFACE_KM2, 'le Nunavut, la plus étendue des régions ici (≈ 9,1 Mkm²), passe seul — c’est tout l’objet du plafond relevé à 160 M de cellules');
  assert.ok(regions.surfaceApproxKm2('AU-TAS') < regions.LIMITE_SURFACE_KM2, 'la Tasmanie (sans Macquarie Island, exclue) passe seule');
  assert.ok(regions.surfaceApproxKm2('AU-NSW') < regions.LIMITE_SURFACE_KM2, 'la Nouvelle-Galles du Sud (sans Lord Howe Island, exclue) passe seule');
  assert.ok(regions.surfaceApproxKm2('AU-QLD') < regions.LIMITE_SURFACE_KM2, 'le Queensland passe seul');
  assert.ok(regions.surfaceApproxKm2('AU-WA') < regions.LIMITE_SURFACE_KM2, 'l’Australie-Occidentale passe seule');
  // Mais une union de deux très grandes régions éloignées reste refusée : le plafond protège toujours contre ce cas
  const grandCanada = regions.construireCode('CA', ['BC', 'QC']);
  assert.ok(regions.surfaceApproxKm2(grandCanada) > regions.LIMITE_SURFACE_KM2, 'Colombie-Britannique + Québec (côte à côte du pays) dépasse la limite');
  const grandeAustralie = regions.construireCode('AU', ['QLD', 'WA']);
  assert.ok(regions.surfaceApproxKm2(grandeAustralie) > regions.LIMITE_SURFACE_KM2, 'Queensland + Australie-Occidentale (les deux plus grands États) dépasse la limite');
});

test('relief.js : contourDepartement()/nomDepartement() délèguent à regionsPays pour un code CA-… ou AU-…', () => {
  const geom = relief.contourDepartement('CA-ON+QC');
  assert.equal(geom.type, 'MultiPolygon');
  assert.equal(relief.nomDepartement('CA-ON+QC'), 'Ontario + Québec');
  assert.equal(relief.nomDepartement('AU-NSW'), 'Nouvelle-Galles du Sud');
  // Un code de département français ordinaire continue de fonctionner comme avant
  assert.equal(relief.nomDepartement('43'), 'Haute-Loire');
});

test('relief.js : RELIEF_CELLULES_MAX relevé pour que le Nunavut passe seul, estimerRam() proportionnelle à la taille réelle de la zone', () => {
  // Nunavut (~146,5 M de cellules à 250 m de résolution, voir wiki) doit rester sous le plafond par défaut
  assert.ok(relief.RELIEF_CELLULES_MAX > 146_526_432, 'le plafond par défaut doit couvrir le Nunavut, avec une marge');
  // La mémoire estimée est proportionnelle à la taille RÉELLE de la zone, pas au plafond : une petite zone
  // (département français) et une grande (Nunavut) ne demandent pas la même chose, quel que soit le plafond réglé
  const petite = relief.estimerRam(275_396); // Haute-Loire
  const moyenne = relief.estimerRam(27_092_032); // Texas
  const grande = relief.estimerRam(146_526_432); // Nunavut
  assert.ok(petite.octets < moyenne.octets && moyenne.octets < grande.octets, 'l’estimation croît avec la taille réelle de la zone');
  assert.ok(grande.go <= 8, 'l’estimation pour le Nunavut doit rester un ordre de grandeur raisonnable (quelques Go, pas des dizaines)');
  assert.equal(relief.RELIEF_RAM_AVERTISSEMENT_SEUIL, 25_000_000);
});

test('liste des pays du registre et leur plafond de régions', () => {
  const liste = regions.listePays();
  assert.deepEqual(liste.map((p) => p.code), ['US', 'CA', 'AU']);
  assert.ok(liste.every((p) => p.max >= 1 && p.drapeau));
  assert.equal(regions.maxRegions('US'), 6);
  assert.equal(regions.maxRegions('FR'), 0); // pays non enregistré ici (les départements français ne passent pas par ce module)
});
