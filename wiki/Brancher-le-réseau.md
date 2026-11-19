# Brancher le réseau

## Le broker MQTT
La carte s'abonne à `MQTT_RACINE/#` (par défaut `msh/EU_868`) et, pour MeshCore, à `meshcore/#`.
- Les passerelles Meshtastic de votre réseau doivent publier sur ce broker (*Module MQTT* activé, canal avec « envoi vers MQTT »).
- Le compte MQTT de la carte doit pouvoir **lire** `msh/#` et **lire et écrire** `meshcore/#`.
- Un exemple de broker Mosquitto (TLS, comptes, droits) est fourni dans le dossier `mosquitto/` du dépôt.

## Carte monde : le broker public de Meshtastic
Pour alimenter une carte hors de votre propre réseau, vous pouvez écouter le broker public officiel de Meshtastic (`mqtt.meshtastic.org`, port 1883, ou 8883 en TLS). L'adresse, l'identifiant et le mot de passe du serveur public sont donnés dans la [documentation MQTT de Meshtastic](https://meshtastic.org/docs/software/mqtt/) : saisissez-les dans l'assistant ou dans *Gestion › Réglages* (ils ne sont pas dans le dépôt).
- **Une racine par région, jamais `msh/#`.** Depuis août 2024, le broker public n'accepte plus l'abonnement à « tous les sujets » ([annonce](https://meshtastic.org/blog/recent-public-mqtt-broker-changes/)). Abonnez-vous à la région voulue : `msh/US`, `msh/EU_868`, `msh/ANZ`… La principale se règle dans `MQTT_RACINE`, les autres, sur le **même** broker, dans `MQTT_SUJETS_SUPPLEMENTAIRES` (séparées par des virgules, par exemple `msh/CA/#,msh/EU_868/#`).
- **Volume** : une région entière représente beaucoup de trafic. Commencez par une seule, surveillez le processeur et la taille de la base, et raccourcissez la durée de conservation au besoin (un Raspberry Pi ou un NAS peut ne pas suivre avec plusieurs régions).
- **Clé** : `CANAUX=LongFast=AQ==` (clé publique par défaut) est nécessaire pour lire les positions et les noms des nœuds.
- **Positions floutées** : avec la clé par défaut, le broker public ne transmet que des positions à précision réduite. La carte les affiche telles quelles.
- Un même paquet peut arriver de plusieurs passerelles : la carte supprime les doublons.

## MeshCore : pas de broker mondial unique
Contrairement à Meshtastic, MeshCore n'a pas de broker public central. Chaque communauté publie (avec *meshcoretomqtt*) sur son propre broker. Pour voir plusieurs régions, ajoutez le broker de chaque communauté avec `MQTT_BROKERS_SUPPLEMENTAIRES` (`mqtts://utilisateur:motdepasse@hôte:8883|meshcore`, 5 au plus ; l'identifiant et le mot de passe sont donnés par la communauté qui gère le broker). Les paquets reçus deux fois par deux brokers sont ignorés.

## Les canaux Meshtastic
Pour lire positions, messages et télémétrie, la carte doit connaître la clé de chaque canal : *Gestion › Réglages*, ou `CANAUX` dans `.env`.
- Format : `NomDuCanal=cléBase64`, séparés par `;`.
- `AQ==` désigne la clé publique par défaut (canal LongFast…).
- Les clés des canaux privés se trouvent dans l'appli Meshtastic (canal › partager) ou dans le QR code du canal.

Les paquets chiffrés avec une clé inconnue s'affichent comme « chiffrés » : on voit qu'ils passent, mais pas leur contenu.

## Les protobufs, c'est quoi ?
Meshtastic écrit tous ses messages (positions, télémétrie, messages, configuration…) dans le format binaire **Protocol Buffers**. Le dépôt [meshtastic/protobufs](https://github.com/meshtastic/protobufs) décrit ce format. La carte les embarque déjà et les tient à jour : **il n'y a rien à installer**. L'option « JSON » du module MQTT n'est pas nécessaire (et elle est incomplète).

## Le module radio de la carte
Facultatif pour regarder la carte, **indispensable pour programmer les nœuds à distance** et pour envoyer des messages. Voir [[Connecter un module]].

## Les canaux MeshCore
Voir [[MeshCore]] : `Public`, `#nom` pour un canal hashtag (le nom exact suffit), `Nom=secret` pour un canal privé.
