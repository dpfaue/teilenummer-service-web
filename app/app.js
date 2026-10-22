/* Teilenummer.Service – Verwaltungs-App (PWA)
   Spricht dieselbe Apps-Script-Schnittstelle an wie admin.html (JSONP, geschützt per Admin-Schlüssel). */
'use strict';
const APP_VERSION = '1.0.0 (22.10.2026)';
const API = 'https://script.google.com/macros/s/AKfycbz5uEEaTn5Pe-ec-33u-pvSRlJCKSAYdsRV3CgDyBfdfGwoHiEGjb46DXZIARyjO293aA/exec';
const GMAIL = 'https://mail.google.com/mail/?authuser=teilenummer.service@gmail.com';
const PAKETE = { basis: 'Basis', express: 'Express', premium: 'Premium' };
const STATI = ['offen', 'in Bearbeitung', 'beantwortet', 'erstattet'];

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

let adminKey = store.get('tns_key', '') || (function () { try { return localStorage.getItem('tns_admin_key') || ''; } catch (e) { return ''; } })();
let rows = store.get('tns_rows', []);
let inbox = store.get('tns_inbox', null);
let filter = store.get('tns_filter', 'offen');
let currentView = 'anfragen';
let detailId = null;
let lastSync = 0;

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
    setRows(res.rows); showApp(); render();
  } catch (err) { $('#gateError').textContent = 'Fehler: ' + err.message; }
});

$('#logoutBtn').addEventListener('click', () => {
  if (!confirm('Wirklich abmelden? Der Schlüssel wird von diesem Gerät entfernt.')) return;
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
    if (currentView === 'postfach' || inbox) loadInbox(true);
    render();
    if (!silent) toast('Aktualisiert', 'good');
  } catch (err) { if (!silent) toast('Laden fehlgeschlagen: ' + err.message, 'bad'); }
  finally { loading = false; $('#refreshBtn').classList.remove('spin'); }
}
async function loadInbox(silent) {
  try {
    const res = await api({ action: 'inbox' }, 30000);
    if (!res.ok) throw new Error(res.error || 'Fehler');
    inbox = res.threads || []; store.set('tns_inbox', inbox); renderInbox(); updateBadges();
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
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { if (b.dataset.view === 'anfragen') detailId = null; go(b.dataset.view); render(); }));
$('#refreshBtn').addEventListener('click', () => refresh(false));
$('#backBtn').addEventListener('click', () => { detailId = null; go('anfragen'); render(); });
$('#search').addEventListener('input', renderList);

function detailBusy() {
  const t = $('#replyText'), p = $('#parts');
  const a = document.activeElement;
  return !!((t && t.value.trim()) || (a && (a === t || a === p)) || (p && p.dataset.dirty));
}
function render() { updateBadges(); renderChips(); renderList(); if (detailId && !detailBusy()) renderDetail(); if (currentView === 'umsatz') renderRevenue(); }

function updateBadges() {
  const open = rows.filter(r => r.status === 'offen').length;
  const b = $('#badgeOpen'); b.hidden = !open; b.textContent = open;
  const unreadMail = (inbox || []).filter(t => t.unread).length;
  const m = $('#badgeMail'); m.hidden = !unreadMail; m.textContent = unreadMail;
  setBadge(open + rows.filter(r => r.kundenAntwortUngelesen).length);
  const rep = rows.filter(r => r.kundenAntwortUngelesen).length;
  const bn = $('#replyBanner'); bn.hidden = !rep;
  bn.textContent = rep === 1 ? '🔵 Ein Kunde hat geantwortet – markiert in der Liste.' : `🔵 ${rep} Kunden haben geantwortet – markiert in der Liste.`;
}
function setBadge(n) { try { if ('setAppBadge' in navigator) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch (e) {} }

function renderChips() {
  const count = s => s === 'alle' ? rows.length : rows.filter(r => (r.status || 'offen') === s).length;
  const labels = { offen: 'Offen', 'in Bearbeitung': 'In Arbeit', beantwortet: 'Beantwortet', erstattet: 'Erstattet', alle: 'Alle' };
  $('#statusChips').innerHTML = ['offen', 'in Bearbeitung', 'beantwortet', 'erstattet', 'alle'].map(s =>
    `<button class="chip${filter === s ? ' active' : ''}" data-f="${esc(s)}">${labels[s]}<b>${count(s)}</b></button>`).join('');
  document.querySelectorAll('#statusChips .chip').forEach(c => c.addEventListener('click', () => { filter = c.dataset.f; store.set('tns_filter', filter); renderChips(); renderList(); }));
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  let list = filter === 'alle' ? rows.slice() : rows.filter(r => (r.status || 'offen') === filter);
  if (q) list = list.filter(r => [r.name, r.email, r.fin, r.modell, r.problem, r.orderId].join(' ').toLowerCase().includes(q));
  const offen = s => s === 'offen' || s === 'in Bearbeitung';
  list.sort((a, b) => (offen(a.status) && offen(b.status)) ? new Date(a.frist || 8e15) - new Date(b.frist || 8e15) : new Date(b.eingang) - new Date(a.eingang));
  if (!list.length) { $('#list').innerHTML = `<div class="empty">${rows.length ? 'Keine Anfragen in dieser Ansicht.' : 'Noch keine Anfragen.'}</div>`; return; }
  $('#list').innerHTML = list.map(r => {
    const d = dueInfo(r);
    return `<button class="item" data-id="${esc(r.orderId)}">
      <div class="row1"><div><div class="name">${r.kundenAntwortUngelesen ? '<span class="dot"></span>' : ''}${esc(r.name || '–')}</div>
      <div class="sub">${esc(r.modell || '')} ${r.baujahr ? '(' + esc(r.baujahr) + ')' : ''}</div></div>
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
    <div class="kv">
      <div>Paket<b>${esc(PAKETE[r.paket] || r.paket || '–')} · ${euro(r.preis)}</b></div>
      <div>Eingang<b>${esc(fmt(r.eingang))}</b></div>
      <div>E-Mail<b><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></b></div>
      <div>Telefon<b>${r.telefon ? `<a href="tel:${esc(r.telefon)}">${esc(r.telefon)}</a>` : '–'}</b></div>
      <div>FIN<b>${esc(r.fin || '–')}${r.fin ? `<button class="copy" data-copy="${esc(r.fin)}">kopieren</button>` : ''}</b></div>
      <div>Motor<b>${esc(r.motor || '–')}</b></div>
      <div>Quelle<b>${esc(r.quelle || '–')}</b></div>
      <div>Zahlung<b style="${String(r.zahlungCheck || '').startsWith('ABWEICHUNG') ? 'color:var(--bad)' : ''}">${esc(r.zahlungCheck || '–')}</b></div>
      <div>PayPal-Order-ID<b>${esc(r.orderId || '–')}</b></div>
      ${r.rechnungsnummer ? `<div>Rechnungsnummer<b>${esc(r.rechnungsnummer)}</b></div>` : ''}
    </div>
    <div class="section-title">Problem / gesuchtes Teil</div>
    <div class="box">${esc(r.problem || '–')}</div>
    <div class="section-title">Fotos</div>
    <div class="photos">${(r.fotos || []).filter(Boolean).map((u, i) => /^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">📷 Foto ${i + 1}</a>` : `<span class="dim small">${esc(u)}</span>`).join('') || '<span class="dim small">keine</span>'}</div>
    ${r.antwort ? `<div class="section-title">Letzte Antwort (${esc(fmt(r.antwortDatum))})</div><div class="box">${esc(r.antwort)}</div>` : ''}
    ${r.threadId ? `<a class="mail-link${r.kundenAntwortUngelesen ? ' unread' : ''}" href="${gmailThread(r.threadId)}" target="_blank" rel="noopener">${r.kundenAntwortUngelesen ? '🔵 Neue Antwort vom Kunden – in Gmail öffnen ↗' : '📧 Mail-Verlauf in Gmail öffnen ↗'}</a>` : ''}

    <div class="section-title">Antworten</div>
    <div class="card">
      <textarea id="replyText" placeholder="Nur deine Einschätzung eintippen – Anrede, Fahrzeugbezug und Grußformel werden bei der ersten Antwort automatisch ergänzt."></textarea>
      <div class="file">Optional PDF(s) anhängen: <input type="file" id="replyFiles" accept="application/pdf" multiple></div>
      <button class="btn" id="sendReply">✉️ Antwort senden</button>
    </div>

    <div class="section-title">Rechnung / Auskunfts-PDF</div>
    <div class="card">
      <div class="dim small" style="margin-bottom:6px">Eine Zeile pro Teil: <code>Bezeichnung | Teilenummer | Hinweis</code></div>
      <textarea id="parts" style="min-height:90px">${esc(r.ersatzteile || '')}</textarea>
      <div class="actions"><button class="btn ghost small" id="genPdf">📄 PDF erstellen/aktualisieren</button>
      ${r.pdfLink ? `<a class="btn ghost small" style="text-decoration:none" href="${esc(r.pdfLink)}" target="_blank" rel="noopener">PDF ansehen ↗</a>` : ''}</div>
      ${r.rechnungsnummer ? `<div class="dim small" style="margin-top:8px">Wird automatisch an die nächste Antwort-Mail angehängt.</div>` : ''}
    </div>

    <div class="section-title">Status</div>
    <div class="actions">${statusBtns}</div>`;

  document.querySelectorAll('#detail [data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Kopiert', 'good'); } catch (e) { toast('Kopieren nicht möglich', 'bad'); }
  }));
  document.querySelectorAll('#detail [data-st]').forEach(b => b.addEventListener('click', () => setStatus(r, b.dataset.st, b)));
  $('#sendReply').addEventListener('click', e => sendReply(r, e.currentTarget));
  $('#genPdf').addEventListener('click', e => genPdf(r, e.currentTarget));
  $('#parts').addEventListener('input', e => { e.target.dataset.dirty = '1'; });
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
async function sendReply(r, btn) {
  const text = $('#replyText').value.trim();
  if (!text) return toast('Bitte erst eine Antwort eintippen.', 'bad');
  if (text.length > 6000) return toast('Antwort zu lang (max. ca. 6000 Zeichen) – längere Teile bitte als PDF anhängen.', 'bad');
  const files = Array.from($('#replyFiles').files || []);
  if (!confirm(`Antwort an ${r.email} senden?`)) return;
  btn.disabled = true; btn.textContent = 'Sende …';
  try {
    for (const f of files) {
      await postNoCors({ kind: 'admin_attachment', adminKey, orderId: r.orderId, filename: f.name, mimeType: f.type || 'application/pdf', dataUrl: await fileToDataUrl(f) });
    }
    const res = await api({ action: 'reply', orderId: r.orderId, email: r.email, name: r.name, text }, 45000);
    if (!res.ok) throw new Error(res.error);
    toast('Antwort gesendet ✓', 'good'); $('#replyText').value = ''; await refresh(true); renderDetail();
  } catch (err) { toast('Senden fehlgeschlagen: ' + err.message, 'bad'); btn.disabled = false; btn.textContent = '✉️ Antwort senden'; }
}
async function genPdf(r, btn) {
  btn.disabled = true; const o = btn.textContent; btn.textContent = 'Erstelle …';
  try {
    const res = await api({ action: 'generatePdf', orderId: r.orderId, ersatzteile: $('#parts').value }, 45000);
    if (!res.ok) throw new Error(res.error);
    toast('PDF erstellt (Nr. ' + res.invoiceNumber + ')', 'good'); delete $('#parts').dataset.dirty; await refresh(true); renderDetail();
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
  const paid = rows.filter(r => r.status !== 'erstattet');
  const sum = a => a.reduce((s, r) => s + (parseFloat(r.preis) || 0), 0);
  const now = new Date();
  const thisMonth = paid.filter(r => { const d = new Date(r.eingang); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const last30 = paid.filter(r => Date.now() - new Date(r.eingang) < 30 * 864e5);
  const refunded = rows.filter(r => r.status === 'erstattet');
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
    <p class="dim small">Umsatz ohne Gebühren (PayPal) und als Kleinunternehmer ohne Umsatzsteuer.</p>`;
}

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
  showApp(); render();
  refresh(true).then(() => { if (!lastSync) toast('Offline – zeige zuletzt geladenen Stand', 'bad'); });
  loadInbox(true);
} else { showGate(); }
