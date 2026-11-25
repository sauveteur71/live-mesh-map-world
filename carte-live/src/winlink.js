'use strict';
// Winlink par Pat (client Winlink libre, licence MIT, https://getpat.io), lancé à côté de la carte (service « pat »
// du docker-compose, profil « winlink »). La carte parle à l'API HTTP de Pat sur le réseau Docker interne ;
// Pat garde seul l'indicatif et le mot de passe Winlink de la station (sa propre configuration), la carte ne les voit
// jamais. Accès réservé aux membres d’un groupe radioamateur : lecture des boîtes pour les membres, rédaction et session radio
// pour les seuls membres licenciés (le trafic radioamateur est fait par un opérateur licencié, en son nom).
// VARA (EA5HVK, logiciel propriétaire pour Windows) n'est pas fourni : il tourne sur le PC radio et Pat s'y relie par
// ses ports TCP (réglage « varahf » / « varafm » de Pat), de même pour ARDOP ou un TNC packet.
// En plus du dialogue HTTP ci-dessus, le module se relie aussi en client au WebSocket /ws de Pat (celui que sert son
// interface web) pour suivre en direct la connexion en cours et l'arrivée de courrier, et relayer un évènement
// compact à server.js (voir surEvenement) sans attendre qu'un navigateur rouvre l'onglet Winlink. Pat peut très bien
// ne pas être lancé (fonction facultative) : la reconnexion se fait alors en silence, avec un repli croissant.

const WebSocket = require('ws');
const Gonio = require('../public/gonio.js');

function creerWinlink({ url = process.env.PAT_URL || '', journal = () => {} } = {}) {
  const base = String(url || '').replace(/\/+$/, '');
  const actif = () => !!base;
  async function pat(chemin, opts = {}) {
    if (!base) throw new Error('Winlink non configuré (variable PAT_URL, service « pat » du docker-compose)');
    let r;
    try {
      r = await fetch(base + chemin, { ...opts, signal: AbortSignal.timeout(opts.delai || 15000) });
    } catch (e) {
      throw new Error('Pat injoignable (' + (e.cause && e.cause.code ? e.cause.code : e.name === 'TimeoutError' ? 'délai dépassé' : e.message) + ') : le service « pat » est-il lancé ?');
    }
    const t = await r.text();
    if (!r.ok) throw new Error('Pat : ' + (t.trim().slice(0, 200) || 'HTTP ' + r.status));
    try { return t ? JSON.parse(t) : null; } catch { return t; }
  }
  const adresse = (a) => (a == null ? '' : typeof a === 'string' ? a : a.Addr || a.addr || String(a));
  const resumeMsg = (m) => ({ mid: m.MID, date: m.Date, de: adresse(m.From), a: (m.To || []).map(adresse), cc: (m.Cc || []).map(adresse), sujet: m.Subject || '', nonLu: !!m.Unread, pieces: (m.Files || []).map((f) => ({ nom: f.Name || f.name, taille: f.Size || f.size })), corps: m.Body });

  async function etat() {
    if (!base) return { configure: false };
    try {
      const s = await pat('/api/status', { delai: 5000 });
      // La configuration de Pat (indicatif, mot de passe Winlink) n'est jamais lue par la carte
      return { configure: true, joignable: true, indicatif: process.env.PAT_INDICATIF ? String(process.env.PAT_INDICATIF).toUpperCase() : null, connecte: !!(s && s.connected), appel: !!(s && s.dialing), distant: s && s.remote_addr ? s.remote_addr : null, ecoutes: (s && s.active_listeners) || [] };
    } catch (e) {
      return { configure: true, joignable: false, erreur: e.message };
    }
  }
  async function boite(nom) {
    if (!['in', 'out', 'sent', 'archive'].includes(nom)) throw new Error('Boîte inconnue');
    const l = await pat('/api/mailbox/' + nom);
    return (Array.isArray(l) ? l : []).slice(0, 200).map(resumeMsg);
  }
  async function message(nom, mid) {
    if (!['in', 'out', 'sent', 'archive'].includes(nom) || !/^[A-Za-z0-9_-]{1,40}$/.test(mid)) throw new Error('Message inconnu');
    const m = await pat(`/api/mailbox/${nom}/${encodeURIComponent(mid)}`);
    if (nom === 'in') pat(`/api/mailbox/in/${encodeURIComponent(mid)}/read`, { method: 'POST' }).catch(() => {});
    return resumeMsg(m);
  }
  // Rédaction : déposé dans la boîte d'envoi de Pat, parti à la prochaine session
  async function envoyer({ a, cc, sujet, corps, signature }) {
    const dest = String(a || '').split(/[\s,;]+/).filter(Boolean);
    if (!dest.length) throw new Error('Destinataire manquant (indicatif ou adresse e-mail)');
    if (dest.some((x) => !/^([A-Za-z0-9/-]{3,15}|[^@\s]+@[^@\s]+\.[^@\s]+)$/.test(x))) throw new Error('Destinataire invalide : indicatif (F4ABC) ou adresse e-mail');
    if (!String(sujet || '').trim()) throw new Error('Sujet manquant');
    const f = new URLSearchParams();
    f.set('to', dest.join(','));
    if (cc && String(cc).trim()) f.set('cc', String(cc).split(/[\s,;]+/).filter(Boolean).join(','));
    f.set('subject', String(sujet).slice(0, 128));
    f.set('body', String(corps || '').replace(/\r?\n/g, '\r\n').slice(0, 20000) + (signature ? `\r\n\r\n-- \r\n${signature}` : ''));
    f.set('date', new Date().toISOString());
    await pat('/api/mailbox/out', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() });
    journal(`[Winlink] message déposé pour ${dest.join(', ')} par ${signature || '?'}`);
    return { ok: true };
  }
  // Session : « telnet » (Internet, serveurs Winlink), ou par radio « varahf:///F1ABC-10?freq=3590 », « ardop:///… »,
  // « ax25:///… », « varafm:///… » selon ce que Pat sait joindre
  async function session(cible, auteur) {
    const c = String(cible || '').trim();
    if (!/^(telnet|((varahf|varafm|ardop|ax25|ax25\+linux|ax25\+agwpe|ax25\+serial-tnc|pactor):\/\/\/[A-Za-z0-9/-]{3,15}(\?[A-Za-z0-9=&.,_-]{0,80})?)|telnet:\/\/[^\s]{1,120})$/.test(c)) throw new Error('Cible de session invalide (telnet, varahf:///F1ABC-10?freq=3590…)');
    journal(`[Winlink] session ${c.split('?')[0]} lancée par ${auteur}`);
    const r = await pat('/api/connect?url=' + encodeURIComponent(c), { method: 'POST', delai: 10 * 60000 });
    return { ok: true, recus: r && r.NumReceived != null ? r.NumReceived : null };
  }
  // Passerelles RMS (liste tenue par Pat depuis les serveurs Winlink), positionnées par leur locator
  let cacheRms = { t: 0, l: null, cle: '' };
  async function passerelles({ mode = '', bande = '' } = {}) {
    const cle = mode + '|' + bande;
    if (cacheRms.l && cacheRms.cle === cle && Date.now() - cacheRms.t < 3600000) return cacheRms.l;
    const q = new URLSearchParams();
    if (mode) q.set('mode', mode);
    if (bande) q.set('band', bande);
    const l = await pat('/api/rmslist?' + q, { delai: 60000 });
    const res = (Array.isArray(l) ? l : []).map((r) => {
      const p = Gonio.depuisLocator(r.gridsquare);
      return p ? { indicatif: r.callsign, locator: r.gridsquare, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), modes: r.modes, freqKHz: r.freq && r.freq.khz != null ? Number(r.freq.khz) : null, freq: r.freq && r.freq.desc ? r.freq.desc : null, distanceKm: r.distance != null ? Math.round(Number(r.distance)) : null, url: r.url ? String(r.url) : null } : null;
    }).filter(Boolean);
    cacheRms = { t: Date.now(), l: res, cle };
    return res;
  }

  // ---- Flux temps réel (WebSocket /ws de Pat) ---------------------------------------------------------------
  // Pat pousse ses évènements (connexion en cours, session ouverte/fermée, nouveau courrier) sur le même WebSocket
  // que son interface web. Son contenu exact n'étant pas documenté comme une API stable, on ne s'y fie pas : chaque
  // message reçu déclenche seulement un nouvel appel à etat() (source sûre, déjà utilisée par la route REST), et on
  // devine juste s'il s'agit plutôt d'une arrivée de courrier (pour que le client rafraîchisse la boîte affichée)
  // à partir de quelques mots-clés attendus.
  const abonnes = [];
  function surEvenement(cb) { abonnes.push(cb); }
  function emettre(evt) { for (const cb of abonnes) { try { cb(evt); } catch (e) { journal('[Winlink] abonné en erreur :', e.message); } } }
  let wsPat = null, delaiRepli = 2000, minuterieRepli = null, minuterieDebounce = null, arretDemande = false, dejaSignaleHorsLigne = false;
  const REPLI_MAX = 60000;
  const urlWsPat = () => base.replace(/^http/i, 'ws') + '/ws';
  function programmerReconnexion() {
    if (arretDemande || !base) return;
    clearTimeout(minuterieRepli);
    minuterieRepli = setTimeout(connecterFluxPat, delaiRepli);
    delaiRepli = Math.min(REPLI_MAX, Math.round(delaiRepli * 1.7));
  }
  function signalerChangement(brut) {
    clearTimeout(minuterieDebounce);
    // Un sursaut de messages rapprochés (plusieurs évènements pour une même session) ne redemande l'état qu'une fois
    minuterieDebounce = setTimeout(async () => {
      let e;
      try { e = await etat(); } catch (err) { journal('[Winlink] état indisponible après un évènement de Pat :', err.message); return; }
      const messageProbable = /mail|message|unread|inbox/i.test(String(brut || ''));
      emettre({ genre: 'winlink', type: messageProbable ? 'message' : 'etat', etat: e });
    }, 400);
  }
  function connecterFluxPat() {
    if (!base || arretDemande || wsPat) return;
    let w;
    try { w = new WebSocket(urlWsPat(), { handshakeTimeout: 10000 }); } catch { programmerReconnexion(); return; }
    wsPat = w;
    w.on('open', () => { delaiRepli = 2000; if (dejaSignaleHorsLigne) { journal('[Winlink] flux temps réel de Pat rétabli'); dejaSignaleHorsLigne = false; } });
    w.on('message', (d) => signalerChangement(d));
    w.on('error', () => { /* le « close » qui suit journalise et programme la reconnexion */ });
    w.on('close', () => {
      wsPat = null;
      if (arretDemande) return; // arrêt propre de la carte : pas un incident, rien à journaliser ni à reconnecter
      if (!dejaSignaleHorsLigne) { journal('[Winlink] flux temps réel de Pat injoignable (nouvel essai en arrière-plan) : le service « pat » est-il lancé ?'); dejaSignaleHorsLigne = true; }
      programmerReconnexion();
    });
  }
  if (actif()) connecterFluxPat();
  // Arrêt propre (redémarrage de la carte) : ne pas rouvrir de connexion après
  function arreter() {
    arretDemande = true;
    clearTimeout(minuterieRepli);
    clearTimeout(minuterieDebounce);
    if (wsPat) { try { wsPat.close(); } catch { /* déjà fermé */ } wsPat = null; }
  }

  return { actif, etat, boite, message, envoyer, session, passerelles, surEvenement, arreter };
}

module.exports = { creerWinlink };
