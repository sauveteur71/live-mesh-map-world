'use strict';
// Compatibilité : ce module existait avant la généralisation à plusieurs pays (voir
// wiki/Conception-zones-multi-regions.md) et reste l'unique point d'entrée pour les zones
// « US-CA » / « US-CA+NV+OR » existantes. Tout le mécanisme réel vit maintenant dans
// src/regionsPays.js (registre générique {US, CA, AU}) ; ce fichier n'est plus qu'un fin
// adaptateur qui fige le pays à 'US' et garde exactement les mêmes noms de fonctions qu'avant,
// pour ne rien casser dans une installation déjà en production (reglages.json, tests, imports).
const regions = require('./regionsPays');

const MAX_ETATS = 6; // = REGISTRE.US.maxRegions dans regionsPays.js
const RE_CODE = /^US-([A-Z]{2})((?:\+[A-Z]{2}){0,5})$/;

const estCodeEtatsUS = (code) => regions.estCodeRegion(code) && regions.paysDuCode(code) === 'US';
const codesEtatsUS = (code) => (regions.paysDuCode(code) === 'US' ? regions.codesRegion(code) : []);
const construireCode = (codes) => regions.construireCode('US', codes);
const contourEtatsUS = (code) => (estCodeEtatsUS(code) ? regions.contourRegion(code) : null);
const rectangleEtatsUS = (code) => (estCodeEtatsUS(code) ? regions.rectangleRegion(code) : null);
const nomEtatsUS = (code) => (regions.paysDuCode(code) === 'US' ? regions.nomRegion(code) : null);
const listeEtatsUS = () => regions.listeRegions('US');
const sontContigus = (codes) => regions.sontContigus('US', codes);
const { surfaceApproxKm2, LIMITE_SURFACE_KM2 } = regions;

module.exports = {
  MAX_ETATS, RE_CODE, estCodeEtatsUS, codesEtatsUS, construireCode, contourEtatsUS, rectangleEtatsUS,
  nomEtatsUS, listeEtatsUS, sontContigus, surfaceApproxKm2, LIMITE_SURFACE_KM2,
};
