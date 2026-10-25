/* Teilenummer.Service – Buchhaltung (PWA)
   Gleiche Apps-Script-Schnittstelle wie die Verwaltungs-App (JSONP + Admin-Schlüssel). */
'use strict';
const APP_VERSION = '1.0 (25.10.2026)';
const API = 'https://script.google.com/macros/s/AKfycbz5uEEaTn5Pe-ec-33u-pvSRlJCKSAYdsRV3CgDyBfdfGwoHiEGjb46DXZIARyjO293aA/exec';
const KAT_FALLBACK = {
  Einnahme: ['Verkäufe (Teilenummer)', 'Sonstige Einnahmen'],
  Ausgabe: ['Werbung (z. B. Google Ads)', 'Gebühren (PayPal, Bank)', 'Software & Online-Dienste', 'Bürobedarf & Porto',
    'Telefon & Internet', 'Fremdleistungen', 'Arbeitsmittel bis 800 € netto', 'Fachliteratur & Fortbildung',
    'Versicherungen & Beiträge', 'Steuerberatung & Buchführung', 'Sonstige Betriebsausgaben']
};

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
let adminKey = store.get('tns_key', '');           // gleicher Schlüssel wie die Teilenummer-App (gleiche Domain)
let year = store.get('buch_year', new Date().getFullYear());
let data = store.get('buch_cache_' + year, null);
let listFilter = 'alle';
let editing = null;      // { id?, vorschlag? }
let upload = null;       // { id, promise, fileId }

/* ---------- Hilfen ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function euro(n) { return (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function dDe(iso) { return iso ? iso.split('-').reverse().join('.') : '–'; }
function todayIso() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function rid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^\w-]/g, ''); }
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (kind ? ' ' + kind : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}
function kats(art) {
  const k = data && data.kategorien && data.kategorien[art];
  return k ? Object.keys(k) : KAT_FALLBACK[art];
}

/* ---------- Schnittstelle ---------- */
function api(params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); };
    window[cb] = d => { done(); resolve(d); };
    s.src = API + '?' + new URLSearchParams({ ...params, admin: '1', key: adminKey, callback: cb });
    s.onerror = () => { done(); reject(new Error('Keine Verbindung')); };
    document.body.appendChild(s);
    setTimeout(() => { if (window[cb]) { done(); reject(new Error('Zeitüberschreitung')); } }, timeoutMs || 30000);
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
  adminKey = $('#keyInput').value.trim(); $('#gateError').textContent = 'Prüfe …';
  try {
    const r = await api({ action: 'buchList', year });
    if (!r.ok) { $('#gateError').textContent = r.error === 'unauthorized' ? 'Falscher Schlüssel.' : 'Fehler: ' + r.error; return; }
    store.set('tns_key', adminKey); setData(r); showApp(); render(); sync();
  } catch (err) { $('#gateError').textContent = 'Fehler: ' + err.message; }
});
$('#logoutBtn').addEventListener('click', () => {
  if (!confirm('Abmelden? Der Schlüssel wird auf diesem Gerät entfernt (auch in der Verwaltungs-App).')) return;
  store.del('tns_key'); adminKey = ''; showGate();
});

/* ---------- Laden ---------- */
function setData(r) { data = r; store.set('buch_cache_' + year, r); }
let loading = false;
async function load(silent) {
  if (loading || !adminKey) return; loading = true; $('#refreshBtn').classList.add('spin');
  try {
    const r = await api({ action: 'buchList', year });
    if (!r.ok) {
      if (r.error === 'unauthorized') { store.del('tns_key'); adminKey = ''; showGate('Schlüssel ungültig – bitte neu anmelden.'); return; }
      throw new Error(r.error || 'Fehler');
    }
    setData(r); render();
    $('#syncInfo').textContent = 'Stand ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' · Version ' + APP_VERSION;
  } catch (err) { if (!silent) toast('Laden fehlgeschlagen: ' + err.message, 'bad'); }
  finally { loading = false; $('#refreshBtn').classList.remove('spin'); }
}
/** Holt neue Verkäufe und E-Mail-Rechnungen (läuft im Hintergrund, dauert ggf. etwas). */
let syncing = false;
async function sync() {
  if (syncing || !adminKey) return; syncing = true;
  try {
    const r = await api({ action: 'buchSync' }, 90000);
    const s = r && r.sync;
    if (s && (s.verkaeufe || (s.gmail && s.gmail.length))) {
      await load(true);
      const parts = [];
      if (s.verkaeufe) parts.push(s.verkaeufe + ' automatisch gebucht');
      if (s.gmail && s.gmail.length) parts.push(s.gmail.length + ' neue Belege aus E-Mails');
      toast(parts.join(' · '), 'ok');
    }
  } catch (e) {} finally { syncing = false; }
}

/* ---------- Anzeige ---------- */
function itemHtml(b) {
  const ein = b.art === 'Einnahme';
  const nob = !b.belegLink && !/\(auto\)/.test(b.quelle || '');
  return `<div class="item" data-id="${esc(b.id)}">
    <div><div class="t">${esc(b.partner || b.kategorie)}</div>
      <div class="s">${dDe(b.datum)} · ${esc(b.kategorie)}${b.beschreibung ? ' · ' + esc(b.beschreibung) : ''}${nob ? ' <span class="nobeleg">· ohne Beleg</span>' : ''}</div></div>
    <div class="b ${ein ? 'ein' : ''}">${ein ? '' : '− '}${euro(b.betrag)}</div></div>`;
}
function render() {
  if (!data) return;
  const yrs = (data.jahre && data.jahre.length ? data.jahre : [String(year)]);
  $('#yearSel').innerHTML = yrs.map(y => `<option ${String(y) === String(year) ? 'selected' : ''}>${y}</option>`).join('');
  const r = data.report || {};
  $('#kEin').textContent = euro(r.einnahmen); $('#kAus').textContent = euro(r.ausgaben);
  $('#kGew').textContent = euro(r.gewinn); $('#kGew').className = (r.gewinn || 0) >= 0 ? 'pos' : 'neg';
  // Vorschläge
  const v = data.vorschlaege || [];
  $('#vorBox').hidden = !v.length;
  $('#vorTitle').textContent = v.length === 1 ? '1 Beleg wartet auf Bestätigung' : v.length + ' Belege warten auf Bestätigung';
  $('#vorList').innerHTML = v.map(b => `<div class="vor" data-id="${esc(b.id)}">
    <div class="l1"><span>${esc(b.partner || 'Unbekannt')}</span><span>${b.betrag ? euro(b.betrag) : 'Betrag?'}</span></div>
    <div class="l2">${dDe(b.datum)} · ${esc(b.kategorie)}${b.rc ? ' · Reverse Charge' : ''}<br>${esc(b.beschreibung || '')}</div>
    <div class="bt"><button class="btn" data-a="ok">✓ Übernehmen</button><button class="btn ghost" data-a="edit">Ändern</button>
      ${b.belegLink ? `<a class="btn ghost" href="${esc(b.belegLink)}" target="_blank" rel="noopener">Beleg</a>` : ''}
      <button class="btn ghost danger" data-a="no">✕</button></div></div>`).join('');
  // Zuletzt
  const rows = data.rows || [];
  $('#recentList').innerHTML = rows.slice(0, 6).map(itemHtml).join('') || '<p class="dim small">Noch keine Buchungen in ' + year + '.</p>';
  renderList(); renderReport();
}
function renderList() {
  const q = ($('#search').value || '').toLowerCase().trim();
  let rows = (data && data.rows) || [];
  if (listFilter === 'Einnahme' || listFilter === 'Ausgabe') rows = rows.filter(b => b.art === listFilter);
  if (listFilter === 'ohne') rows = rows.filter(b => !b.belegLink && !/\(auto\)/.test(b.quelle || ''));
  if (q) rows = rows.filter(b => [b.partner, b.beschreibung, b.kategorie, b.notiz, String(b.betrag).replace('.', ',')].join(' ').toLowerCase().includes(q));
  let html = '', mon = '';
  rows.forEach(b => {
    const m = b.datum.slice(0, 7);
    if (m !== mon) {
      mon = m;
      const sum = rows.filter(x => x.datum.slice(0, 7) === m).reduce((s, x) => s + (x.art === 'Einnahme' ? x.betrag : -x.betrag), 0);
      html += `<div class="month"><span>${new Date(m + '-15').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</span><span>${euro(sum)}</span></div>`;
    }
    html += itemHtml(b);
  });
  $('#fullList').innerHTML = html || '<p class="dim small">Keine Buchungen gefunden.</p>';
}
function renderReport() {
  const r = (data && data.report) || {};
  $('#rYear').textContent = year;
  const eu = Object.entries(r.euer || {}).sort();
  $('#euerTable').innerHTML = '<table>' + eu.map(([k, v]) => { const [art, feld] = k.split('|'); return `<tr><td>${art === 'Einnahme' ? '➕' : '➖'} ${esc(feld)}</td><td class="r">${euro(v)}</td></tr>`; }).join('') +
    `<tr><td><b>Gewinn</b></td><td class="r"><b>${euro(r.gewinn)}</b></td></tr></table>`;
  let w = '';
  if (r.ohneBeleg) w += `<div class="warn">⚠️ ${r.ohneBeleg} Buchung(en) ohne Beleg – unter „Buchungen → Ohne Beleg“ nachreichen, falls vorhanden.</div>`;
  if (r.reverseCharge) w += `<div class="warn">⚠️ Reverse Charge: ${euro(r.reverseCharge)} Ausgaben ohne MwSt. aus dem EU-Ausland. Darauf schuldest du ca. ${euro(r.ustReverseCharge)} Umsatzsteuer (Voranmeldung/Erklärung).</div>`;
  $('#rWarn').innerHTML = w;
  const kt = Object.entries(r.kategorien || {}).sort();
  $('#katTable').innerHTML = '<table>' + kt.map(([k, v]) => { const [art, kat] = k.split('|'); return `<tr><td>${art === 'Einnahme' ? '➕' : '➖'} ${esc(kat)}</td><td class="r">${euro(v)}</td></tr>`; }).join('') + '</table>';
  if (data && data.sheetUrl) { $('#sheetLink').href = data.sheetUrl; $('#folderLink').href = data.folderUrl; }
}

/* ---------- Navigation ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showView(b.dataset.v)));
function showView(v) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== 'v-' + v; });
  window.scrollTo(0, 0);
}
$('#refreshBtn').addEventListener('click', () => { load(); sync(); });
$('#yearSel').addEventListener('change', e => { year = Number(e.target.value); store.set('buch_year', year); data = store.get('buch_cache_' + year, data); render(); load(); });
$('#search').addEventListener('input', renderList);
$('#artChips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  listFilter = b.dataset.f; document.querySelectorAll('#artChips .chip').forEach(c => c.classList.toggle('on', c === b)); renderList();
});
function findRow(id) { return ((data && data.rows) || []).concat((data && data.vorschlaege) || []).find(b => b.id === id); }
document.addEventListener('click', e => {
  const it = e.target.closest('.item'); if (it) { const b = findRow(it.dataset.id); if (b) openSheet(b); return; }
  const btn = e.target.closest('.vor button'); if (!btn) return;
  const b = findRow(btn.closest('.vor').dataset.id); if (!b) return;
  if (btn.dataset.a === 'edit') openSheet(b);
  else if (btn.dataset.a === 'ok') { if (!b.betrag) openSheet(b); else saveRow(b); }
  else if (btn.dataset.a === 'no') { if (confirm('Diesen Vorschlag verwerfen? (Kein Geschäftsbeleg)')) removeRow(b.id); }
});

/* ---------- Erfassen ---------- */
function fillKat(art, sel) {
  $('#fKat').innerHTML = kats(art).map(k => `<option ${k === sel ? 'selected' : ''}>${esc(k)}</option>`).join('');
}
function setArt(art) { document.querySelector(`input[name=art][value="${art}"]`).checked = true; fillKat(art); $('#fRc').closest('label').hidden = art !== 'Ausgabe'; }
document.querySelectorAll('input[name=art]').forEach(r => r.addEventListener('change', () => setArt(r.value)));
function openSheet(b, opts) {
  b = b || {}; opts = opts || {};
  editing = b.id ? { id: b.id, vorschlag: b.status === 'Vorschlag' } : {};
  if (!b.id) upload = opts.keepUpload ? upload : null;
  $('#sheetTitle').textContent = b.id ? (b.status === 'Vorschlag' ? 'Beleg prüfen' : 'Buchung bearbeiten') : 'Neue Buchung';
  setArt(b.art || 'Ausgabe'); fillKat(b.art || 'Ausgabe', b.kategorie);
  $('#fBetrag').value = b.betrag ? String(Number(b.betrag).toFixed(2)).replace('.', ',') : '';
  $('#fDatum').value = b.datum || todayIso();
  $('#fPartner').value = b.partner || ''; $('#fBeschr').value = b.beschreibung || ''; $('#fNotiz').value = b.notiz || '';
  $('#fZahl').value = b.zahlungsart ?? store.get('buch_zahl', 'PayPal');
  $('#fRc').checked = !!b.rc;
  $('#delBtn').hidden = !b.id;
  const auto = /auto/.test(b.quelle || '');
  $('#belegState').hidden = !(b.belegLink || auto || opts.state);
  $('#belegState').innerHTML = opts.state || (b.belegLink ? `📎 <a href="${esc(b.belegLink)}" target="_blank" rel="noopener">Beleg ansehen</a>` : '') +
    (auto ? ' <span class="dim small">Automatisch gebucht (' + esc(b.quelle) + ')</span>' : '');
  $('#sheet').hidden = false;
  if (!b.id && !opts.state) setTimeout(() => $('#fBetrag').focus(), 150);
}
$('#sheetClose').addEventListener('click', () => { $('#sheet').hidden = true; });
$('#addAus').addEventListener('click', () => openSheet({ art: 'Ausgabe' }));
$('#addEin').addEventListener('click', () => openSheet({ art: 'Einnahme', kategorie: 'Sonstige Einnahmen', zahlungsart: 'Überweisung' }));

function formValues() {
  return {
    art: document.querySelector('input[name=art]:checked').value, betrag: $('#fBetrag').value.trim(), datum: $('#fDatum').value,
    partner: $('#fPartner').value.trim(), kategorie: $('#fKat').value, beschreibung: $('#fBeschr').value.trim(),
    zahlungsart: $('#fZahl').value, notiz: $('#fNotiz').value.trim(), rc: $('#fRc').checked ? '1' : ''
  };
}
$('#bForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = formValues();
  if (!v.betrag) { toast('Bitte Betrag eintragen.', 'bad'); return; }
  $('#saveBtn').disabled = true; $('#saveBtn').textContent = 'Speichert …';
  try {
    if (upload && !upload.fileId) {
      $('#saveBtn').textContent = 'Beleg wird noch hochgeladen …';
      await upload.promise.catch(() => {});
    }
    const p = { action: 'buchSave', ...v };
    if (editing && editing.id) p.id = editing.id;
    if (upload && upload.fileId && !(editing && editing.id)) p.belegId = upload.fileId;
    const r = await api(p);
    if (!r.ok) throw new Error(r.error);
    store.set('buch_zahl', v.zahlungsart);
    $('#sheet').hidden = true; upload = null;
    toast(editing && editing.vorschlag ? 'Übernommen ✓' : 'Gespeichert ✓', 'ok');
    load(true);
  } catch (err) { toast('Nicht gespeichert: ' + err.message, 'bad'); }
  finally { $('#saveBtn').disabled = false; $('#saveBtn').textContent = 'Speichern'; }
});
async function saveRow(b) {
  try {
    const r = await api({ action: 'buchSave', id: b.id, art: b.art, betrag: String(b.betrag), datum: b.datum, partner: b.partner || '',
      kategorie: b.kategorie, beschreibung: b.beschreibung || '', zahlungsart: b.zahlungsart || '', notiz: b.notiz || '', rc: b.rc ? '1' : '' });
    if (!r.ok) throw new Error(r.error);
    toast('Übernommen ✓', 'ok'); load(true);
  } catch (err) { toast('Fehler: ' + err.message, 'bad'); }
}
async function removeRow(id) {
  try { const r = await api({ action: 'buchDelete', id }); if (!r.ok) throw new Error(r.error); $('#sheet').hidden = true; toast('Entfernt', 'ok'); load(true); }
  catch (err) { toast('Fehler: ' + err.message, 'bad'); }
}
$('#delBtn').addEventListener('click', () => {
  if (editing && editing.id && confirm('Diese Buchung entfernen? Der Beleg bleibt im Drive-Ordner erhalten.')) removeRow(editing.id);
});

/* ---------- Beleg: Foto / Datei ---------- */
function readAsDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
    img.src = url;
  });
}
async function handleFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf && file.size > 8 * 1024 * 1024) { toast('PDF ist größer als 8 MB.', 'bad'); return; }
  const id = rid();
  upload = { id, fileId: null };
  let dataUrl, thumb = '';
  try { dataUrl = isPdf ? await readAsDataUrl(file) : await compressImage(file, 1800, 0.8); }
  catch (e) { toast('Datei nicht lesbar: ' + e.message, 'bad'); upload = null; return; }
  if (!isPdf) thumb = `<img src="${dataUrl}" alt="">`;
  openSheet({ art: 'Ausgabe' }, { keepUpload: true, state: thumb + '<span id="ocrState">⏳ Beleg wird hochgeladen und gelesen …</span>' });
  upload.promise = (async () => {
    await postNoCors({ kind: 'buch_upload', adminKey, uploadId: id, filename: (isPdf ? file.name : 'beleg_' + todayIso() + '.jpg'),
      mimeType: isPdf ? 'application/pdf' : 'image/jpeg', dataUrl });
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, i < 3 ? 2500 : 2000));
      let r; try { r = await api({ action: 'buchUpload', uploadId: id }, 15000); } catch (e) { continue; }
      if (r && r.pending) continue;
      if (!r.ok) throw new Error(r.error || 'Upload fehlgeschlagen');
      return r;
    }
    throw new Error('Zeitüberschreitung beim Hochladen');
  })().then(r => {
    if (!upload || upload.id !== id) return r;
    upload.fileId = r.fileId;
    const v = r.vorschlag || {}, st = $('#ocrState');
    if (!$('#fBetrag').value && v.betrag) $('#fBetrag').value = String(v.betrag).replace('.', ',');
    if (v.datum && $('#fDatum').value === todayIso()) $('#fDatum').value = v.datum;
    if (!$('#fPartner').value && v.partner) $('#fPartner').value = v.partner;
    if (v.kategorie && document.querySelector('input[name=art]:checked').value === 'Ausgabe') fillKat('Ausgabe', v.kategorie);
    if (v.rc) $('#fRc').checked = true;
    if (st) st.innerHTML = (v.betrag ? '✅ Gelesen – bitte kurz prüfen und speichern. ' : '✅ Beleg gespeichert – Betrag bitte eintragen. ') +
      `<a href="${r.url}" target="_blank" rel="noopener">ansehen</a>`;
    return r;
  }).catch(err => { const st = $('#ocrState'); if (st) st.textContent = '⚠️ ' + err.message + ' – du kannst trotzdem speichern (ohne Beleg).'; if (upload && upload.id === id) upload = null; });
}
$('#camInput').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
$('#fileInput').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });

/* ---------- Export ---------- */
$('#exportBtn').addEventListener('click', async () => {
  const b = $('#exportBtn'); b.disabled = true; b.textContent = '⏳ Wird erstellt (kann 1 Min. dauern) …';
  try {
    const r = await api({ action: 'buchExport', year }, 180000);
    if (!r.ok) throw new Error(r.error);
    $('#exportOut').innerHTML = `<div class="out">✅ Fertig für ${year}:<br>📄 <a href="${r.pdfUrl}" target="_blank" rel="noopener">EÜR-Übersicht (PDF)</a>` +
      (r.zipUrl ? `<br>🗜️ <a href="${r.zipUrl}" target="_blank" rel="noopener">${r.anzahlBelege} Belege (ZIP)</a>` : '') + '<br><span class="dim small">Liegt auch im Drive-Ordner „Export“.</span></div>';
  } catch (err) { toast('Export fehlgeschlagen: ' + err.message, 'bad'); }
  finally { b.disabled = false; b.textContent = '📦 PDF + alle Belege (ZIP) erstellen'; }
});
$('#csvBtn').addEventListener('click', () => {
  const rows = (data && data.rows) || [];
  const head = ['Datum', 'Art', 'Betrag', 'Kategorie', 'Partner', 'Beschreibung', 'Bezahlt mit', 'Beleg', 'Quelle', 'Notiz'];
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [head.join(';')].concat(rows.slice().reverse().map(b => [dDe(b.datum), b.art, (b.art === 'Ausgabe' ? -b.betrag : b.betrag).toFixed(2).replace('.', ','),
    b.kategorie, b.partner, b.beschreibung, b.zahlungsart, b.belegLink, b.quelle, b.notiz].map(q).join(';')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Buchungen_' + year + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

/* ---------- Start ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (!adminKey) showGate();
else {
  showApp(); render(); load(); sync();
  if (location.hash === '#vorschlaege') setTimeout(() => { const v = $('#vorBox'); if (v && !v.hidden) v.scrollIntoView({ behavior: 'smooth' }); }, 1200);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && adminKey) load(true); });
