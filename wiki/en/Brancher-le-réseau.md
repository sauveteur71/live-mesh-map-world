# Connect the network

## The MQTT broker
The map subscribes to `MQTT_RACINE/#` (default `msh/EU_868`) and, for MeshCore, to `meshcore/#`.
- The Meshtastic gateways of your network must publish to this broker (*MQTT module* on, channel with “uplink to MQTT”).
- The map's MQTT account must be able to **read** `msh/#` and **read and write** `meshcore/#`.
- An example Mosquitto broker (TLS, accounts, permissions) is provided in the repository's `mosquitto/` folder.

## World map: the public Meshtastic broker
To feed a map outside your own network you can listen to Meshtastic's official public broker (`mqtt.meshtastic.org`, port 1883, or 8883 with TLS). The address, user name and password of the public server are given on the [Meshtastic MQTT documentation](https://meshtastic.org/docs/software/mqtt/): enter them in the setup wizard or in *Manage › Settings* (they are not in the repository).
- **One root per region, never `msh/#`.** Since August 2024 the public broker no longer accepts the “all topics” subscription ([announcement](https://meshtastic.org/blog/recent-public-mqtt-broker-changes/)). Subscribe to the region you want: `msh/US`, `msh/EU_868`, `msh/ANZ`… Set the main one in `MQTT_RACINE`, and the others, on the **same** broker, in `MQTT_SUJETS_SUPPLEMENTAIRES` (comma-separated, e.g. `msh/CA/#,msh/EU_868/#`).
- **Volume**: a whole region is a lot of traffic. Start with one region, watch the CPU and the database size, and shorten the retention if needed (a Raspberry Pi or a NAS may not keep up with several regions).
- **Key**: `CANAUX=LongFast=AQ==` (the default public key) is needed to read positions and node names.
- **Positions are blurred**: on the default key the public broker only passes positions with reduced precision. The map shows them as they are published.
- The same packet can arrive from several gateways: the map removes duplicates.

## MeshCore: no single world broker
Unlike Meshtastic, MeshCore has no central public broker. Each community publishes (with *meshcoretomqtt*) to its own broker. To see several regions, add each community's broker with `MQTT_BROKERS_SUPPLEMENTAIRES` (`mqtts://user:password@host:8883|meshcore`, up to 5; the user name and password are given by the community that runs the broker). Packets received twice from two brokers are ignored.

## Meshtastic channels
To read positions, messages and telemetry, the map must know each channel's key: *Manage › Settings*, or `CANAUX` in `.env`.
- Format: `ChannelName=base64Key`, separated by `;`.
- `AQ==` is the default public key (LongFast channel…).
- Private channel keys are found in the Meshtastic app (channel › share) or in the channel's QR code.

Packets encrypted with an unknown key show as “encrypted”: you see them go by, but not their content.

## What are protobufs?
Meshtastic writes all its messages (positions, telemetry, messages, configuration…) in the binary **Protocol Buffers** format. The [meshtastic/protobufs](https://github.com/meshtastic/protobufs) repository describes it. The map already embeds them and keeps them up to date: **there is nothing to install**. The MQTT module's “JSON” option is not needed (and it is incomplete).

## The map's radio node
Optional to look at the map, **essential to program nodes remotely** and to send messages. See [[Connect a node|Connecter un module]].

## MeshCore channels
See [[MeshCore]]: `Public`, `#name` for a hashtag channel (the exact name is enough), `Name=secret` for a private channel.
