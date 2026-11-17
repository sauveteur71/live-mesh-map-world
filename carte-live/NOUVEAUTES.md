# What's new, by version

The section of each version is copied as is into the GitHub release notes.

## 1.5.1

### 🛠️ Fixes and comfort
- **Android app**: the map no longer sits under the status bar (time, icons) or the navigation bar on Android 15, and the keyboard no longer covers the input.
- **Layers menu in three columns** on a computer (base map and waypoints · network · around the network): it fits the screen height instead of overflowing.
- **Disabled layer** (Rivers, LoRaWAN sensors, APRS stations): the notice stays longer and, for an administrator, a click opens Advanced settings on the right group.
- **Help under every advanced setting**: the 36 settings that had none now explain what they do and their default.
- **River and sensor curves** easier to read: min and max values in a margin, start and end of the curve spelled out (“8 h ago” … “3 h ago”); no more text over the line.

## 1.5.0

### 🌊 Rivers
- **New optional “Rivers” layer** (France): water height, flow and trend from the public gauging stations in the area (Hub'Eau, the same measurements as Vigicrues), with a 24 h curve. Free, no account, no hardware.
- **Flood alerts** on the map: fast rise (20 cm/h by default, adjustable) and height thresholds chosen per station. Dams and reservoirs do not raise rise alerts.

### 📟 LoRaWAN sensors
- **New optional “LoRaWAN sensors” layer**: the sensors of a The Things Network (v3) or ChirpStack (v4) application on the map (water level, weather, rain…), with their latest readings, a 24 h curve, the gateways that received them and the signal (RSSI, SNR). Read-only through the application's MQTT; members only by default.
- **Threshold alerts** chosen per sensor (“level-post.height > 150”, “battery < 3.3”), and an alert if the MQTT server stays unreachable.

### 🧰 Monitoring
- **Background task failures shown in the alerts**: river readings failing, APRS-IS unreachable.

### ✉️ Messages
- **A channel's history always shows**: choosing a channel (or direct messages) loads its own history. A quiet channel, such as an association's, is no longer hidden by hundreds of messages on chatty channels.
- **Messages kept 90 days** (adjustable: *Advanced settings › Messages and MQTT*) instead of the traffic retention (7 days by default).
- **Impossible direct message flagged before sending**: if the node does not know the recipient's public key yet (it would refuse the message), the map says so, explains why (NodeInfo not received yet, firmware older than 2.5) and offers to write on a channel instead.
- **“Exchange info with this node” button** in that warning: the map sends its node's info (with its public key) to the node, which replies with its own; the direct message then goes through.

### 🛠️ Fixes
- **Panel tabs** (Network, Messages, Coverage, Manage, Settings) no longer overlap on a computer screen.
- **English interface**: durations ("2 h ago"), hops, telemetry (mains, channel, airtime), dashboard summaries and the days of the 7-day health table are translated.
- **Relay register**: limited to the relays and gateways of the map's area (no longer the whole country), in a wider panel so the table stays readable.
- **Demo mode on a phone**: the banner is readable (it showed as a circle in the middle of the screen) and can be closed.

## 1.4.0

### 📡 Alerts sent by radio
- **Warnings and hotspots already sent stand out**: green edge, "Already sent by radio" tick, time, sender and channels; the button becomes "Send again". New alerts keep their colour. Shared by all users and kept across restarts.

### 🗂️ Relay register
- **All relays and gateways in one table** (Tools menu): site, permission and its date, protected area, last on-site visit (orange after 6 months, red after a year), power, firmware, last packet. Relays without written permission and those not visited for a year are counted at the top. CSV export.

### 🏔️ 3D network view
- **New 3D view** (Radio coverage): relays, gateways and MeshCore repeaters placed on the terrain, links of the last 24 h coloured by SNR, adjustable terrain exaggeration, dark, aerial or topographic base map, slow rotation.
- It follows the **department being studied** on the map.

### 📡 Radio and hardware
- **Cable loss calculator**: next to cable losses (installation sheet, profile and link budget), pick the cable type, length, connectors and lightning arrester; the loss follows the network frequency.
- **"📻 Amateur radio" badge** on nodes set to Meshtastic licensed mode (no encryption, callsign).

### 📻 APRS stations
- **New APRS stations layer**: LoRa APRS trackers, iGates and digipeaters (433.775 MHz) and other APRS stations in the area, read from APRS-IS read-only (nothing transmitted, no passcode). Off by default: *Advanced settings › APRS (amateur radio)*.
- **Mic-E positions read** (Kenwood, Yaesu… handhelds and mobiles), **amateur radio callsign required** to enable the layer, area followed when the map's department changes.

### 🛰️ Export for ATAK
- **Network as KML** (relays, nodes, radio links coloured by SNR) for ATAK and Google Earth, plus a live KML link refreshed every minute.
- **Live KML link reliable behind an https reverse proxy**: it uses the address seen by the browser.

### ⚠ Installing a relay the right way
- **Site fields on the installation sheet**: permission (written, signed agreement, verbal, pending…), its date, protected area and last visit.
- **Warning on suggested sites**: a high point is not an authorised site. Landowner or municipality consent, no relay in a cemetery or place of worship, heritage authority approval near historic monuments, coastal rules and protected natural areas.

### ⚡ Lighter page
- **Administration screens loaded on demand**: a visitor downloads 17% less when opening the map; for a member they are preloaded in the background.

### 🔒 Security
- **Known flaws in dependencies checked on every push**, in addition to the weekly check.
- **3D view library updated** (MapLibre 6): fixes a known flaw in the previous version.
- **Register CSV export**: a node name starting like a formula (= + - @) is no longer run by the spreadsheet.

## 1.3.0

### 🔌 Plug in a node, nothing to set up
- **Automatic USB connection** from the browser: plug in a Meshtastic or MeshCore node, it is recognised and connected by itself; swap it, the map follows.
- **Ready-to-use agent (1.7)**: a file downloaded from the map, already set up (server address, code, role). Run it, it finds the USB node and connects, with no questions asked.
- **Wi-Fi nodes found automatically (mDNS)**: Meshtastic nodes announcing themselves on the local network are added to the list.
- **Local network UDP listening**: packets broadcast on the local network by Meshtastic Wi-Fi nodes (firmware 2.6 and later) reach the map, with no MQTT broker.

### 📣 Grow your network
- **Nodes to invite**: the map spots nodes in your area set to another preset (LongFast when your network uses LongModerate, for example), and lets you send them an invitation through a "sentinel" node.
- **"Join the network" page** (`/rejoindre`): channel QR code, recommended preset, recommended roles, hop limit, rules, tested antennas, community relays and donation call.

### 🏠 Home automation and monitoring
- **Home Assistant and Node-RED**: network status, alerts and relays published over MQTT, with Home Assistant auto-discovery (sensors, connectivity, battery, relay position). A message published by home automation can be sent over LoRa (off by default).
- **Prometheus / Grafana**: one metric per watched relay (heard or not, since when, battery, voltage) and one per current alert, to alert from Alertmanager.
- **MeshCore supervision**: new alert when a repeater misses two status requests in a row, even if it is still heard.

### 🎨 New identity
- **New logo** in the map header, the browser tab icon, the web app and the Android app.

### 📚 Documentation
- New wiki pages: "Home automation and monitoring", ready-to-use agent, automatic USB connection and UDP listening.
