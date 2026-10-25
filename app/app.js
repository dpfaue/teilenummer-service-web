/* Zentrale – Verwaltungs-App für alle Bereiche (Teilenummer.Service, Heizung-Störung.de, Handwerker-Mappe) (PWA)
   Spricht dieselbe Apps-Script-Schnittstelle an wie admin.html (JSONP, geschützt per Admin-Schlüssel). */
'use strict';
const APP_VERSION = '2.0 (25.10.2026, Zentrale)';
const API = 'https://script.google.com/macros/s/AKfycbz5uEEaTn5Pe-ec-33u-pvSRlJCKSAYdsRV3CgDyBfdfGwoHiEGjb46DXZIARyjO293aA/exec';
const GMAIL = 'https://mail.google.com/mail/?authuser=teilenummer.service@gmail.com';
const PAKETE = { basis: 'Basis', express: 'Express', premium: 'Premium' };
const STATI = ['offen', 'in Bearbeitung', 'beantwortet', 'erstattet'];
const FB_VER = '10.12.2'; // Firebase-JS-SDK für Push
// Mehrmarken (Entwurf): Anfragen von Heizung-Störung.de kommen mit service 'heizung' aus dem Backend.
const BEREICHE = { alle: 'Alle Bereiche', teilenummer: '🔧 Teilenummer', heizung: '🔥 Heizung', vorlagen: '📄 Handwerker-Mappe' };
const svc = r => (r && r.service) || 'teilenummer';
const HEIZ = r => svc(r) === 'heizung';
const VORL = r => svc(r) === 'vorlagen';
const svcIcon = r => svc(r) === 'teilenummer' ? '' : BEREICHE[svc(r)].split(' ')[0] + ' ';
const FELD = r => HEIZ(r) ? { modell: 'Gerät', fin: 'Fehlercode', motor: 'Anlagendruck', teile: '① Ursache / ggf. Ersatzteil' }
  : VORL(r) ? { modell: 'Produkt', fin: 'Firma', motor: '–', teile: '① (nicht nötig – automatisch ausgeliefert)' }
  : { modell: 'Modell', fin: 'FIN', motor: 'Motor', teile: '① Gefundene Teile' };
let bereich = (function () { try { const v = JSON.parse(localStorage.getItem('z_bereich')); return BEREICHE[v] ? v : 'alle'; } catch (e) { return 'alle'; } })();
const vrows = () => bereich === 'alle' ? rows : rows.filter(r => svc(r) === bereich);
const HEIZ_TPL = [
  { t: '🔥 Ursache + Schritte', x: 'Der Code {fin} bedeutet bei deinem {modell}: \n\nWahrscheinlichste Ursache in deinem Fall: \n\nDas kannst du selbst gefahrlos prüfen:\n1) \n2) \n3) \n\nWenn das nicht hilft: Bitte einen Fachbetrieb rufen und ihm den Code {fin} nennen – dann weiß er gleich, wo er suchen muss.' },
  { t: '🔥 Druck auffüllen', x: 'Dein Anlagendruck ({motor}) ist zu niedrig. So füllst du Wasser nach:\n1) Heizung ausschalten und abkühlen lassen.\n2) Füllschlauch an Wasserhahn und Füll-/Entleerhahn (KFE) anschließen, Schlauch vorher mit Wasser füllen (keine Luft).\n3) Hähne langsam öffnen, bis das Manometer kalt ca. 1,5 bar zeigt (Herstellerangabe beachten).\n4) Hähne schließen, Schlauch abnehmen, Heizung einschalten und entstören.\n\nVerliert die Anlage innerhalb weniger Tage wieder Druck, liegt ein Leck oder ein defektes Ausdehnungsgefäß vor – dann bitte vom Fachbetrieb prüfen lassen.' },
  { t: '🔥 Fachbetrieb nötig', x: 'Bei diesem Fehler geht es um Teile, an denen laut Gesetz nur ein eingetragener Fachbetrieb arbeiten darf (Gasweg/Abgas). Bitte selbst nichts öffnen.\n\nWas du dem Fachbetrieb sagen kannst, damit es schnell geht:\n• Gerät: {modell}\n• Fehlercode: {fin}\n• Vermutete Ursache: \n\nSo vermeidest du unnötige Suchstunden auf der Rechnung.' },
  { t: '🔥 Rückfrage', x: 'Damit ich die Ursache eingrenzen kann, brauche ich noch kurz:\n\n• \n\nEin Foto vom Display und vom Typenschild hilft auch. Sobald ich die Antwort habe, melde ich mich.' },
  { t: '🔥 Nicht lösbar → Erstattung', x: 'Leider kann ich die Ursache für deinen {modell} aus der Ferne nicht sicher eingrenzen. Grund: \n\nDeshalb erstatte ich dir den vollen Betrag über PayPal – das Geld ist in den nächsten Tagen wieder auf deinem Konto.' }
];
const VORL_TPL = [
  { t: '📄 Mappe erneut senden', x: 'Hier ist deine Handwerker-Mappe noch einmal – die ZIP-Datei mit allen Vorlagen hängt an. Bitte auch im Spam-Ordner schauen, falls künftig etwas fehlt.' },
  { t: '📄 Logo-Version', x: 'Gern baue ich dein Logo und deine Firmendaten fest in alle Vorlagen ein (Aufpreis 20 €). Schick mir dafür bitte:\n• Logo (PNG oder JPG)\n• Firmenname, Anschrift, Telefon, E-Mail\n\nDu bekommst die fertige Mappe innerhalb von 2 Werktagen.' }
];
const tplsFor = r => HEIZ(r) ? HEIZ_TPL : VORL(r) ? VORL_TPL : tpls;
const DEFAULT_TPL = [
  { t: 'Teilenummer gefunden', x: 'Für deine FIN {fin} habe ich folgende Teile ermittelt:\n\n{teile}\n\nSuchbegriffe für Shops: \nBezugsquelle: Originalteil beim Vertragshändler oder meist günstiger bei Teilehändlern und Online-Shops – einfach die Teilenummer ins Suchfeld eingeben.{extras}\n\nAchte beim Kauf darauf, dass die Nummer genau übereinstimmt.' },
  { t: 'Mehrere Varianten', x: 'Für deinen {modell} gibt es je nach Ausstattung mehrere Varianten:\n\n1) \n2) \n\nWelche bei dir verbaut ist, erkennst du am einfachsten an: ' },
  { t: 'Rückfrage', x: 'Damit ich das Teil eindeutig bestimmen kann, brauche ich noch eine Info von dir:\n\n• \n\nSobald ich deine Antwort habe, melde ich mich mit dem Ergebnis.' },
  { t: 'PDF im Anhang', x: 'Alle Teile mit Teilenummern findest du übersichtlich im angehängten PDF. Das PDF ist gleichzeitig deine Rechnung.' },
  { t: 'Nicht ermittelbar', x: 'Leider konnte ich das gesuchte Teil für deinen {modell} nicht eindeutig ermitteln. Grund: \n\nDeshalb erstatte ich dir den vollen Betrag über PayPal – das Geld ist in den nächsten Tagen wieder auf deinem Konto.' }
];

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

let adminKey = store.get('tns_key', '') || (function () { try { return localStorage.getItem('tns_admin_key') || ''; } catch (e) { return ''; } })();
let rows = store.get('tns_rows', []);
let inbox = store.get('tns_inbox', null);
let mailUnread = store.get('tns_mailunread', 0);
let filter = store.get('tns_filter', 'offen');
let currentView = 'anfragen';
let detailId = null;
let lastSync = 0;
let tpls = store.get('tns_tpl', null) || DEFAULT_TPL.map(x => ({ ...x }));

/* ---------- Hilfen ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function euro(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €'; }
function fmt(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'gerade eben'; if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60); if (h < 24) return `vor ${h} Std.`;
  return fmt(iso);
}
function dueInfo(r) {
  if (!r.frist || r.status !== 'offen' && r.status !== 'in Bearbeitung') return null;
  const ms = new Date(r.frist) - Date.now();
  const h = Math.abs(ms) / 3600000;
  const txt = h < 1 ? Math.round(h * 60) + ' Min.' : (h < 48 ? h.toFixed(h < 10 ? 1 : 0).replace('.', ',') + ' Std.' : Math.round(h / 24) + ' Tage');
  if (ms < 0) return { cls: 'late', txt: 'überfällig seit ' + txt };
  return { cls: ms < 2 * 3600000 ? 'soon' : 'ok', txt: 'Frist in ' + txt };
}
function isPaid(r) { return r.status !== 'erstattet' && r.status !== 'Zahlung prüfen' && r.status !== 'Zahlung ausstehend'; }
function stClass(s) { return 'st-' + String(s || 'offen').replace(/\s+/g, '-'); }
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (kind ? ' ' + kind : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}
function gmailThread(id) { return GMAIL + '#all/' + encodeURIComponent(id); }

/* ---------- Schnittstelle (JSONP) ---------- */
function api(params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); };
    window[cb] = data => { done(); resolve(data); };
    s.src = API + '?' + new URLSearchParams({ ...params, admin: '1', key: adminKey, callback: cb });
    s.onerror = () => { done(); reject(new Error('Keine Verbindung')); };
    document.body.appendChild(s);
    setTimeout(() => { if (window[cb]) { done(); reject(new Error('Zeitüberschreitung')); } }, timeoutMs || 25000);
  });
}
function postNoCors(body) {
  return fetch(API, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
}

/* ---------- Anmeldung ---------- */
function showGate(msg) { $('#app').hidden = true; $('#gate').hidden = false; $('#gateError').textContent = msg || ''; }
function showApp() { $('#gate').hidden = true; $('#app').hidden = false; }

$('#gateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const val = $('#keyInput').value.trim(); if (!val) return;
  adminKey = val; $('#gateError').textContent = 'Prüfe …';
  try {
    const res = await api({ action: 'list' });
    if (!res.ok) { adminKey = ''; $('#gateError').textContent = 'Falscher Schlüssel.'; return; }
    store.set('tns_key', val);
    setRows(res.rows); if (typeof res.mailUnread === 'number') { mailUnread = res.mailUnread; store.set('tns_mailunread', mailUnread); }
    showApp(); render(); refreshPushToken();
  } catch (err) { $('#gateError').textContent = 'Fehler: ' + err.message; }
});

$('#logoutBtn').addEventListener('click', () => {
  if (!confirm('Wirklich abmelden? Der Schlüssel wird von diesem Gerät entfernt und Push hier abgeschaltet.')) return;
  const tok = store.get('tns_push_token', '');
  if (tok) { api({ action: 'unregisterPush', token: tok }).catch(() => {}); store.del('tns_push_token'); store.del('tns_push_at'); }
  store.del('tns_key'); store.del('tns_rows'); store.del('tns_inbox');
  try { localStorage.removeItem('tns_admin_key'); } catch (e) {}
  adminKey = ''; rows = []; inbox = null; setBadge(0); showGate();
});

/* ---------- Daten laden ---------- */
function setRows(r) { rows = Array.isArray(r) ? r : []; store.set('tns_rows', rows); lastSync = Date.now(); updateSyncInfo(); }
function updateSyncInfo() { $('#syncInfo').textContent = lastSync ? 'Stand ' + new Date(lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''; }

let loading = false;
async function refresh(silent) {
  if (loading || !adminKey) return; loading = true;
  $('#refreshBtn').classList.add('spin');
  try {
    const res = await api({ action: 'list' });
    if (!res.ok) {
      if (res.error === 'unauthorized') { store.del('tns_key'); adminKey = ''; showGate('Schlüssel ungültig – bitte neu anmelden.'); return; }
      throw new Error(res.error || 'unbekannter Fehler');
    }
    setRows(res.rows);
    if (typeof res.mailUnread === 'number') { mailUnread = res.mailUnread; store.set('tns_mailunread', mailUnread); }
    if (currentView === 'postfach') loadInbox(true);
    render();
    if (!silent) toast('Aktualisiert', 'good');
  } catch (err) { if (!silent) toast('Laden fehlgeschlagen: ' + err.message, 'bad'); }
  finally { loading = false; $('#refreshBtn').classList.remove('spin'); }
}
async function loadInbox(silent) {
  try {
    const res = await api({ action: 'inbox' }, 30000);
    if (!res.ok) throw new Error(res.error || 'Fehler');
    inbox = res.threads || []; store.set('tns_inbox', inbox);
    mailUnread = inbox.filter(t => t.unread).length; renderInbox(); updateBadges();
  } catch (err) {
    if (!silent) $('#inbox').innerHTML = `<div class="empty">Postfach konnte nicht geladen werden (${esc(err.message)}).</div>`;
  }
}

/* ---------- Ansichten ---------- */
function go(view) {
  currentView = view;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view || (view === 'detail' && b.dataset.view === 'anfragen')));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
  if (view === 'postfach') { renderInbox(); loadInbox(); }
  if (view === 'umsatz') renderRevenue();
  if (view === 'mehr') { pushState(); renderTplEditor(); }
  if (view === 'buch') openBuch();
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { if (b.dataset.view === 'anfragen') detailId = null; go(b.dataset.view); render(); }));
$('#refreshBtn').addEventListener('click', () => { refresh(false); if (currentView === 'buch') { const f = $('#buchFrame'); try { f.contentWindow.location.reload(); } catch (e) {} } });

/* ---------- Bereich-Umschalter (oben) + eingebettete Buchhaltung ---------- */
function fillBereichSel() { $('#bereichSel').innerHTML = Object.keys(BEREICHE).map(k => `<option value="${k}" ${k === bereich ? 'selected' : ''}>${BEREICHE[k]}</option>`).join(''); }
function setBereich(k, fromFrame) {
  if (!BEREICHE[k]) k = k === 'allgemein' ? 'alle' : 'alle';
  bereich = k; store.set('z_bereich', k); fillBereichSel(); render();
  if (!fromFrame) { const f = $('#buchFrame'); if (f && f.src) try { f.contentWindow.postMessage({ bereich: k }, location.origin); } catch (e) {} }
}
$('#bereichSel').addEventListener('change', e => setBereich(e.target.value));
function openBuch() {
  const f = $('#buchFrame');
  if (!f.src) f.src = '/buchhaltung/?embed=1&bereich=' + encodeURIComponent(bereich);
  else try { f.contentWindow.postMessage({ bereich }, location.origin); } catch (e) {}
}
window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.bereich && e.data.bereich !== bereich) setBereich(e.data.bereich, true); });
fillBereichSel();
$('#backBtn').addEventListener('click', () => { detailId = null; go('anfragen'); render(); });
$('#search').addEventListener('input', renderList);

/* Detail nicht neu zeichnen, solange dort getippt wird oder Dateien ausgewählt sind (Entwürfe werden ohnehin gespeichert). */
function detailBusy() {
  const a = document.activeElement, f = $('#replyFiles'), box = $('#detail');
  return !!((a && box && box.contains(a) && /^(TEXTAREA|INPUT)$/.test(a.tagName)) || (f && f.files && f.files.length));
}
function render() { updateBadges(); renderSummary(); renderChips(); renderList(); if (detailId && !detailBusy()) renderDetail(); if (currentView === 'umsatz') renderRevenue(); }

/* Übersicht oben: offene Anfragen, nächste Frist, Umsatz heute/Monat */
function renderSummary() {
  const open = vrows().filter(r => r.status === 'offen' || r.status === 'in Bearbeitung');
  const next = open.filter(r => r.frist).sort((a, b) => new Date(a.frist) - new Date(b.frist))[0];
  const d = next ? dueInfo(next) : null;
  const paid = vrows().filter(isPaid);
  const now = new Date(), sum = a => a.reduce((s, r) => s + (parseFloat(r.preis) || 0), 0);
  const today = paid.filter(r => new Date(r.eingang).toDateString() === now.toDateString());
  const month = paid.filter(r => { const x = new Date(r.eingang); return x.getMonth() === now.getMonth() && x.getFullYear() === now.getFullYear(); });
  $('#summary').innerHTML = `
    <div class="s ${open.length ? 'warn' : 'ok'}"><b>${open.length}</b><span>offen</span></div>
    <div class="s ${d ? (d.cls === 'late' ? 'bad' : d.cls === 'soon' ? 'warn' : 'ok') : ''}"><b>${d ? esc(d.txt.replace('Frist in ', '').replace('überfällig seit ', '')) : '–'}</b><span>${d && d.cls === 'late' ? 'Frist überschritten' : 'nächste Frist'}</span></div>
    <div class="s"><b>${euro(sum(today))}</b><span>heute (${today.length})</span></div>
    <div class="s"><b>${euro(sum(month))}</b><span>dieser Monat (${month.length})</span></div>`;
}

/* Entwürfe je Anfrage (wie in der ELUH-App: nichts geht verloren, wenn die App zugeht) */
function getDraft(id) { return store.get('tns_draft_' + id, {}); }
function setDraft(id, patch) {
  const d = Object.assign(getDraft(id), patch);
  Object.keys(d).forEach(k => { if (d[k] === undefined || d[k] === '') delete d[k]; });
  Object.keys(d).length ? store.set('tns_draft_' + id, d) : store.del('tns_draft_' + id);
}
/* ---------- Teile-Liste (Ergebnis der Recherche): Bezeichnung / Teilenummer / Hinweis ---------- */
let curParts = [], curPartsId = null;
const TEIL_VORSCHLAEGE = ['Bremsscheibe vorn links', 'Bremsscheibe vorn rechts', 'Bremsscheibe hinten links', 'Bremsscheibe hinten rechts',
  'Bremsbeläge vorn (Satz)', 'Bremsbeläge hinten (Satz)', 'Abdeckblech Bremsscheibe', 'Querlenker vorn links', 'Querlenker vorn rechts',
  'Koppelstange', 'Spurstangenkopf', 'Stoßdämpfer', 'Radlager', 'Thermostat', 'Wasserpumpe', 'Zahnriemensatz', 'Keilrippenriemen',
  'Ölfilter', 'Luftfilter', 'Innenraumfilter', 'Kraftstofffilter', 'Zündkerze', 'Glühkerze', 'Lambdasonde', 'AGR-Ventil', 'Kühlmittelschlauch'];
function partsParse(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split('|').map(x => x.trim()); return { b: p[0] || '', n: p[1] || '', h: p.slice(2).join(' / ') || '' };
  });
}
function partsText(list) {
  const clean = x => String(x || '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim();
  return list.filter(p => clean(p.b) || clean(p.n) || clean(p.h))
    .map(p => [clean(p.b), clean(p.n), clean(p.h)].join(' | ').replace(/(\s\|\s*)+$/, '')).join('\n');
}
function partsForMail(list) {
  return list.filter(p => (p.b || p.n).trim()).map(p => '• ' + (p.b.trim() ? p.b.trim() + ': ' : '') + (p.n.trim() || '(Nummer folgt)') + (p.h.trim() ? ' – ' + p.h.trim() : '')).join('\n');
}
function loadParts(r) {
  const d = getDraft(r.orderId);
  curPartsId = r.orderId;
  curParts = d.parts === '∅' ? [] : partsParse(d.parts != null ? d.parts : r.ersatzteile);
  if (!curParts.length) curParts = [{ b: '', n: '', h: '' }];
}
function partsChanged(r) { return partsText(curParts) !== String(r.ersatzteile || '').trim(); }
function pdfAktuell(r) { return !!r.pdfLink && !partsChanged(r); }
function savePartsDraft(r) {
  const t = partsText(curParts);
  setDraft(r.orderId, { parts: t === String(r.ersatzteile || '').trim() ? undefined : (t || '∅') });
  updatePdfState(r);
}
function updatePdfState(r) {
  const el = $('#pdfState'); if (!el) return;
  const hasParts = !!partsText(curParts);
  el.className = 'pdf-state' + (pdfAktuell(r) ? ' ok' : '');
  el.innerHTML = pdfAktuell(r)
    ? `✓ PDF ${esc(r.rechnungsnummer || '')} ist aktuell · <a href="${esc(r.pdfLink)}" target="_blank" rel="noopener">ansehen ↗</a>`
    : (r.pdfLink ? '⚠️ Teile geändert – PDF wird beim Senden (mit Häkchen) automatisch aktualisiert' : (hasParts ? 'Noch kein PDF – wird beim Senden (mit Häkchen) automatisch erstellt' : 'Noch keine Teile eingetragen'));
}
function renderParts(r, focus) {
  const box = $('#partsBox'); if (!box) return;
  box.innerHTML = curParts.map((p, i) => `<div class="prow" data-i="${i}">
      <span class="pnum">${i + 1}</span>
      <input class="pb" data-f="b" placeholder="Bezeichnung, z. B. Bremsscheibe vorn links" list="dlTeile" value="${esc(p.b)}" autocomplete="off">
      <input class="pn" data-f="n" placeholder="Teilenummer" value="${esc(p.n)}" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <input class="ph" data-f="h" placeholder="Hinweis (optional)" value="${esc(p.h)}" autocomplete="off">
      <span class="pact"><button type="button" data-dup="${i}" title="Zeile kopieren (z. B. links → rechts)">⧉</button><button type="button" data-del="${i}" title="Zeile löschen">✕</button></span>
    </div>`).join('');
  box.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => { curParts[+inp.closest('.prow').dataset.i][inp.dataset.f] = inp.value; savePartsDraft(r); });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const i = +inp.closest('.prow').dataset.i;
      if (inp.dataset.f !== 'h') { inp.parentElement.querySelector(inp.dataset.f === 'b' ? '.pn' : '.ph').focus(); return; }
      curParts.splice(i + 1, 0, { b: '', n: '', h: '' }); savePartsDraft(r); renderParts(r, [i + 1, 'b']);
    });
  });
  box.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.dup; const c = { ...curParts[i] };
    c.b = c.b.replace(/\blinks\b/, '\u0000').replace(/\brechts\b/, 'links').replace('\u0000', 'rechts'); // links ⇄ rechts
    curParts.splice(i + 1, 0, c); savePartsDraft(r); renderParts(r, [i + 1, 'b']);
  }));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    curParts.splice(+b.dataset.del, 1); if (!curParts.length) curParts = [{ b: '', n: '', h: '' }];
    savePartsDraft(r); renderParts(r);
  }));
  if (focus) { const el = box.querySelector(`.prow[data-i="${focus[0]}"] [data-f="${focus[1]}"]`); if (el) el.focus(); }
  updatePdfState(r);
}
function teileVorschlaege() {
  const set = new Set(TEIL_VORSCHLAEGE);
  rows.forEach(x => partsParse(x.ersatzteile).forEach(p => p.b && set.add(p.b)));
  return [...set].sort((a, b) => a.localeCompare(b, 'de')).map(v => `<option value="${esc(v)}">`).join('');
}

function fillTpl(text, r) {
  const vorname = String(r.name || '').trim().split(/\s+/)[0] || '';
  const teile = partsForMail(curParts) || '• Bezeichnung: Teilenummer';
  const extras = (r.paket === 'express' || r.paket === 'premium')
    ? '\n\nPassend dazu (Dichtungen, Schrauben, Zubehör):\n• \n\nDirekte Links:\n• ' : '';
  return text.replace(/\{teile\}/g, teile).replace(/\{extras\}/g, extras).replace(/\{vorname\}/g, vorname).replace(/\{modell\}/g, r.modell || (HEIZ(r) ? 'Gerät' : 'Fahrzeug')).replace(/\{baujahr\}/g, r.baujahr || '')
    .replace(/\{fin\}/g, r.fin || '').replace(/\{motor\}/g, r.motor || '');
}

function updateBadges() {
  const open = rows.filter(r => r.status === 'offen' || r.status === 'in Bearbeitung').length;
  const b = $('#badgeOpen'); b.hidden = !open; b.textContent = open;
  const m = $('#badgeMail'); m.hidden = !mailUnread; m.textContent = mailUnread;
  setBadge(open + rows.filter(r => r.kundenAntwortUngelesen).length);
  const rep = rows.filter(r => r.kundenAntwortUngelesen).length;
  const bn = $('#replyBanner'); bn.hidden = !rep;
  bn.textContent = rep === 1 ? '🔵 Ein Kunde hat geantwortet – markiert in der Liste.' : `🔵 ${rep} Kunden haben geantwortet – markiert in der Liste.`;
}
function setBadge(n) { try { if ('setAppBadge' in navigator) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) {} }

function renderChips() {
  const count = s => s === 'alle' ? vrows().length : vrows().filter(r => (r.status || 'offen') === s).length;
  const labels = { offen: 'Offen', 'in Bearbeitung': 'In Arbeit', beantwortet: 'Beantwortet', erstattet: 'Erstattet', 'Zahlung prüfen': '⚠️ Zahlung prüfen', alle: 'Alle' };
  const chips = ['offen', 'in Bearbeitung', 'beantwortet', 'erstattet', 'alle'];
  if (count('Zahlung prüfen')) chips.unshift('Zahlung prüfen');
  $('#statusChips').innerHTML = chips.map(s =>
    `<button class="chip${filter === s ? ' active' : ''}" data-f="${esc(s)}">${labels[s]}<b>${count(s)}</b></button>`).join('');
  document.querySelectorAll('#statusChips .chip').forEach(c => c.addEventListener('click', () => { filter = c.dataset.f; store.set('tns_filter', filter); renderChips(); renderList(); }));
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  let list = filter === 'alle' ? vrows().slice() : vrows().filter(r => (r.status || 'offen') === filter);
  if (q) list = list.filter(r => [r.name, r.email, r.fin, r.modell, r.problem, r.orderId].join(' ').toLowerCase().includes(q));
  const offen = s => s === 'offen' || s === 'in Bearbeitung';
  list.sort((a, b) => (offen(a.status) && offen(b.status)) ? new Date(a.frist || 8e15) - new Date(b.frist || 8e15) : new Date(b.eingang) - new Date(a.eingang));
  if (!list.length) { $('#list').innerHTML = `<div class="empty">${vrows().length ? 'Keine Anfragen in dieser Ansicht.' : 'Noch keine Anfragen.'}</div>`; return; }
  $('#list').innerHTML = list.map(r => {
    const d = dueInfo(r);
    return `<button class="item" data-id="${esc(r.orderId)}">
      <div class="row1"><div><div class="name">${r.kundenAntwortUngelesen ? '<span class="dot"></span>' : ''}${esc(r.name || '–')}</div>
      <div class="sub">${svcIcon(r)}${esc(r.modell || '')} ${r.baujahr ? '(' + esc(r.baujahr) + ')' : ''}${HEIZ(r) && r.fin ? ' · ' + esc(r.fin) : ''}</div></div>
      <span class="pill ${stClass(r.status)}">${esc(r.status || 'offen')}</span></div>
      <div class="meta"><span class="pkg">${esc(PAKETE[r.paket] || r.paket || '')} · ${euro(r.preis)}</span>
      ${d ? `<span class="due ${d.cls}">⏱ ${esc(d.txt)}</span>` : `<span class="dim small">${esc(ago(r.eingang))}</span>`}
      ${r.quelle && r.quelle !== 'direkt' ? `<span class="pkg">${esc(r.quelle)}</span>` : ''}</div></button>`;
  }).join('');
  document.querySelectorAll('#list .item').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.id)));
}

function openDetail(id) { detailId = id; go('detail'); renderDetail(); }

function renderDetail() {
  const r = rows.find(x => String(x.orderId) === String(detailId));
  if (!r) { $('#detail').innerHTML = '<div class="empty">Anfrage nicht gefunden.</div>'; return; }
  const d = dueInfo(r);
  const statusBtns = STATI.filter(s => s !== (r.status || 'offen')).map(s =>
    `<button class="btn ghost small" data-st="${esc(s)}">${{ offen: 'Wieder öffnen', 'in Bearbeitung': 'In Bearbeitung', beantwortet: 'Als beantwortet markieren', erstattet: '💸 Als erstattet markieren' }[s]}</button>`).join('');
  $('#detail').innerHTML = `
    <div class="d-head"><div><h2>${esc(r.name || '–')}</h2><div class="dim">${esc(r.modell || '')} ${r.baujahr ? '(' + esc(r.baujahr) + ')' : ''}</div></div>
      <span class="pill ${stClass(r.status)}">${esc(r.status || 'offen')}</span></div>
    ${d ? `<div class="due ${d.cls}" style="margin-top:8px">⏱ ${esc(d.txt)} (bis ${esc(fmt(r.frist))})</div>` : ''}
    ${(r.status || 'offen') === 'offen' ? `<div class="actions"><button class="btn small" data-st="in Bearbeitung">▶ Übernehmen (in Bearbeitung)</button></div>` : ''}
    <div class="tools">
      ${r.fin && svc(r) === 'teilenummer' ? `<button data-pl="${esc(r.fin)}">🔎 Partslink24 (FIN wird kopiert)</button>` : ''}
      ${r.fin && svc(r) === 'teilenummer' ? `<a href="https://www.vindecoderz.com/EN/check-lookup/${encodeURIComponent(r.fin)}" target="_blank" rel="noopener">🧾 FIN entschlüsseln</a>` : ''}
      <a href="https://www.google.com/search?q=${encodeURIComponent((HEIZ(r) ? [r.modell, 'Fehler', r.fin] : [r.modell, r.baujahr, r.motor, String(r.problem || '').slice(0, 80)]).filter(Boolean).join(' '))}" target="_blank" rel="noopener">🌐 Google-Suche</a>
      ${r.telefon ? `<a href="tel:${esc(r.telefon)}">📞 Anrufen</a>` : ''}
    </div>
    <div class="kv">
      <div>Paket<b>${esc(PAKETE[r.paket] || r.paket || '–')} · ${euro(r.preis)}</b></div>
      <div>Eingang<b>${esc(fmt(r.eingang))}</b></div>
      <div class="wide">E-Mail<b><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></b></div>
      <div>Telefon<b>${r.telefon ? `<a href="tel:${esc(r.telefon)}">${esc(r.telefon)}</a>` : '–'}</b></div>
      ${svc(r) !== 'teilenummer' ? `<div class="wide">Bereich<b>${esc(BEREICHE[svc(r)])}</b></div>` : ''}
      <div class="wide">${FELD(r).fin}<b>${esc(r.fin || '–')}${r.fin ? `<button class="copy" data-copy="${esc(r.fin)}">kopieren</button>` : ''}</b></div>
      <div>${FELD(r).motor}<b>${esc(r.motor || '–')}</b></div>
      <div>Quelle<b>${esc(r.quelle || '–')}</b></div>
      <div class="wide">Zahlung<b style="${String(r.zahlungCheck || '').startsWith('ABWEICHUNG') ? 'color:var(--bad)' : ''}">${esc(r.zahlungCheck || '–')}</b></div>
      <div class="wide">PayPal-Order-ID<b>${esc(r.orderId || '–')}</b></div>
      ${r.rechnungsnummer ? `<div>Rechnungsnummer<b>${esc(r.rechnungsnummer)}</b></div>` : ''}
    </div>
    <div class="section-title">${HEIZ(r) ? 'Beschreibung der Störung' : VORL(r) ? 'Bestellung / Widerrufsverzicht' : 'Problem / gesuchtes Teil'}</div>
    <div class="box">${esc(r.problem || '–')}</div>
    <div class="section-title">Fotos</div>
    <div class="photos">${(r.fotos || []).filter(Boolean).map((u, i) => /^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">📷 Foto ${i + 1}</a>` : `<span class="dim small">${esc(u)}</span>`).join('') || '<span class="dim small">keine</span>'}</div>
    ${r.antwort ? `<div class="section-title">Letzte Antwort (${esc(fmt(r.antwortDatum))})</div><div class="box">${esc(r.antwort)}</div>` : ''}
    ${r.threadId ? `<a class="mail-link${r.kundenAntwortUngelesen ? ' unread' : ''}" href="${gmailThread(r.threadId)}" target="_blank" rel="noopener">${r.kundenAntwortUngelesen ? '🔵 Neue Antwort vom Kunden – in Gmail öffnen ↗' : '📧 Mail-Verlauf in Gmail öffnen ↗'}</a>` : ''}

    <div class="section-title">${FELD(r).teile}</div>
    <div class="card">
      <datalist id="dlTeile">${teileVorschlaege()}</datalist>
      <div class="parts" id="partsBox"></div>
      <div class="actions">
        <button class="btn ghost small" id="addPart">+ Teil</button>
        <button class="btn ghost small" id="partsToReply">📝 In Antwort übernehmen</button>
        <button class="btn ghost small" id="genPdf">📄 PDF jetzt erstellen</button>
      </div>
      <div class="dim small" style="margin-top:8px">Tipp: Enter springt ins nächste Feld bzw. legt eine neue Zeile an · ⧉ kopiert eine Zeile und tauscht links/rechts.</div>
    </div>

    <div class="section-title">② Antworten</div>
    <div class="card">
      <div class="tpls">${tplsFor(r).map((t, i) => `<button class="chip" data-tpl="${i}">${esc(t.t)}</button>`).join('')}</div>
      <textarea id="replyText" placeholder="Nur den Inhalt eintippen – „Hallo …“, Bezug zur Anfrage und Grußformel ergänzt das System automatisch (siehe Vorschau).">${esc(getDraft(r.orderId).reply || '')}</textarea>
      <div class="draft-note" id="draftNote">${getDraft(r.orderId).reply ? '💾 Entwurf gespeichert' : ''}</div>
      <label class="check"><input type="checkbox" id="attachPdf" ${attachDefault(r) ? 'checked' : ''}> 📎 Rechnung als PDF anhängen</label>
      <div class="pdf-state" id="pdfState"></div>
      <div class="file">Weitere PDF(s) anhängen: <input type="file" id="replyFiles" accept="application/pdf" multiple></div>
      <div class="dim small" id="attList"></div>
      <div class="actions"><button class="btn ghost small" id="previewBtn">👁 Vorschau der Mail</button></div>
      <div class="box mail-preview" id="mailPreview" hidden></div>
      <button class="btn" id="sendReply" style="margin-top:10px">✉️ Antwort senden</button>
    </div>

    <div class="section-title">Status</div>
    <div class="actions">${statusBtns}</div>`;

  document.querySelectorAll('#detail [data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Kopiert', 'good'); } catch (e) { toast('Kopieren nicht möglich', 'bad'); }
  }));
  document.querySelectorAll('#detail [data-st]').forEach(b => b.addEventListener('click', () => setStatus(r, b.dataset.st, b)));
  $('#sendReply').addEventListener('click', e => sendReply(r, e.currentTarget));
  $('#genPdf').addEventListener('click', e => genPdf(r, e.currentTarget));
  loadParts(r); renderParts(r);
  $('#addPart').addEventListener('click', () => { curParts.push({ b: '', n: '', h: '' }); savePartsDraft(r); renderParts(r, [curParts.length - 1, 'b']); });
  $('#partsToReply').addEventListener('click', () => {
    const list = partsForMail(curParts); if (!list) return toast('Erst mindestens ein Teil eintragen.', 'bad');
    const ta = $('#replyText');
    insertIntoReply(ta, ta.value.trim() ? list : fillTpl(tpls.find(t => /\{teile\}/.test(t.x))?.x || '{teile}', r));
  });
  $('#replyFiles').addEventListener('change', e => { if (e.target.files.length) { $('#attachPdf').checked = true; setDraft(r.orderId, { attach: '1' }); } });
  $('#attachPdf').addEventListener('change', e => setDraft(r.orderId, { attach: e.target.checked ? '1' : '0' }));
  $('#previewBtn').addEventListener('click', () => {
    const box = $('#mailPreview'), t = $('#replyText').value.trim();
    if (!t) return toast('Erst Text eintippen.', 'bad');
    box.hidden = false;
    box.textContent = 'An: ' + r.email + '\n' + ($('#attachPdf').checked ? '📎 Rechnung als PDF\n' : '') + '──────────\n' + mailPreview(r, t);
  });
  loadAttachments(r);
  $('#replyText').addEventListener('input', e => { setDraft(r.orderId, { reply: e.target.value }); $('#draftNote').textContent = e.target.value.trim() ? '💾 Entwurf gespeichert' : ''; });
  document.querySelectorAll('#detail [data-tpl]').forEach(b => b.addEventListener('click', () => {
    const t = tplsFor(r)[+b.dataset.tpl]; if (!t) return;
    insertIntoReply($('#replyText'), fillTpl(t.x, r));
  }));
  document.querySelectorAll('#detail [data-pl]').forEach(b => b.addEventListener('click', () => {
    try { navigator.clipboard.writeText(b.dataset.pl).then(() => toast('FIN kopiert – in Partslink24 einfügen', 'good'), () => {}); } catch (e) {}
    window.open('https://www.partslink24.com/', '_blank', 'noopener');
  }));
}

async function setStatus(r, status, btn) {
  if (status === 'erstattet' && !confirm('Als erstattet markieren?\n\nBitte die Rückerstattung vorher in PayPal auslösen – das hier ist nur die Notiz im System, es wird kein Geld überwiesen.')) return;
  btn.disabled = true;
  try {
    const res = await api({ action: 'markStatus', orderId: r.orderId, status });
    if (!res.ok) throw new Error(res.error);
    r.status = status; store.set('tns_rows', rows); render(); toast('Status: ' + status, 'good');
  } catch (err) { btn.disabled = false; toast('Fehler: ' + err.message, 'bad'); }
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Datei nicht lesbar')); fr.readAsDataURL(file); });
}
/* Leere Stellen aus Textbausteinen finden (z. B. "Grund:" ohne Text, leere Aufzählungspunkte). */
function findLuecken(text) {
  const lines = text.split('\n'), out = [];
  const kurz = x => x.trim().split(/(?<=[.!?])\s+/).pop().slice(0, 45);
  lines.forEach((l, i) => {
    const t = l.trim();
    if (/^(•|-|\d+\))$/.test(t)) { out.push('leerer Aufzählungspunkt unter „' + kurz(lines.slice(0, i).reverse().find(x => x.trim()) || '') + '“'); return; }
    if (/:$/.test(t)) {
      const next = lines.slice(i + 1).find(x => x.trim());
      if (!next || !/^\s*(•|-|\d+\)|>)/.test(next)) out.push('„' + kurz(t) + '“ ohne Inhalt');
    }
    if (/\{[a-z]+\}|Bezeichnung: Teilenummer/.test(t)) out.push('Platzhalter „' + t.slice(0, 40) + '“');
  });
  return [...new Set(out)];
}
function attachDefault(r) {
  const d = getDraft(r.orderId).attach;
  if (d === '1' || d === '0') return d === '1';
  return (r.status || 'offen') === 'offen' || r.status === 'in Bearbeitung';
}
/* Gleiche Logik wie buildEmailBody_ in Code.gs (bei Änderungen beide anpassen). */
function mailPreview(r, text) {
  const vorname = String(r.name || '').trim().split(/\s+/)[0] || '';
  const first = !r.threadId;
  const hatAnrede = /^(hallo|hi|hey|moin|servus|guten (tag|morgen|abend)|sehr geehrte)/i.test(text);
  const hatGruss = /(grüße|gruß|grüsse|gruss|ciao|bis bald)[^\n]*(\n[^\n]*){0,3}$/i.test(text);
  let out = '';
  if (!hatAnrede) {
    out += 'Hallo ' + vorname + ',\n\n';
    if (first) out += 'danke für deine Anfrage zu deinem ' + (r.modell || 'Fahrzeug') + (r.baujahr ? ' (' + r.baujahr + ')' : '') + '!\n\n';
  }
  out += text;
  if (first) out += '\n\nFalls noch etwas unklar ist, antworte einfach auf diese E-Mail.';
  if (!hatGruss) out += '\n\nViele Grüße\nDominic\nTeilenummer.Service';
  return out;
}
async function loadAttachments(r) {
  const el = $('#attList'); if (!el) return;
  try {
    const res = await api({ action: 'attachments', orderId: r.orderId }, 30000);
    if (!res.ok || String(detailId) !== String(r.orderId) || !$('#attList')) return;
    const other = (res.files || []).filter(n => !/^Rechnung-/.test(n));
    $('#attList').textContent = other.length ? '📎 Bereits hochgeladen, geht mit Häkchen mit: ' + other.join(', ') : '';
  } catch (e) {}
}
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
let pendingSend = null; // { key, sendId, uploaded } – damit ein Wiederholen nach Zeitüberschreitung nicht doppelt sendet

function insertIntoReply(ta, ins) {
  const pos = ta.selectionStart ?? ta.value.length;
  ta.value = ta.value ? ta.value.slice(0, pos) + (pos && ta.value[pos - 1] !== '\n' ? '\n\n' : '') + ins + ta.value.slice(ta.selectionEnd ?? pos) : ins;
  ta.dispatchEvent(new Event('input')); ta.focus();
}
async function sendReply(r, btn) {
  const text = $('#replyText').value.trim();
  if (!text) return toast('Bitte erst eine Antwort eintippen.', 'bad');
  if (text.length > 20000) return toast('Antwort zu lang – längere Teile bitte als PDF anhängen.', 'bad');
  const files = Array.from($('#replyFiles').files || []);
  const attach = $('#attachPdf').checked;
  const needPdf = attach && partsText(curParts) && !pdfAktuell(r);
  if (attach && !partsText(curParts) && !r.pdfLink && !files.length) return toast('Für die Rechnung erst Teile eintragen – oder das Häkchen „Rechnung anhängen“ entfernen.', 'bad');
  const luecken = findLuecken(text);
  if (luecken.length && !confirm('In der Antwort ist noch etwas nicht ausgefüllt:\n\n• ' + luecken.join('\n• ') + '\n\nTrotzdem so senden?')) return;
  if (!confirm(`Antwort an ${r.email} senden?` + (attach ? '\n\n📎 Mit Rechnung als PDF' + (needPdf ? ' (wird jetzt erstellt)' : '') : '\n\nOhne Anhang'))) return;
  btn.disabled = true; btn.textContent = needPdf ? 'Erstelle PDF …' : 'Sende …';
  try {
    const key = r.orderId + '|' + text + '|' + attach + '|' + files.map(f => f.name + f.size).join(',');
    if (!pendingSend || pendingSend.key !== key) pendingSend = { key, sendId: rid(), uploaded: false };
    const stashId = rid();
    await postNoCors({ kind: 'admin_stash', adminKey, stashId, text, ersatzteile: partsText(curParts) });
    if (needPdf) {
      const pr = await api({ action: 'generatePdf', orderId: r.orderId, stashId }, 60000);
      if (!pr.ok) throw new Error('PDF: ' + (pr.error || 'Fehler'));
      setDraft(r.orderId, { parts: undefined }); r.ersatzteile = partsText(curParts); r.pdfLink = pr.url; r.rechnungsnummer = pr.invoiceNumber;
      btn.textContent = 'Sende …';
    }
    if (attach && files.length && !pendingSend.uploaded) {
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) throw new Error(f.name + ' ist zu groß (max. 15 MB)');
        await postNoCors({ kind: 'admin_attachment', adminKey, orderId: r.orderId, filename: f.name, mimeType: 'application/pdf', dataUrl: await fileToDataUrl(f) });
      }
      const chk = await api({ action: 'attachments', orderId: r.orderId }, 30000);
      const missing = files.filter(f => !(chk.files || []).includes(f.name));
      if (missing.length) throw new Error('Anhang nicht angekommen: ' + missing.map(f => f.name).join(', '));
      pendingSend.uploaded = true;
    }
    let res;
    try {
      res = await api({ action: 'reply', orderId: r.orderId, email: r.email, name: r.name, stashId, sendId: pendingSend.sendId, attach: attach ? '1' : '0' }, 60000);
    } catch (netErr) {
      throw new Error('keine Rückmeldung vom Server (' + netErr.message + '). Die Mail ist evtl. trotzdem raus – nochmal „Senden“ ist sicher, sie geht nicht doppelt.');
    }
    if (!res.ok) throw new Error(res.error);
    pendingSend = null;
    toast(res.info === 'bereits gesendet' ? 'War schon gesendet ✓' : 'Antwort gesendet ✓', 'good');
    $('#replyText').value = ''; setDraft(r.orderId, { reply: undefined, attach: undefined }); $('#replyFiles').value = '';
    await refresh(true); renderDetail();
    if (/erstatt/i.test(text) && r.status !== 'erstattet' && confirm('Die Antwort erwähnt eine Erstattung.\n\nPayPal jetzt öffnen, um das Geld zurückzuzahlen? (Danach in der App „Als erstattet markieren“.)')) {
      window.open('https://www.paypal.com/activities', '_blank', 'noopener');
    }
  } catch (err) { toast('Senden fehlgeschlagen: ' + err.message, 'bad'); btn.disabled = false; btn.textContent = '✉️ Antwort senden'; }
}
async function genPdf(r, btn) {
  btn.disabled = true; const o = btn.textContent; btn.textContent = 'Erstelle …';
  try {
    const t = partsText(curParts);
    if (!t) throw new Error('Erst mindestens ein Teil eintragen.');
    const stashId = rid();
    await postNoCors({ kind: 'admin_stash', adminKey, stashId, text: '', ersatzteile: t });
    const res = await api({ action: 'generatePdf', orderId: r.orderId, stashId }, 60000);
    if (!res.ok) throw new Error(res.error);
    setDraft(r.orderId, { parts: undefined }); r.ersatzteile = t; r.pdfLink = res.url; r.rechnungsnummer = res.invoiceNumber; updatePdfState(r);
    toast('PDF erstellt (Nr. ' + res.invoiceNumber + ')', 'good'); if (document.activeElement) document.activeElement.blur(); await refresh(true); renderDetail();
  } catch (err) { toast('Fehler: ' + err.message, 'bad'); }
  finally { btn.disabled = false; btn.textContent = o; }
}

/* ---------- Postfach ---------- */
function renderInbox() {
  if (!inbox) { $('#inbox').innerHTML = '<div class="empty">Wird geladen …</div>'; return; }
  if (!inbox.length) { $('#inbox').innerHTML = '<div class="empty">Posteingang ist leer.</div>'; return; }
  $('#inbox').innerHTML = inbox.map(t => `<a class="mail${t.unread ? ' unread' : ''}" href="${gmailThread(t.id)}" target="_blank" rel="noopener">
    <div class="from">${esc(String(t.from || '').replace(/<.*>/, '').trim() || t.from)}<span>${esc(ago(t.date))}</span></div>
    <div class="subj">${esc(t.subject || '(kein Betreff)')}${t.count > 1 ? ` <span class="dim">(${t.count})</span>` : ''}</div>
    <div class="snip">${esc(t.snippet || '')}</div></a>`).join('');
}

/* ---------- Umsatz ---------- */
function renderRevenue() {
  const paid = vrows().filter(isPaid);
  const sum = a => a.reduce((s, r) => s + (parseFloat(r.preis) || 0), 0);
  const now = new Date();
  const thisMonth = paid.filter(r => { const d = new Date(r.eingang); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const last30 = paid.filter(r => Date.now() - new Date(r.eingang) < 30 * 864e5);
  const refunded = vrows().filter(r => r.status === 'erstattet');
  const group = key => { const m = {}; paid.forEach(r => { const k = (key === 'paket' ? (PAKETE[r.paket] || r.paket) : (r.quelle || 'direkt')) || '–'; m[k] = m[k] || { n: 0, s: 0 }; m[k].n++; m[k].s += parseFloat(r.preis) || 0; }); return m; };
  const bars = m => { const max = Math.max(1, ...Object.values(m).map(x => x.s)); return Object.entries(m).sort((a, b) => b[1].s - a[1].s).map(([k, v]) =>
    `<div class="bar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(v.s / max * 100).toFixed(1)}%"></div></div><span class="val">${v.n}× · ${euro(v.s)}</span></div>`).join('') || '<div class="dim small">noch keine Daten</div>'; };
  $('#revenue').innerHTML = `
    <div class="stats">
      <div class="stat"><div class="v">${euro(sum(paid))}</div><div class="l">Umsatz gesamt (ohne Erstattungen)</div></div>
      <div class="stat"><div class="v">${euro(sum(thisMonth))}</div><div class="l">dieser Monat (${thisMonth.length})</div></div>
      <div class="stat"><div class="v">${euro(sum(last30))}</div><div class="l">letzte 30 Tage (${last30.length})</div></div>
      <div class="stat"><div class="v">${refunded.length} / ${euro(sum(refunded))}</div><div class="l">erstattet</div></div>
    </div>
    <div class="card"><h3>Nach Paket</h3><div class="bars">${bars(group('paket'))}</div></div>
    <div class="card"><h3>Nach Herkunft (Werbung)</h3><div class="bars">${bars(group('quelle'))}</div>
      <p class="dim small">„google-ads“ = kam über eine Google-Anzeige, „direkt“ = ohne erkennbare Quelle.</p></div>
    <p class="dim small">${esc(BEREICHE[bereich])} · Umsatz ohne Gebühren (PayPal) und als Kleinunternehmer ohne Umsatzsteuer. Gewinn und Ausgaben siehst du unter 🧾 Buchhaltung.</p>`;
}

/* ---------- Push-Benachrichtigungen (Firebase Cloud Messaging) ---------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function deviceName() {
  const u = navigator.userAgent;
  const dev = /iPhone/.test(u) ? 'iPhone' : (/iPad/.test(u) || (isIOS && /Mac/.test(u))) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Gerät';
  const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : '';
  return dev + (br ? ' · ' + br : '') + (isStandalone ? ' (App)' : '');
}
function pushState() {
  const info = $('#pushInfo'), btn = $('#pushBtn'), tok = store.get('tns_push_token', '');
  $('#pushTestBtn').hidden = $('#pushOffBtn').hidden = !tok;
  btn.disabled = false; btn.textContent = '🔔 Auf diesem Gerät aktivieren';
  if (!pushSupported) {
    info.textContent = isIOS && !isStandalone
      ? 'Auf iPhone/iPad gibt es Push nur in der installierten App: in Safari → Teilen → „Zum Home-Bildschirm“, dann die App über das Symbol öffnen und hier aktivieren.'
      : 'Dieser Browser unterstützt keine Push-Nachrichten.';
    btn.disabled = true; return;
  }
  if (Notification.permission === 'denied') { info.textContent = '⛔ Benachrichtigungen sind für diese Seite blockiert – bitte in den Browser- bzw. Systemeinstellungen erlauben.'; return; }
  if (tok && Notification.permission === 'granted') { info.textContent = '✅ Aktiv auf diesem Gerät (' + deviceName() + ').'; btn.textContent = 'Neu verbinden'; }
  else info.textContent = '';
}
async function getFcmToken() {
  const res = await api({ action: 'pushConfig' }, 30000);
  if (!res.ok) throw new Error(res.error || 'Konfiguration nicht ladbar');
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const fa = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`);
  const fm = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-messaging.js`);
  const app = fa.getApps().length ? fa.getApp() : fa.initializeApp(res.config);
  return fm.getToken(fm.getMessaging(app), { serviceWorkerRegistration: reg });
}
async function registerToken(token) {
  const r = await api({ action: 'registerPush', token, device: deviceName() });
  if (!r.ok) throw new Error(r.error || 'Anmeldung fehlgeschlagen');
  store.set('tns_push_token', token); store.set('tns_push_at', Date.now());
}
$('#pushBtn').addEventListener('click', async e => {
  const btn = e.currentTarget;
  try {
    const perm = await Notification.requestPermission(); // muss direkt im Klick passieren (iPhone)
    if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt');
    btn.disabled = true; btn.textContent = 'Verbinde …';
    const token = await getFcmToken();
    if (!token) throw new Error('kein Push-Token erhalten');
    await registerToken(token);
    toast('Push aktiv ✓ – Testnachricht ist unterwegs', 'good');
    api({ action: 'testPush', token }).catch(() => {});
  } catch (err) { toast('Push fehlgeschlagen: ' + err.message, 'bad'); }
  finally { pushState(); }
});
$('#pushTestBtn').addEventListener('click', async () => {
  try {
    const r = await api({ action: 'testPush', token: store.get('tns_push_token', '') }, 30000);
    r.ok ? toast('Test gesendet ✓', 'good') : toast('Test fehlgeschlagen: ' + (r.error || ''), 'bad');
  } catch (err) { toast('Fehler: ' + err.message, 'bad'); }
});
$('#pushOffBtn').addEventListener('click', async () => {
  const tok = store.get('tns_push_token', '');
  try { await api({ action: 'unregisterPush', token: tok }); } catch (e) {}
  store.del('tns_push_token'); store.del('tns_push_at'); pushState(); toast('Push auf diesem Gerät deaktiviert');
});
// Token wöchentlich auffrischen (Firebase kann ihn erneuern)
async function refreshPushToken() {
  const tok = store.get('tns_push_token', '');
  if (!tok || !pushSupported || Notification.permission !== 'granted') return;
  if (Date.now() - store.get('tns_push_at', 0) < 7 * 864e5) return;
  try { const t = await getFcmToken(); if (t) { if (t !== tok) api({ action: 'unregisterPush', token: tok }).catch(() => {}); await registerToken(t); } } catch (e) {}
}

/* ---------- Textbausteine verwalten ---------- */
function saveTpls() { store.set('tns_tpl', tpls); }
function renderTplEditor() {
  $('#tplList').innerHTML = tpls.map((t, i) => `<div class="tpl-item"><input data-i="${i}" data-k="t" value="${esc(t.t)}" aria-label="Titel">
    <textarea data-i="${i}" data-k="x" aria-label="Text">${esc(t.x)}</textarea><button class="del" data-del="${i}">Löschen</button></div>`).join('')
    || '<p class="dim small">Keine Textbausteine.</p>';
  document.querySelectorAll('#tplList [data-k]').forEach(el => el.addEventListener('input', () => { tpls[+el.dataset.i][el.dataset.k] = el.value; saveTpls(); }));
  document.querySelectorAll('#tplList [data-del]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('Textbaustein „' + tpls[+b.dataset.del].t + '“ löschen?')) return;
    tpls.splice(+b.dataset.del, 1); saveTpls(); renderTplEditor();
  }));
}
$('#tplAdd').addEventListener('click', () => { tpls.push({ t: 'Neuer Baustein', x: '' }); saveTpls(); renderTplEditor(); const ins = document.querySelectorAll('#tplList input'); ins[ins.length - 1].select(); });
$('#tplReset').addEventListener('click', () => { if (!confirm('Alle Textbausteine auf den Standard zurücksetzen?')) return; tpls = DEFAULT_TPL.map(x => ({ ...x })); saveTpls(); renderTplEditor(); });

/* ---------- Direktsprung aus Push-Nachrichten (#a=<Order-ID>, #postfach) ---------- */
function handleRoute(h) {
  h = h || location.hash;
  if (!h || !adminKey) return;
  if (h.indexOf('#a=') === 0) openDetail(decodeURIComponent(h.slice(3)));
  else if (h === '#postfach') { detailId = null; go('postfach'); }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
}
window.addEventListener('hashchange', () => handleRoute());
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'refresh') refresh(true);
  if (m.type === 'open') { handleRoute(m.url); refresh(true); }
});

/* ---------- Installation & Service Worker ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true; });
if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }
$('#appVersion').textContent = APP_VERSION;

/* ---------- Automatisch aktualisieren ---------- */
setInterval(() => { if (document.visibilityState === 'visible' && adminKey) refresh(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && adminKey && Date.now() - lastSync > 20000) refresh(true); });
setInterval(() => { if (currentView === 'anfragen') renderList(); else if (currentView === 'detail' && !detailBusy()) renderDetail(); }, 60000);

/* ---------- Start ---------- */
if (adminKey) {
  showApp(); render(); handleRoute();
  refresh(true).then(() => { if (!lastSync) toast('Offline – zeige zuletzt geladenen Stand', 'bad'); refreshPushToken(); });
} else { showGate(); }
