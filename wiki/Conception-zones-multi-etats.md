# Zone « sur mesure » : un ou plusieurs États américains limitrophes

Note de conception pour la première version de la zone « sur mesure » (1.13.0). S'applique aujourd'hui
seulement aux États-Unis ; le mécanisme est pensé pour pouvoir s'étendre à d'autres pays plus tard
(Canada, Australie…) sans tout refaire.

## Source des contours

Les contours des 50 États + DC viennent du jeu `us-atlas` (Mike Bostock, licence ISC, dérivé des
fichiers de référence cartographique du US Census Bureau — domaine public), au format TopoJSON
« 10 m » (le plus détaillé publié par ce projet), convertis en GeoJSON puis arrondis à 4 décimales
(≈ 11 m, largement suffisant à cette échelle). Résultat : `carte-live/donnees-ref/etats-us.geojson`,
198 Ko — comparable au `departements.geojson` existant (556 Ko pour 96 départements). L'Alaska est
volontairement exclu de ce fichier : son territoire traverse l'antiméridien (180°), ce que le calcul
de rectangle englobant ne gère pas (voir « Limites » plus bas) ; Hawaï n'est pas limitrophe d'aucun
autre État et n'apporte donc rien à une union d'États contigus, il reste cependant dans le fichier.

## Représentation du code de zone

Le système existant connaît deux formes de code de « département » : un code français (`43`, `2A`…)
ou un carré mondial de 1°×1° (`MN50E004`, voir `src/monde.js`). On ajoute une troisième forme, reconnue
par un nouveau module **`src/etatsUS.js`**, sans toucher aux deux premières :

```
US-CA            → un seul État (Californie)
US-CA+NV+OR       → plusieurs États réunis, toujours rangés par ordre alphabétique dans le code
                    (une même sélection donne donc toujours le même code, et les mêmes noms de
                    fichiers en cache sur le disque : mnt-US-CA+NV+OR.bin…)
```

`estCodeEtatsUS()`, `contourEtatsUS()`, `nomEtatsUS()`, `rectangleEtatsUS()` sont les équivalents,
pour ce troisième type de zone, de `estCodeMonde()` / `contourMonde()` / `nomMonde()` /
`rectangleMonde()`. Les points d'entrée qui aiguillaient déjà entre « département français » et
« carré mondial » (`contourDepartement()` et `nomDepartement()` dans `src/relief.js`, la détection
« carte hors de France » dans `src/server.js`) gagnent une branche de plus pour ce troisième type ;
ailleurs, le code existant (France, carré mondial) n'est pas modifié.

Le contour réuni n'est **pas une vraie fusion géométrique** (pas de calcul de frontière commune) :
c'est un `MultiPolygon` qui empile simplement les polygones de chaque État choisi. Suffisant ici, car
tout le code existant qui utilise un contour de département (test point-dans-polygone, rectangle
englobant) teste déjà « le point est dans l'un des anneaux », sans distinguer un vrai contour nationale
multi-polygone (îles, enclaves) d'une union d'États — le même mécanisme marche pour les deux.

Le contour réuni n'est pas enregistré dans un fichier à part dans le volume de données : il est
recalculé à chaque démarrage à partir de `etats-us.geojson` (qui est dans le dépôt, donc dans l'image
Docker) et du code de zone (`US-CA+NV+OR`), qui lui est enregistré dans `reglages.json` comme
n'importe quel autre réglage de département. Pas de nouveau format de fichier à gérer, pas de
compatibilité ascendante à casser : un `reglages.json` d'avant cette version reste valide tel quel.

## Interface

Première version autonome (voir le contexte de la tâche : la sélection pays/État de la PR #12 arrivera
par une autre branche, à fusionner manuellement avec celle-ci) : Réglages › un bloc dépliable
« Zone sur mesure » liste les États avec une case à cocher chacun (`GET /api/etats-us`), limité à
`MAX_ETATS` cases cochées à la fois (6, voir plus bas). Les cases cochées, si elles le sont, l'emportent
sur le menu « Département » classique au moment d'enregistrer (`POST /api/reglages` avec
`{ etatsUS: ['CA','NV','OR'] }`, converti en interne en `{ departement: 'US-CA+NV+OR' }`).

## Limites assumées

**Nombre d'États : 6 au plus** (`MAX_ETATS` dans `src/etatsUS.js`). Au-delà, le code de zone n'est
plus reconnu comme valide (`estCodeEtatsUS()` renvoie faux) — choix arbitraire, cohérent avec la
suggestion de la tâche, qui garde le sélecteur et le nom de zone lisibles.

**Surface : le vrai plafond, bien plus contraignant que le nombre d'États.** Le relief (`src/relief.js`,
`creerRelief()`) construit une grille à pas fixe de 250 m sur le *rectangle englobant* de la zone (plus
une marge de 0,4° hors de France). Un État très allongé en diagonale (la Californie, par exemple) a un
rectangle englobant bien plus grand que sa vraie superficie — son rectangle seul s'étend du Mexique à
l'Oregon et de la côte au Nevada. Un garde-fou mémoire a donc été ajouté dans `creerRelief()`
(`RELIEF_CELLULES_MAX`, 32 000 000 cellules par défaut, réglable ou désactivable par variable
d'environnement), qui refuse de charger une zone dont la grille dépasserait cette taille — avec un
message clair plutôt qu'un plantage par manque de mémoire en cours de calcul. Le même calcul (en plus
simple : rectangle plutôt que vrai contour, volontairement pessimiste) est refait dans
`src/etatsUS.js` (`surfaceApproxKm2()`, `LIMITE_SURFACE_KM2`) et appelé **avant** d'enregistrer les
réglages, pour prévenir l'administrateur avant le redémarrage plutôt qu'après.

Avec ce plafond : un seul État, même très grand (Californie ≈ 1,1 Mkm² de rectangle englobant, Texas
≈ 1,7 Mkm²), passe. Une union de plusieurs très grands États de l'Ouest (Californie + Nevada + Oregon +
Washington + Idaho + Utah ≈ 2,7 Mkm²) est refusée. À titre de comparaison : la Gironde (le plus grand
département français) fait ≈ 10 000 km², et un carré mondial de 1°×1° (avec sa marge) ≈ 20 000 km² —
les zones américaines sont donc, par construction, **une à deux centaines de fois plus grandes** que
tout ce que la carte gérait jusqu'ici. C'est le risque principal de cette fonction, assumé mais à
suivre :

- **Mémoire** : à 32 M de cellules (le plafond), les tableaux de relief (altitudes, masque, index de
  zone) demandent à eux seuls ≈ 300 Mo, et les calculs de couverture radio (cartes PNG, marges) peuvent
  demander autant en plus, de façon transitoire, pendant un calcul. Un grand État isolé (Californie,
  Texas) tient dans cet ordre de grandeur réduit, mais au prix d'un Raspberry Pi avec plusieurs Go de
  RAM (4 Go conseillés), pas d'un modèle d'entrée de gamme à 512 Mo-1 Go comme le dit la documentation
  existante pour un département français. **À dire clairement à qui installe une grande zone** : ce
  n'est plus « ça tient sur n'importe quel Raspberry Pi » pour ce cas-là.
- **Téléchargement du relief** : le relief Copernicus se télécharge tuile par tuile (1°×1°) — une
  grande zone demande des dizaines de tuiles au lieu d'une poignée, donc une préparation plus longue
  (plusieurs minutes à plus d'une heure selon la connexion), déjà géré par le mécanisme de progression
  existant (pas de changement nécessaire ici), mais à prévoir dans l'attente de l'administrateur.
- **Résolution fixe à 250 m** : non remise en cause dans cette tâche. L'adapter (grille plus grossière
  pour une grande zone) toucherait de nombreuses fonctions qui supposent `aireCelleKm2 = 0,0625`
  (bilans de couverture, classement des sites, budgets radio…) — risque jugé trop élevé pour une
  première version ; le garde-fou mémoire ci-dessus protège en attendant.

**Contiguïté : avertissement, jamais blocage.** Vérifier qu'une frontière est réellement partagée
demanderait un vrai calcul géométrique (intersection de segments) ; on se contente ici d'une distance
minimale entre les anneaux extérieurs de chaque État (`sontContigus()`, seuil ≈ 6 km, qui absorbe les
écarts dus à la simplification des contours) et d'un parcours en largeur pour vérifier que tous les
États cochés forment un seul bloc connexe. Un cas limite réel (deux États qui ne se touchent que par un
point, comme l'Utah et le Nouveau-Mexique aux « Four Corners ») est accepté sans avertissement par ce
seuil large — accepté sciemment plutôt que de complexifier le calcul pour un cas rare.

**Seuls les États-Unis.** Le code (`US-xx`), le fichier de contours et le sélecteur sont propres aux
États-Unis. Étendre à un autre pays demanderait un fichier de contours équivalent et un préfixe de code
différent (`CA-xx` pour les provinces canadiennes, par exemple) ; le reste du mécanisme (dispatch dans
`contourDepartement()`/`nomDepartement()`, détection « hors de France » dans `server.js`, garde-fou
mémoire) est déjà générique et n'aurait pas à changer.

**Pas de « département + voisins » ni de préchargement automatique des zones proches** pour une zone
sur mesure (contrairement au carré mondial, qui précharge ses 8 voisins) : pas de notion naturelle de
« voisin » pour une union d'États choisie à la main. `voisinsMonde()` ne reconnaît pas ce code de zone
et renvoie une liste vide — dégradation silencieuse, sans erreur.

**Alertes officielles françaises (Météo-France, Vigipirate, FR-Alert)** restent des fonctions
françaises par nature : elles se dégradent proprement (aucun département trouvé) sans erreur pour une
zone américaine, mais n'apportent évidemment rien.

## Chevauchement avec la PR #12 (choix pays/État, carré mondial)

Cette tâche a délibérément touché le moins possible `public/app.js` (où la PR #12 était en cours sur
le sélecteur pays/État) : seuls `public/administration.js` (nouveau bloc « Zone sur mesure » dans
Réglages) et `public/style.css` (quelques classes) ont été changés côté interface. Les deux fonctions
pourront être réunies manuellement : la PR #12 choisit un pays puis, pour les États-Unis, pourrait
afficher directement ce bloc (ou rediriger vers son équivalent) au lieu du simple menu « Département ».
Côté serveur, `src/config.js`, `src/server.js` (routes `/api/reglages`, `/api/etats-us`) et
`src/relief.js` ont changé : à comparer avec ce que la PR #12 y aura fait, au moment de fusionner.

### Résolu au moment de fusionner (rebase sur `main` après la fusion de la PR #12)

- `src/config.js` : les deux blocs (celui qui reconnaît `MN…` de la PR #12 et celui qui reconnaît
  `US-xx` ajouté ici) cohabitent, l'un après l'autre, sans se gêner. Le garde-fou de démarrage de la
  PR #12 (« code de zone invalide, ni département français, ni position monde ») ne connaissait pas
  encore ce troisième format : corrigé pour appeler aussi `estCodeEtatsUS()`, sans quoi une zone sur
  mesure valide aurait été signalée à tort comme invalide à chaque démarrage.
- `src/server.js`/`src/relief.js` : aucun chevauchement réel (fichiers touchés par cette seule PR) ;
  le rebase s'est appliqué sans conflit.
- Interface : les deux chemins restent **séparés pour l'instant**, comme envisagé ci-dessus comme
  repli. Le sélecteur pays/État de la PR #12 (`public/app.js`, `choisirPositionMonde()`) ne propose
  toujours qu'un seul État des États-Unis (position de référence, pas de contour). Le bloc « Zone sur
  mesure » à cases à cocher de cette PR (`public/administration.js`) reste le seul chemin pour une
  union de plusieurs États, et reste la source de vérité une fois réglé ainsi. Seul correctif fait :
  `optionsDepartements()` (partagée par les deux pages) reconnaît maintenant un code `US-CA+NV+OR`
  existant pour l'afficher correctement comme sélectionné dans le menu « Département » — sans ce
  correctif, rouvrir Réglages avec une zone sur mesure déjà en place aurait réinitialisé le menu sur
  une valeur invalide et fait échouer l'enregistrement du moindre autre réglage (titre, MQTT…) tant
  que l'administrateur n'aurait pas recoché ses États. Unifier pour de bon (proposer les cases à
  cocher directement depuis le sélecteur pays/État quand le pays choisi est les États-Unis) reste à
  faire dans une prochaine tâche.
