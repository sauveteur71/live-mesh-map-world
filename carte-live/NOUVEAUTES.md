# What's new, by version

The section of each version is copied as is into the GitHub release notes.

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
