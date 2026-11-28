# What's new, by version

The section of each version is copied as is into the GitHub release notes.

## 1.13.0

### 🌍 Pick a country (and a US state) instead of typing coordinates
- Setting up the map outside France ("Settings → Department → 🌍 Outside France: choose the position…") used to open a plain text prompt asking for latitude/longitude in decimal degrees — not friendly for a non-technical installer. It's now a small guided dialog: pick the **country** from a list of about 250, and, for the **United States**, a second list with the **50 states + DC**. The map works out the relief tile from that choice itself, exactly as before (same 1°×1° tile codes, same Copernicus relief).
- Reference positions are a capital or a large city per country/state — approximate, but close enough to start from; the exact position can still be refined later.
- A "**Enter precise coordinates…**" link keeps the old free-text prompt available for advanced users who want to type an exact latitude/longitude.
- Canada and Australia still use a single reference point per country for now (no province/state breakdown yet).
- For a country with a state list, a "**— Do not specify (general position of the country) —**" entry is available too, for someone who doesn't yet know their exact state: it uses the country's own reference position (the same one used when it has no state list at all). This still covers only a single 1°×1° tile, never the whole country — refine it later from Settings once the state is known.

### 🇺🇸 Custom zone: one US state, or several that touch
- **Réglages › Département › Zone sur mesure**: a checklist of up to 6 US states (reachable from the same "outside France" screen above, as the advanced path for the United States). The map's zone, contour, centering and relief then cover the union of the states you pick (e.g. "Californie + Nevada + Oregon"), instead of a single fixed 1°×1° square.
- Relief switches to Copernicus DEM (as for any zone outside France). A size guard refuses a zone that would need too much memory for the relief grid (several very large western states combined), with a clear message — see `wiki/Conception-zones-multi-etats.md` for the limits assumed.
- A soft warning (never blocking) appears if the chosen states don't look contiguous.
- Alaska isn't offered yet (its territory crosses the 180° meridian, not handled by this first version); outside the US isn't covered yet either.
- `DEPARTEMENT=US-CA+NV+OR` also works directly in `.env` for a first install.

### 🔧 Clearer logs when the area is set by hand
- If `reglages.json` already exists (the area has already been set once, from the wizard or the Settings page), the server now says clearly, once, at startup, that `ZONE_BBOX`/`DEPARTEMENT`/`ZONE_NOM` in the `.env` are ignored from then on — instead of silently keeping the old value with nothing in the log to explain why.
- If the area code ends up neither a known French department, a valid worldwide tile (`MN50E004`-style), nor a custom US-states zone (`US-CA+NV+OR`-style) — most often from editing `reglages.json` by hand, bypassing the Settings page's checks — the server now logs a clear error at startup instead of silently loading the wrong terrain, or none at all.
- A serial module that stays unplugged (or isn't passed through to the Docker container) no longer floods the log with the same "`/dev/ttyACM0` not found" line every 30 seconds: it's logged in full once, then only as an occasional reminder, until the module connects.
- `wiki/Installation.md` (and its English translation) now says explicitly that `ZONE_BBOX`/`DEPARTEMENT`/`ZONE_NOM` only matter before the area is first set in the interface.

## 1.12.0

### 🔷 Shapes, not just colors, for Meshtastic nodes
- **Legend and markers: one shape per category**, matching what MeshCore roles already had. Until now only color told apart relays, clients, muted/hidden clients, trackers/sensors and unknowns — hard to tell apart for colorblind users or on a small screen. Now: diamond for relays/routers, filled circle for clients, hollow ring for muted/hidden, triangle for trackers/sensors, square for unknowns.

## 1.11.0

### 📨 Winlink: live status over Pat's WebSocket
- The Winlink status badge on the radio group page now updates **live**, no more reloading the tab: the map keeps a WebSocket connection to Pat (the Winlink client) and pushes a status event to the browser the moment a connection starts, ends, or new mail arrives. Only the status is pushed (connected/dialing/remote station) — never a message's subject or body, which stays behind the existing permission check.
- Sent only to accounts allowed to see that station: members of the radio group that owns it, or map administrators.
- If Pat is not configured, or is unreachable, this stays silent: no extra log noise, no failed reconnect attempts.

### 🌍 English translations complete
- The ~650 texts introduced by the Secours spaces and radio-group modules (previous two versions) are now translated in `i18n-en.json`. The other 13 languages still fall back to English for anything they don't have their own translation for, as before.

## 1.10.0

### 📻 Radio groups (formerly ADRASEC), direction finding and Winlink
- Ported from the France edition's ADRASEC section (a French civil-defense body tied to a département) and generalized into a free-form **radio group**: an administrator creates a group with any name and an optional free-text area, and an operator can belong to several groups at once, each with its own teams and channels.
- **Direction finding** (beacon search) routes readings to the right group the same way as before — only the membership key changed, from a fixed French département to a free-form group code (1–8 letters/digits/hyphens).
- **Winlink mailbox** (via the Pat client) ported alongside: read mail, draft and send messages, launch a radio or Internet session, and look up nearby RMS gateways — restricted to the group's members, with message composing and radio sessions limited to licensed operators.
- "President" renamed to "**Coordinator**" throughout; a "Radio group" checkbox and coordinator role were added to account management.
- Integrated into the Operations hub ("Radio group" link).
- Tested: syntax-checked, server started against a test setup (routes respond). Not yet tested: direction finding with a real field reading, a real Winlink mailbox, or a physical phone.

## 1.9.0

### 🆘 Secours spaces: radio coverage for an event or a local emergency plan
- Ported from the France edition (`secours.js`) and generalized: separate, independent spaces (their own file, accounts and cookie), each covering the radio side of an event (festival, race, gathering) or of a local emergency plan.
- Unchanged mechanics: pinned incidents, teams tracked live, a running log, INTER/FIN/DISPO radio roll-call, assembly points, an end-of-mission report, and several organizations sharing one space.
- Generalized wording: the France-specific terms this module used (DPS, PCS) are replaced with neutral, country-agnostic language; organizations such as the Red Cross stay configurable examples, never a fixed list.
- Integrated into the Operations hub ("Secours spaces" link, shown to administrators who create spaces).
- Tested: syntax-checked, server started against a test setup (routes respond). Not yet tested: real field use, a physical phone.

## 1.8.0

### 🚨 "Operations" hub: emergency mode and alert zones in one place
- **Emergency mode** and **Alert zones** are no longer two entries lost among 25 others in the Tools menu. They now have their own **"Operations"** tab above the panel, shown only to the accounts that can use at least one of them, with a short explanation under each tile instead of a bare button.
- A **breadcrumb** ("Section › Tab") now sits above the tabs so you always know where you are, and lets you jump back to the section with one click.
- Every Tools menu entry now carries its own display level (simple / operator / expert) directly in the page, instead of a separate list to keep in sync in the code: adding a new tool entry with the right level is now a one-line change.

### 🗺️ Coverage plans: maximum altitude and combined site selection
- The department plan, the budget plan and a hand-drawn zone plan can now exclude sites **above a chosen altitude** — useful where the highest points are bare rock or exposed ridgeline, often harder to reach and with nothing to bolt a mast to.
- In any list of proposed sites (plan, budget plan, road sites, best sites), each site now has an **"Add to my selection"** checkbox. Check several (10 at most) and press **"Coverage of my selection"** to see their combined coverage, then **"Back to the list"** to return to the exact list you started from, checkboxes included.
- The four collapsible blocks of the Coverage tab (plan, budget plan, road sites, relocate relays) are now foldable, with the plan open by default; your choices are remembered on this device so the tab doesn't need endless scrolling.

### 📝 Field hints and in-app dialogs, shared across pages
- Fields for a node number, a ham callsign, an MQTT broker address, a channel key, an e-mail address and more now show a short **inline hint** (what's expected, an example, and whether what you typed matches) the moment you focus them, instead of relying only on a rejected form after the fact.
- The confirmation and text-entry dialogs, and the Markdown renderer used for the in-app help, now live in one shared file (`commun.js`) so that separate pages (not just the main map) can reuse them without duplicating the code.

## 1.7.1

### 🖥️ 64-bit system checked at install
- The install script now refuses a **32-bit** system (e.g. Raspberry Pi OS 32-bit, `armhf`) with a clear message, instead of letting Docker fail with `no matching manifest`. The map needs 64-bit Linux (x86-64 or ARM64). The README, Installation and Troubleshooting pages say so plainly, with the right check (`dpkg --print-architecture`).

### 💜 Donor wall: HelloAsso names shown as typed
- HelloAsso donations, added by hand by the administrator, now show **the name exactly as typed**: no more automatic shortening (“42BARBE” no longer becomes “42B***”). Shorten it yourself if you wish. GitHub Sponsors, read automatically, stay shortened.

### 🧰 Top menus always reachable to the last entry
- On a computer, the **Tools** menu (especially with “Both” networks shown) could be taller than the window: the last entries (Public map and exports, Emergency mode, Weekly report…) went off screen with no way to reach them. The Tools, Layers and Radio coverage menus now stop at the bottom of the window and **scroll**.

### 🌍 Area selector on a map outside France
- On a map set to a **world square** (e.g. “40°N–41°N · 75°W–74°W”), the area menu at the top no longer offers **France** and the **13 French regions**. It now offers the map area and **Whole map**.
- **Whole map** frames **every node the map knows** (Meshtastic and MeshCore, nodes announcing 0, 0 ignored), or a world view when there is none yet, instead of jumping to France.
- A French region remembered by the browser or given in a link (`?zone=r84`) falls back to the map area. The public map follows the same rule: no regions or French departments, **Whole map** instead of “Whole of France”.
- A World edition map set to a **French department** is unchanged: regions, neighbours and France are still there.

## 1.7.0

### 🖱️ The Tools menu buttons work again
- **12 buttons did nothing when clicked** (🔌 This PC's USB node, 📶 Bluetooth node, 📟 Meshtastic client, ⚡ Flash a Meshtastic node, ⚡ Flash a MeshCore node, 🛠️ Configure a MeshCore repeater, 📟 MeshCore app, 🕸️ Topology and simulation (Meshtastic and MeshCore), ⇄ Cross-network bridge, ☀️ Light theme, 📲 Install the app). The map **layer** toggle handler was attached to every button sharing the same look, including those in the Tools menu, and overwrote their real action. It now only applies to real layer toggles.
- Along the way, a **stray key** could have been stored in the layers kept by the browser: it is removed automatically, legitimate choices are kept. The **APRS stations**, **Rivers** and **LoRaWAN sensors** layers are finally remembered from one visit to the next.

### 🔌 A click on USB or Bluetooth always answers something
- Chrome only opens USB (Web Serial) and Bluetooth (Web Bluetooth) on a **secure** page: map over HTTPS, or opened from the machine running it. Map opened over `http://` from another PC (a Tailscale address, for instance), or in Firefox or Safari: the **🔌 This PC's USB node** and **📶 Bluetooth node** buttons are marked **⚠**, and a click explains in plain words what is missing instead of doing nothing.
- Every node connection path (Meshtastic and MeshCore, USB and Bluetooth, Tools menu and the “Connect a node” panel) **no longer fails silently**: chooser closed, empty list, port already in use, Bluetooth refused… each case gives a message that says what to do.

### 🪟 Wider windows, and click next to one to close it
- On a wide screen, settings windows open **wider** (1040 px instead of 760 px): everything is visible without scrolling, instead of a narrow column in the middle of the screen.
- **⤢** button next to the close cross: widens further (up to 1480 px, or 1800 px for very large windows), **once for every window**, and the choice is kept for the next visit. Hidden below 1000 px wide: phones and tablets are unchanged.
- **Clicking next to a window closes it**, just like the ✕ or the Esc key (no more scrolling back to the top of a long window to find the cross). A click inside the window, even on an edge or an empty area, never closes it, and neither does a text selection released outside. If **something has been typed**, the window stays open and says so: nothing is lost. The setup window is not closed this way.

### 🧾 Recent operations: what was really sent
- *Manage › Program › Recent operations* used to show **firmware field names** (“telemetry · device (nodeInfoBroadcastSecs)”) and never the values. Each operation now shows, **setting by setting**, what was sent to the node, with units: “Node sheet: every 3 h”, “Transmit power: 20 dBm”, “Role: Router late”.
- **Previous value** when it is really known: “before: every 15 min (read 20 min ago)”, from the last configuration read from the node before the send. A fix started from *🚦 Traffic control* shows the **measured** interval: “measured over 24 h: every 4 min” — a traffic measurement, not the setting stored in the node. With neither a reading nor a measurement, only the sent value is shown.
- **No key is ever shown**: a changed channel shows “key sent (not shown)”. Admin keys, passwords and tokens are hidden, including for a setting the map does not know yet. Operation parameters no longer leave the server, not even for the follow-up of a change.
- A long summary folds under “and N other settings” (nothing is removed), reads well on a phone, values in high-contrast text.
### 🌡️ MeshCore sensor readings: they start again on their own
- **A node that does not answer no longer blocks the others**: each node of a MeshCore task now has a maximum duration, **set in MeshCore › Companion › MeshCore module** — *Maximum time for a reading, per node* (1 to 30 min, 4 by default: telemetry, status, path, trace) and *Maximum time for a full read, per node* (5 to 240 min, 60 by default: read of settings, programming, commissioning) — and so does each task. An operation that never handed back control used to stop **all** the following automatic readings, without reporting anything, until the map was restarted.
- **Quick retry**: a reading request left unanswered is tried again twice, a quarter of an hour apart, instead of waiting for the whole interval (one lost attempt used to cost a 3 h gap for a reading every 3 h).
- **No more permanent blocking**: a task stopped from the interface while it was waiting its turn was never marked as finished; its nodes were then never read automatically again, even after a restart (the task file is repaired at startup). Sensor readings now start again by themselves if a task drags on for more than an hour.
- **“Late readings” alert**: it now also works for a node set up before this tracking existed and never read since.
- **Sensor alerts visible outside the area**: the “late readings” alert and the one for a measurement outside its threshold are now shown even if the sensor is outside the map's area. A sensor whose reading you set up yourself is a node you follow, wherever it is. The other MeshCore alerts (silent, battery, channel) stay filtered on the area.
- Reminder shown in the *Sensors* tab: the number of readings under a measurement is the one of the **displayed period** (1, 7, 30 or 90 days), not a total.

### 🧭 Nodes of a department: Meshtastic, MeshCore or both
- The *Nodes of a department* screen (search “43”, “Haute-Loire”…) now also lists **MeshCore nodes**, filed by the position of their latest advert. It starts from the network shown on the map (Meshtastic, MeshCore or both) and a **Meshtastic / MeshCore / Both** selector changes it on the spot; **MT** / **MC** tag on each row, *Network* column in the CSV export. Clicking a MeshCore node opens its MeshCore page, and closing it brings you back to the list.

## 1.6.0

### 🗺️ Alert sectors (geofencing)
- *Tools › 🗺️ Alert sectors* (managers read, administrators edit): draw a **polygon** or a **circle** on the map, attach it to a **team** (its current members) and/or to chosen nodes (Meshtastic, or MeshCore by public key), and get an alert when someone **leaves** the sector, **enters** it (area to avoid) or both.
- **No false alerts**: margin around the boundary, 2 positions in a row needed to change state (adjustable), minimum delay between two alerts for the same node, a packet heard by several gateways counts once. **Blurred positions** (firmware 2.7/2.8) widen the margin; a position blurrier than the sector is ignored and logged once.
- Optional **loss of contact** alert (no position for 10 min to 2 h) and optional short **LoRa message** on a channel (at most one every 30 s).
- Alerts go where the others go: *Network › Alerts*, sound and notification for connected managers, Android app, MQTT home automation. **Log** of entries, exits and losses of contact, filter by sector, **CSV export**.
- The former team “safety zone” (circle) becomes a sector automatically. Sectors, their alerts and team help requests are no longer sent to the public view.

### 🚨 Emergency mode
- *Tools › 🚨 Emergency mode* (turned on and off by an administrator; managers read the crisis board and add notes), inspired by MeshWave's emergency mode: **red banner** and red frame for every connected account, **simplified high-contrast map** (ordinary network in the background, responders, help requests and sectors in front), **crisis board** (help requests, sector alerts, responders, critical alerts), network status every 10 s, reports and incident log brought back if they were hidden.
- **Time-stamped crisis log**: start, help requests, distress messages heard on the channels (SOS, MAYDAY, 🔔…), sector events, new critical alerts, hand-written notes, end; **CSV export**, the 10 previous crises are kept. Survives a restart.
- No radio setting is changed and no LoRa message is sent by emergency mode.

### ⚡ The map no longer freezes
- The **relay** of each packet is found in an index (before, the whole node table was re-read for every packet); the **node list** is prepared at most every 10 s and shared between all visitors, who now only receive the nodes that changed; Meshtastic statistics and alerts computed by the database; **hourly purge in small batches** of 250 rows; new nodes filtered by area; MeshCore packets outside the perimeter dropped from the MQTT topic.
- **Map health › Responsiveness** (*Network*): **freezes** measured every minute (“warning” alert beyond 1.5 s repeated, “critical” beyond 5 s), freeze curve, **slowest tasks of the last hour** (longest run, average, number of runs) and, for each recent freeze, the suspect task. `outils/banc-reactivite.js` tool to measure an installation.
- Copernicus terrain decoded in a separate thread and tiles read one by one; yield points in coverage computations: the map stays responsive while a terrain loads.

### 🏔️ Approximate terrain and terrain disk space
- **Coarse terrain of the whole world** (NOAA ETOPO1, ≈ 9 km, 19 MB downloaded once in the background): while the detailed terrain of an area downloads, the coverage of a point, a site, several sites or the network, the “what if” simulation and “link two places” already show up, marked **“⏳ Approximate terrain”**, then are recomputed by themselves on the detailed terrain. Never cached as if it were detailed. **On by default** in the world edition (`RELIEF_MONDE=non` to turn it off, or *Tools › 🗺️ Area terrain › 💾 Terrain downloaded on this server*).
- **Terrain cache purge** (administrator, same block): space used, each area with its size and last use, deletion **per area**, of areas **unused for N days** or of **everything** (with confirmation), **limit in GB** beyond which the least recently used areas are deleted by themselves. The map's own area, an area being loaded or used less than 10 min ago are never deleted; every purge is written to the log.

### 🔎 Search in messages
- **“Search a word, a name or a callsign…”** field at the top of the *Messages* tab: text of Meshtastic and MeshCore messages (SQLite full-text index, **case and accents ignored**, start of word: “chap” finds “chapeau”), **long name, short name, id** (`!xxxxxxxx`, number, start of a MeshCore key) of the sender and of the recipient of a direct message, under their **current name** even if the node was renamed.
- Results from newest to oldest, highlighted terms, why it matched (text, sender, recipient), “Older…”; a click opens the message in its place in its channel.
- **Same permissions** as reading messages: logged-in members; in the demo, public channels only, never direct messages. The index is built at the first start and follows the retention purge.

### 💜 Donor wall
- *Tools › 📤 Public map and exports › Donor wall* (administrator): a **discreet banner** at the top of the map and of the public page thanks those who support the project (shortened name “42BAR***”, country, amount only if you want it). Every visitor can close it for good. Everything is **off by default**.
- **HelloAsso** (donations to Radio-club du Velay): HelloAsso does not say whether a donor agrees to be shown, so **no donation appears automatically**: the administrator adds each entry by hand, with a mandatory “donor's consent” box. The API credentials only serve to check the access.
- **GitHub Sponsors**: only the sponsors that GitHub marks **public** are read (token kept on the server, never sent to the browser). Settings also in the `.env` (`HELLOASSO_*`, `GITHUB_SPONSORS_*`, `DONATEURS_INTERVALLE_HEURES`); keys and tokens are never shown again nor written to the log.

### 🌐 7 more interface languages
- The interface now exists in **16 languages**: Traditional Chinese, Swedish, Greek, Turkish, Korean, Japanese and Ukrainian join French, English, Spanish, German, Italian, Portuguese, Dutch, Polish and Czech (*Settings › Display › 🌐 Language*; follows the browser by default).

### 📡 Meshtastic firmware 2.8
- **Packet signatures** checked by the map with the sender's public key (✍ signed, ✍ ? unknown key, ⚠ invalid signature), “signs its packets” badge in the node sheet.
- **Renumbered nodes** (number derived from the key in 2.8): safe merge when the number follows from the key, reset nodes offered for merging (same name and hardware), merge extended to teams, favorites and persons in charge, **undo of the last 20 merges**.
- Node sheet: “no position received” explained (position off by default in 2.8), blurred position shown as a circle. TinyFast/TinySlow, LiteFast/LiteSlow, NarrowFast/NarrowSlow presets recognised everywhere.

### 🔭 MeshCore: public observatories (CoreScope)
- The community [CoreScope](https://github.com/Kpa-clawbot/corescope) observatories (France, Texas, Belgium/Netherlands) become a **MeshCore source** without account or key: *MeshCore › Companion › Public observatories*, or one click in the “No MeshCore source” message. The address is tested before being added.
- API polled at our own pace (every 20 s), **cap per minute**, filter by area codes (`address=LYS,CFE`), known nodes imported at once, observatory credited at the foot of the map. Variables `MESHCORE_CORESCOPE`, `MESHCORE_CORESCOPE_INTERVALLE`, `MESHCORE_CORESCOPE_MAX_MINUTE`.
- Without a MeshCore source: clear message and help in three choices, broker address accepted without `mqtts://`, MeshCore counters hidden on the public page until a node is received. Wiki: **minimum hardware** (Pi 4/5 in 64-bit, NAS).

### 🔧 Fixes
- Missing English translations of server messages (CoreScope observatories, merge and undo of 2.8 nodes); English log: “emergency mode ended by …” and “sector … created / deleted by …” were half translated.
- *Connect a node over Wi-Fi*: the “Connect” button was white on white.

## 1.5.14

### 🔧 Fixes
- **One-click update**: if the Docker engine is slow to answer when the old version is stopped, the update now follows the container's real state instead of giving up, and **puts the old version back** if any step fails (the map is no longer left stopped). If the update service itself is interrupted halfway, it restarts the map when it comes back.
- **MQTT root topic**: a root typed with a trailing `/#` is corrected (the map adds `/#` itself; `…/#/#` was refused by the broker and no packet arrived).
- *Manage › Backups*: each backup now shows its **full date and time** (the name was cut off as “2..”).

## 1.5.13

### 🔧 Fixes
- **Terrain profile and link budget outside France**: when the French IGN service has no elevation (anywhere outside France), the map now falls back to the world service instead of failing with “Cannot read properties of null”; the link-budget frequency follows `RADIO_FREQ_MHZ` (906.875 MHz for the US) instead of being fixed at the European 869.525 MHz.
- **Link between two points**: the start and end cards showed “antenna undefined m”; they now show the antenna height you entered.

## 1.5.12

### 🗺️ Terrain of the area (world map)
- On a map outside France, the “whole of France” block (96 departments, IGN terrain) is replaced by **Tools › 🗺️ Area terrain**: one button, **⬇ Download the area and neighbouring squares**, prepares the Copernicus terrain (30 m), high points and access roads of the map's 1° square and its 8 neighbours (3 × 3 squares), with a “x / 9 squares” counter. It goes on if you close the page; the public map then switches by itself to **anywhere in the world** (each square is otherwise loaded on demand). Choice “Map area only” / “Anywhere in the world” in the same block.
- Buttons, search and menus say “Area terrain” instead of “Whole of France”; translations in 8 languages; wiki updated. The French edition is unchanged.

## 1.5.11

### 🌍 Feeding a world map
- Documentation: how to listen to the official public Meshtastic broker **by region** (`msh/US`, `msh/EU_868`…; the “all topics” subscription is refused by that broker), several regions on the same broker with `MQTT_SUJETS_SUPPLEMENTAIRES`, volume and key advice, and the MeshCore community brokers (no single world broker). `.env.example` updated.

## 1.5.10

### 📡 Member gateways
- **Tools › 📡 Become a gateway**: a logged-in member (not only the administrator) connects **their own** Meshtastic or MeshCore radio from the browser, over USB or Bluetooth, with nothing to install. It adds what it hears to the map, **listening only**: it never transmits and never replaces the main node.
- Named after the member's account, **two radios per account**, rate-limited; the administrator sees each gateway in *Radio nodes* and can **cut it off** (then refused for 12 h). Setting *Radio node › Member gateways*.
- USB and Bluetooth require the map over **HTTPS**.

### 🎚️ Channel set
- The administrator defines the map's channels; a member who connected their radio sees its 8 slots, ticks channels and clicks **Write to the radio**: written, then read back to check. Not enough room: they choose which channels to free; channel 0 is never touched; warning for unencrypted channels.
- **Keys never leave the server** (encrypted, short fingerprint for whoever edits the set).

### 📊 Traffic (Manage › Traffic)
- Visitors online, visitors and pages per day, **countries** (free DB-IP database looked up on the server), pages, **sources** (Facebook, rtl-sdr.com…).
- **No IP address kept, no cookie**, robots ignored; settings `STATS_FREQUENTATION` and `STATS_PAYS`.

### 🛠️ Fixes
- *Manage › Accounts*: clearly visible **✔ Save** button, Enter saves, all open rows saved at once.

## 1.5.9

### 🔑 Accounts
- **Forgotten password**: “Forgot your password?” link below sign-in. With an outgoing mail server set (*Settings › Advanced settings › E-mail*), a link valid for 1 hour is e-mailed; otherwise the request shows in *Manage › Accounts*, where the **🔑 Link** button creates a single-use link (24 h) to pass on.
- **E-mail** editable in *My account*.
- **Usernames with spaces and accents** (e.g. “SMITH John”).
- **Account details editable by the administrator** (✏️): username, callsign, e-mail.

## 1.5.8

### 📱 Phone and Android app
- **Bottom drawer**: when fully open, it stops below the title and the place search (even with enlarged text); a **▾** button collapses it, and the handle is bigger.
- **App version** shown next to the map version (compare phone and tablet), and in the back-button menu title.

### 🛠️ Fixes
- **Alerts sent over MeshCore**: their echo relayed by repeaters no longer counts as an unread message.
- **Official alerts**: when the 📡 Send button is missing, the reason is shown (module not linked, no named channel).

## 1.5.7

### 🛠️ Fixes
- **USB and Bluetooth with the map opened on the PC itself** (`http://localhost:8095`): “Connect a module › USB” is no longer greyed out (it required HTTPS, which Chrome does not need on localhost).
- **Ctrl+K search**: a Tools menu item (e.g. “PC USB module”) is launched directly, instead of only being highlighted in the menu.

## 1.5.6

### 🏔️ Link profile in 3D
- **“View this profile in 3D” button** in the terrain profile: the link opens in the 3D view, seen from the side, on the real terrain. The line of sight is coloured section by section (green clear, orange Fresnel zone partly blocked, red blocked by the terrain), the 1st Fresnel zone is drawn as a light volume, antenna masts at their height, and the main obstacle is marked. Heights follow the “Terrain ×” slider, and the view rotates with the mouse like the rest of the 3D view.

### 🛠️ Fixes
- **“PC USB module” that did nothing**: the cause is now shown on screen (HTTP address, browser without USB, empty port list: cable or CP210x / CH340 driver, port already open in another app) and success is confirmed.

## 1.5.5

### 🛠️ Fixes
- **Offline base map that would not download** in the Docker image (“extraction stopped (code 1)”): the extraction tool had no root certificates to reach the map server over https. They are now included, and on failure the message says why (certificates, server unreachable, disk full).

## 1.5.4

### 📣 Nodes to invite
- **Screen redone**: one card per node with its full name (it was cut to one letter), its preset, distance and when it was seen; filter “in the map's area”, 25, 50 or 100 km; clear steps (① sentinel node to write, ② choose the nodes); the “Invite” button explains what is missing while no sentinel is connected.

### 🇫🇷 MeshCore: settings recommended in France
- **MeshCore France configurator** offered where repeaters get installed: “Join” page, MeshCore maintenance, sites suggested for a relay.
- **Configurator backup imported** into MeshCore maintenance (.json file): hardware, firmware, date and settings kept for each repeater (never the passwords or the private key, which stay in the browser).
- **French recommendations checked** for each repeater, from what the map hears: department number at the start of the name, position advertised, 2-byte paths (path.hash.mode 1), one flood advert a day, French preset 869.618 MHz · 62.5 kHz · SF8 · CR8.

### 🤝 “Join the network” page
- **MeshCore-only network**: with the channel link and hop limit left empty, the page no longer shows the Meshtastic part (like the MeshCore part when empty).
- **MeshCore part completed**: repeater regions, a “French preset” button that fills everything in, minimal repeater commands generated on the page, links to the configurator and recommended settings.

## 1.5.3

### 🛠️ Fixes
- **The map's own MeshCore messages** (warnings sent by radio, messages written from the map): when they come back repeated by a relay or seen by an observer, they are no longer marked “new” or counted as unread.

### 📱 Phone
- **Icons on phones**, as on tablets: panel sections (🗺️ Network, 💬 Messages, 📶 Coverage, 🛠️ Manage, ⚙️ Settings) and bottom bar (🗂️ Layers, 📡 Radio coverage, 🧰 Tools, 👤 Login) with one word below. Computers keep the full display.
- **Header that fits a phone**: the live status becomes a coloured dot, official alerts shrink to their icons and count (details on click).
- **More compact bottom bar**: smaller area selector and link duration, shorter search text, so fewer buttons are cut off.

## 1.5.2

### 🗺️ Legend
- **Layer symbols in the legend**: APRS stations (LoRa APRS and others), LoRaWAN sensors and gateways, river stations (normal, flooding, dam), shown as soon as the layer is on.

## 1.5.1

### 🛠️ Fixes and comfort
- **Android app**: the map no longer sits under the status bar (time, icons) or the navigation bar on Android 15, and the keyboard no longer covers the input.
- **Layers menu in three columns** on a computer (base map and waypoints · network · around the network): it fits the screen height instead of overflowing.
- **Disabled layer** (Rivers, LoRaWAN sensors, APRS stations): the notice stays longer and, for an administrator, a click opens Advanced settings on the right group.
- **APRS stations clearly distinct from nodes**: white square marked “A” (purple edge for LoRa APRS, blue for others) and an “APRS” tag before the callsign.
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
