# Zone « sur mesure » : un ou plusieurs États/provinces/territoires limitrophes d'un même pays

Note de conception de la zone « sur mesure », introduite pour les États-Unis en 1.13.0 (fichier alors
nommé `Conception-zones-multi-etats.md`) puis généralisée au Canada et à l'Australie en 1.14.0. Ce
document décrit la version 1.14.0 ; la section « Historique » en bas garde le détail de la version
1.13.0 pour mémoire.

## Le mécanisme générique (`src/regionsPays.js`)

Un seul module gère les trois pays, via un petit registre :

```js
const REGISTRE = {
  US: { fichier: 'etats-us.geojson', drapeau: '🇺🇸', maxRegions: 6 },
  CA: { fichier: 'regions-ca.geojson', drapeau: '🇨🇦', maxRegions: 6 },
  AU: { fichier: 'regions-au.geojson', drapeau: '🇦🇺', maxRegions: 6 },
};
```

Code de zone : `US-CA` (une seule région), `CA-ON+QC` (plusieurs régions, toujours rangées par ordre
alphabétique dans le code — une même sélection donne donc toujours le même code, et les mêmes noms de
fichiers en cache sur le disque : `mnt-CA-ON+QC.bin`…). `estCodeRegion()`, `contourRegion()`,
`nomRegion()`, `rectangleRegion()`, `codesRegion()`, `construireCode(pays, codes)`,
`listeRegions(pays)`, `sontContigus(pays, codes)`, `surfaceApproxKm2()`, `LIMITE_SURFACE_KM2` sont les
fonctions génériques, paramétrées par le pays (déduit du préfixe du code pour toutes sauf
`construireCode`/`listeRegions`/`sontContigus`, qui le reçoivent en premier argument). Les points
d'entrée qui aiguillaient déjà entre « département français » et « carré mondial »
(`contourDepartement()`/`nomDepartement()` dans `src/relief.js`, la détection « carte hors de France »
dans `src/server.js` et `src/config.js`) appellent maintenant `estCodeRegion()`/`contourRegion()`/
`nomRegion()` une seule fois, quel que soit le pays — plus besoin d'une branche par pays.

Le contour réuni reste, comme en 1.13.0, un simple empilement des polygones de chaque région choisie
(pas de vraie fusion géométrique) : suffisant, puisque tout le code existant teste déjà « le point est
dans l'un des anneaux », sans distinguer un vrai contour national multi-polygone d'une union de régions.
Il n'est pas enregistré à part : recalculé à chaque démarrage depuis le fichier de contours du pays
(dans le dépôt, donc dans l'image Docker) et le code de zone (dans `reglages.json`, comme avant).

### `src/etatsUS.js` : adaptateur de compatibilité, pas un doublon

Pour ne rien casser dans une installation déjà en production (`reglages.json` avec un code `US-…`
existant, tests déjà écrits), `src/etatsUS.js` n'a pas été supprimé : c'est maintenant un fin
adaptateur qui fige le pays à `'US'` et appelle `regionsPays.js`, en gardant exactement les mêmes noms
de fonctions qu'avant (`estCodeEtatsUS`, `contourEtatsUS`, `nomEtatsUS`, `rectangleEtatsUS`,
`codesEtatsUS`, `construireCode` à un seul argument, `listeEtatsUS`, `sontContigus` à un seul argument,
`MAX_ETATS`, `RE_CODE`). `tests/etatsUS.js` (les 7 tests de la 1.13.0) passe toujours tel quel, sans
modification, et continue de vérifier ce contrat. Plus aucun autre fichier du serveur ne dépend de
`etatsUS.js` : `config.js`, `relief.js`, `server.js` appellent directement `regionsPays.js`.

## Sources des contours

| Pays | Fichier | Régions | Taille | Source |
|---|---|---|---|---|
| États-Unis | `donnees-ref/etats-us.geojson` | 50 (Alaska exclu, Hawaï inclus) | 198 Ko | `us-atlas` (licence ISC, US Census Bureau, domaine public) — inchangé depuis 1.13.0 |
| Canada | `donnees-ref/regions-ca.geojson` | 13 (10 provinces + 3 territoires, aucune exclue) | 334 Ko | Natural Earth 10 m admin-1 (domaine public), via le mirroir GitHub `nvkelso/natural-earth-vector` |
| Australie | `donnees-ref/regions-au.geojson` | 8 (6 États + 2 territoires continentaux) | 49 Ko | idem, filtré sur `iso_a2=AU` |

Les deux nouveaux fichiers viennent de **Natural Earth** (domaine public, cc0/aucune restriction), la
même famille de données que `us-atlas` pour les États-Unis mais à la source plutôt qu'au format
TopoJSON déjà simplifié par un tiers : le fichier brut `ne_10m_admin_1_states_provinces.geojson`
(40 Mo, le monde entier) a été filtré sur `iso_a2` (`CA`, `AU`), puis simplifié par un algorithme de
Douglas-Peucker écrit pour l'occasion (`tolérance ≈ 0,02°` pour le Canada, `≈ 0,03°` pour l'Australie —
réglées pour retomber dans le même ordre de grandeur que le fichier américain), puis arrondi à 4
décimales comme le fichier américain. Le script de conversion n'a pas été gardé dans le dépôt (comme
pour `etats-us.geojson` en 1.13.0, qui n'a pas non plus son script de génération) : seul le résultat
(les trois fichiers `.geojson`) est versionné.

Vérification faite après simplification : un point dans chaque grande ville (Toronto, Vancouver,
Montréal, Edmonton, Winnipeg, Calgary, Halifax, Fredericton, Charlottetown, St. John's, Whitehorse,
Yellowknife, Iqaluit, Ottawa côté Canada ; Sydney, Melbourne, Brisbane, Perth, Adelaide, Hobart, Darwin,
Canberra côté Australie) retombe bien dans le contour de la bonne province/du bon État une fois
simplifié — pas seulement sur les données brutes.

### Petites îles et territoires exclus (Australie)

Natural Earth détaille, en plus des 8 États/territoires continentaux, quatre petits territoires que ce
fichier **n'inclut pas** :

- **Jervis Bay Territory** — base fédérale de ~400 habitants, enclavée en Nouvelle-Galles du Sud ;
- **Macquarie Island** — île subantarctique inhabitée (hors station scientifique), à plus de 1 500 km
  de la Tasmanie dont elle dépend administrativement ;
- **Ashmore and Cartier Islands** — îlots inhabités au large du Territoire du Nord ;
- **Lord Howe Island** — à ~700 km au large de la Nouvelle-Galles du Sud, dont elle dépend
  administrativement.

Natural Earth associe Macquarie Island et Lord Howe Island au **même code ISO 3166-2** que leur
État de rattachement (Tasmanie, Nouvelle-Galles du Sud) : les fusionner dans le contour de cet État
(comme le ferait une union naïve par code) aurait fait exploser son rectangle englobant pour une
poignée d'habitants au mieux, aucun au pire — exactement le problème que l'exclusion d'Hawaï évite déjà
dans le fichier américain, en pire (Hawaï garde son propre État sélectionnable ; ici, l'île aurait été
invisiblement rattachée à un autre État, sans façon de l'exclure a posteriori). Choix fait : exclure ces
quatre entités plutôt que les fusionner ou les garder à part — même logique que l'exclusion de l'Alaska
pour les États-Unis (« pas géré par cette version », pas un refus de principe).

Le Canada, lui, n'a eu besoin d'aucune exclusion : ses 13 provinces/territoires sont tous des polygones
indépendants dans Natural Earth, sans îlots séparés à fusionner ou écarter, et aucun ne traverse
l'antiméridien (le point le plus à l'ouest du Yukon est à −141°, loin des −180°/+180°).

## Interface

Généralise le bloc « Zone sur mesure » de la 1.13.0 : un premier menu **Pays** (`GET
/api/regions-pays`, qui renvoie la liste des pays du registre avec leur drapeau), puis, une fois un
pays choisi, la liste à cocher de ses régions (`GET /api/regions/:pays`). Les cases cochées, si elles
le sont, l'emportent sur le menu « Département » classique au moment d'enregistrer (`POST
/api/reglages` avec `{ pays: 'CA', regions: ['ON','QC'] }`, converti en interne en
`{ departement: 'CA-ON+QC' }`). L'ancienne forme `{ etatsUS: ['CA','NV','OR'] }` (États-Unis implicite)
reste acceptée par le serveur, pour une page encore en cache côté navigateur.

`GET /api/etats-us` répond toujours comme avant (alias de compatibilité vers `GET /api/regions/US`),
au cas où une intégration externe l'appellerait directement.

Côté `public/app.js`, le sélecteur de département (`optionsDepartements()`) reconnaît maintenant tout
code à préfixe à 2 lettres suivi d'un tiret (`US-…`, `CA-…`, `AU-…`) pour l'afficher correctement comme
sélectionné, avec le bon drapeau — sans télécharger la liste des régions seulement pour cet affichage.

## Limites assumées

**Nombre de régions : 6 au plus, pour les trois pays** (`maxRegions` dans le registre de
`regionsPays.js`). Choix délibérément resté simple et identique pour les trois pays plutôt que
spécifique à chacun : comme le montre la section suivante, c'est de toute façon le **plafond de
surface** qui limite réellement une sélection pour le Canada et l'Australie, bien avant celui du nombre
de régions — descendre ce dernier à 2 ou 3 pour ces deux pays n'aurait rien changé en pratique, et
aurait compliqué le code pour rien.

**Surface : le vrai plafond, nettement plus contraignant au Canada et en Australie qu'aux États-Unis.**
Le garde-fou mémoire (`RELIEF_CELLULES_MAX`, 32 000 000 cellules par défaut, soit `LIMITE_SURFACE_KM2`
≈ 2 000 000 km² une fois converti en surface) n'a pas changé depuis la 1.13.0 et reste commun aux trois
pays (la grille de relief ne connaît pas le pays, juste le rectangle englobant de la zone). Mais,
contrairement aux États-Unis où **chaque État, même le plus grand, passe seul** (Texas ≈ 1,7 Mkm²,
Californie ≈ 1,1 Mkm², tous les deux sous la limite), plusieurs provinces canadiennes et deux États
australiens dépassent cette limite **à eux seuls** :

| Pays | Région | Rectangle englobant (avec marge) | Sous la limite (2 Mkm²) ? |
|---|---|---|---|
| CA | Alberta | ≈ 0,91 Mkm² | ✅ |
| CA | Manitoba | ≈ 1,17 Mkm² | ✅ |
| CA | Colombie-Britannique | ≈ 2,33 Mkm² | ❌ |
| CA | Territoires du Nord-Ouest | ≈ 2,99 Mkm² | ❌ |
| CA | Ontario | ≈ 2,78 Mkm² | ❌ |
| CA | Québec | ≈ 3,14 Mkm² | ❌ |
| CA | Nunavut | ≈ 9,10 Mkm² (proche du pôle, rectangle très pessimiste) | ❌ |
| AU | Nouvelle-Galles du Sud | ≈ 1,41 Mkm² | ✅ |
| AU | Victoria | ≈ 0,58 Mkm² | ✅ |
| AU | Tasmanie (sans Macquarie Island) | ≈ 0,24 Mkm² | ✅ |
| AU | Queensland | ≈ 3,94 Mkm² | ❌ |
| AU | Australie-Occidentale | ≈ 4,21 Mkm² | ❌ |

**À dire clairement à Olivier avant de fusionner : la Colombie-Britannique, l'Ontario, le Québec, les
Territoires du Nord-Ouest et le Nunavut — c'est-à-dire la majorité de la population canadienne — ne
peuvent pas être choisis seuls avec les réglages par défaut.** Un administrateur dans l'une de ces
provinces doit relever `RELIEF_CELLULES_MAX` (et disposer de la RAM en face — voir le calcul de la
1.13.0, ≈ 300 Mo pour 32 M de cellules, donc nettement plus pour une province qui dépasse ce plafond)
avant même de pouvoir enregistrer sa zone. C'est une vraie différence d'usage par rapport aux
États-Unis, pas un oubli de cette tâche : le relief à 250 m de résolution sur un rectangle englobant
aussi étendu demande mécaniquement cette mémoire, quel que soit le pays. Deux options pour la suite,
qui restent à trancher par Olivier plutôt que décidées ici : relever le `RELIEF_CELLULES_MAX` **par
défaut** dans l'image Docker (impact : toutes les installations, pas seulement les canadiennes, auront
un plafond par défaut plus généreux — et donc un usage mémoire par défaut plus élevé en cas de zone
déjà grande ailleurs), ou laisser le réglage actuel et documenter clairement, dans l'assistant
d'installation et le wiki, qu'une grande province canadienne ou un grand État australien a besoin de ce
réglage dès le premier démarrage.

**Contiguïté : avertissement, jamais blocage**, comme en 1.13.0 — `sontContigus(pays, codes)` reste une
distance minimale entre anneaux extérieurs (seuil ≈ 6 km), pas un vrai calcul de frontière partagée.

**Pas de « région + voisines » ni de préchargement automatique** pour une zone sur mesure, comme en
1.13.0 : `voisinsMonde()` ne reconnaît toujours pas ce type de code.

**Alertes officielles françaises** (Météo-France, Vigipirate, FR-Alert) se dégradent proprement, sans
rien apporter, pour une zone canadienne ou australienne — comme pour une zone américaine.

## Historique (1.13.0 — États-Unis seulement)

La première version (voir le commit `edab02c`, PR #13) n'existait que pour les États-Unis, avec un
module dédié `src/etatsUS.js` (contour `us-atlas`, code `US-xx`/`US-xx+yy`, plafond `MAX_ETATS = 6`,
garde-fou `RELIEF_CELLULES_MAX`/`LIMITE_SURFACE_KM2`). Elle notait déjà, en conclusion : « Étendre à un
autre pays demanderait un fichier de contours équivalent et un préfixe de code différent… ; le reste du
mécanisme […] est déjà générique et n'aurait pas à changer » — ce qui s'est vérifié : la généralisation
1.14.0 n'a pas eu besoin de toucher `contourDepartement()`/`nomDepartement()` au-delà d'un renommage de
fonction, ni le garde-fou mémoire de `creerRelief()`.

Elle documentait aussi le chevauchement avec la PR #12 (sélecteur pays/État du carré monde,
`choisirPositionMonde()` dans `public/app.js`), résolu au rebase : les deux chemins restaient séparés
(le sélecteur pays/État ne proposait qu'une position de référence sans contour ; le bloc « Zone sur
mesure » à cases à cocher restait le seul chemin pour une union de régions). Cela reste vrai en 1.14.0 :
`choisirPositionMonde()` n'a toujours pas de notion de contour par région, seulement une position de
référence par pays/État — unifier les deux reste une tâche à part, non traitée ici.
